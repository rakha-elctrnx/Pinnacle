use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
pub enum AppError {
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("unsupported driver: {0}")]
    UnsupportedDriver(String),
    #[error("database error: {0}")]
    Database(String),
    #[error("http error: {0}")]
    Http(String),
    #[error("export error: {0}")]
    Export(String),
    #[error("io error: {0}")]
    Io(String),
    #[error("ssh error: {0}")]
    Ssh(String),
}

// ── Database error sanitizer ────────────────────────────────────────
//
// Raw driver errors (sqlx) can embed connection URLs (`postgres://user:
// secret@host/db`), usernames, passwords, host names, and driver internals.
// Everything that reaches the frontend must instead be one of the stable,
// actionable category messages below. The sanitizer NEVER interpolates
// driver-supplied text into its output, so no credential material can leak
// by construction.

const MSG_INVALID_CONFIG: &str = "Invalid database connection settings.";
const MSG_AUTH_FAILED: &str =
    "Authentication failed. Re-check the database username and password.";
const MSG_CONN_REFUSED: &str =
    "Connection refused. Could not reach the database server; verify host and port.";
const MSG_CONN_RESET: &str = "Connection reset by the database server. Please retry.";
const MSG_IO: &str = "io error while communicating with the database.";
const MSG_TIMEOUT: &str = "Database operation timed out.";
const MSG_POOL_CLOSED: &str = "The database connection pool is closed. Reconnect and retry.";
const MSG_WORKER_CRASHED: &str = "A background database worker crashed. Please retry.";
const MSG_UNIQUE_VIOLATION: &str = "A record with the same unique value already exists.";
const MSG_NOT_NULL_VIOLATION: &str = "A required value is missing for a NOT NULL column.";
const MSG_FOREIGN_KEY_VIOLATION: &str =
    "This operation is blocked by a foreign key constraint on a related table.";
const MSG_CHECK_VIOLATION: &str = "This operation violates a check constraint on this table.";
const MSG_QUERY_FAILED: &str = "The database operation failed. Review the statement and retry.";

// NOTE: MSG_CONN_REFUSED, MSG_CONN_RESET, MSG_IO and MSG_TIMEOUT intentionally
// retain the phrases ("connection refused", "connection reset", "io error",
// "timed out") that `infrastructure::connectors::pool::is_transient` matches
// on, so automatic pool retry semantics survive sanitization unchanged.

/// Convert a raw [`sqlx::Error`] into a frontend-safe [`AppError`].
///
/// Stable categories: authentication · connection refused/unavailable ·
/// timeout · constraint violation · generic database/query failure.
pub fn sanitize_sqlx_error(err: &sqlx::Error) -> AppError {
    use sqlx::error::ErrorKind;

    match err {
        sqlx::Error::Configuration(_) => AppError::InvalidInput(MSG_INVALID_CONFIG.to_string()),
        sqlx::Error::Database(db) => {
            let state = db.code().map(|c| c.to_string()).unwrap_or_default();
            let message = db.message();
            let auth_failed = matches!(state.as_str(), "28P01" | "28000")
                || {
                    let m = message.to_lowercase();
                    m.contains("password authentication failed")
                        || m.contains("authentication failed")
                        || m.contains("access denied")
                };
            if auth_failed {
                return AppError::Database(MSG_AUTH_FAILED.to_string());
            }
            match db.kind() {
                ErrorKind::UniqueViolation => {
                    AppError::Database(MSG_UNIQUE_VIOLATION.to_string())
                }
                ErrorKind::NotNullViolation => {
                    AppError::Database(MSG_NOT_NULL_VIOLATION.to_string())
                }
                ErrorKind::ForeignKeyViolation => {
                    AppError::Database(MSG_FOREIGN_KEY_VIOLATION.to_string())
                }
                ErrorKind::CheckViolation => AppError::Database(MSG_CHECK_VIOLATION.to_string()),
                ErrorKind::Other => classify_db_message(message),
                _ => AppError::Database(MSG_QUERY_FAILED.to_string()),
            }
        }
        sqlx::Error::Io(source) => match source.kind() {
            std::io::ErrorKind::ConnectionRefused => {
                AppError::Database(MSG_CONN_REFUSED.to_string())
            }
            std::io::ErrorKind::TimedOut => AppError::Database(MSG_TIMEOUT.to_string()),
            _ => AppError::Database(MSG_IO.to_string()),
        },
        sqlx::Error::PoolTimedOut => AppError::Database(MSG_TIMEOUT.to_string()),
        sqlx::Error::PoolClosed => AppError::Database(MSG_POOL_CLOSED.to_string()),
        sqlx::Error::WorkerCrashed => AppError::Database(MSG_WORKER_CRASHED.to_string()),
        _ => AppError::Database(MSG_QUERY_FAILED.to_string()),
    }
}

/// Keyword classifier for `ErrorKind::Other` database errors whose driver
/// text must not be surfaced. Only the stable category survives.
fn classify_db_message(message: &str) -> AppError {
    let m = message.to_lowercase();
    if m.contains("connection refused")
        || m.contains("error connecting to server")
        || m.contains("could not connect")
        || m.contains("no such host")
    {
        AppError::Database(MSG_CONN_REFUSED.to_string())
    } else if m.contains("timed out") || m.contains("timeout") {
        AppError::Database(MSG_TIMEOUT.to_string())
    } else if m.contains("connection reset")
        || m.contains("broken pipe")
        || m.contains("server has gone away")
        || m.contains("unexpected eof")
    {
        AppError::Database(MSG_CONN_RESET.to_string())
    } else {
        AppError::Database(MSG_QUERY_FAILED.to_string())
    }
}

impl From<sqlx::Error> for AppError {
    fn from(value: sqlx::Error) -> Self {
        sanitize_sqlx_error(&value)
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(value: serde_json::Error) -> Self {
        Self::Io(value.to_string())
    }
}

impl From<russh::Error> for AppError {
    fn from(value: russh::Error) -> Self {
        Self::Ssh(value.to_string())
    }
}

impl From<russh::keys::Error> for AppError {
    fn from(value: russh::keys::Error) -> Self {
        Self::Ssh(value.to_string())
    }
}

// ── MongoDB error normalization ─────────────────────────────────────
//
// Driver/server errors are mapped to stable, sanitized messages. The raw
// driver text is NEVER interpolated (it can embed URIs/credentials); only the
// server code plus a fixed category message reach the frontend. Fixable
// states the UI branches on: duplicate key (11000), document validation (121),
// unauthorized (13), namespace missing (26), namespace exists (48),
// max-time expiry (50).

/// Stable MongoDB error categories surfaced to the UI.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MongoErrorPayload {
    /// Server error code when known (e.g. 11000), else None.
    pub code: Option<i32>,
    /// Stable sanitized message for this category.
    pub message: String,
}

impl MongoErrorPayload {
    pub fn to_app_error(&self) -> AppError {
        AppError::Database(self.message.clone())
    }
}

/// Map a MongoDB driver/server error to a sanitized payload.
pub fn sanitize_mongo_error(err: &mongodb::error::Error) -> MongoErrorPayload {
    use mongodb::error::ErrorKind;

    // Command errors carry a server code; write failures carry one too
    // (either the write-concern failure or an individual write error).
    let server_code = match err.kind.as_ref() {
        ErrorKind::Command(command) => Some(command.code),
        ErrorKind::Write(mongodb::error::WriteFailure::WriteConcernError(wc)) => Some(wc.code),
        ErrorKind::Write(mongodb::error::WriteFailure::WriteError(we)) => Some(we.code),
        _ => None,
    };

    // Authentication failures: code 18 (AuthenticationFailed) or the driver's
    // explicit Authentication kind.
    if matches!(err.kind.as_ref(), ErrorKind::Authentication { .. }) {
        return MongoErrorPayload {
            code: server_code.or(Some(18)),
            message: MSG_MONGO_AUTH_FAILED.to_string(),
        };
    }

    if let Some(code) = server_code {
        let message = match code {
            11000 => "Duplicate key: a document with the same unique value already exists.",
            121 => "Document failed collection validation. Adjust the document or the validator.",
            13 => "Not authorized for this operation. Check user roles on this database.",
            26 => "Namespace not found. The database or collection does not exist.",
            48 => "A collection with this name already exists.",
            50 => "Operation exceeded maxTimeMS and was aborted.",
            _ => MSG_MONGO_SERVER,
        };
        return MongoErrorPayload {
            code: Some(code),
            message: message.to_string(),
        };
    }

    // No server code — classify by error kind. The driver text is never
    // surfaced, only its category.
    match err.kind.as_ref() {
        ErrorKind::DnsResolve { message, .. } => {
            if message.contains("SRV") || message.contains("_mongodb") {
                MongoErrorPayload {
                    code: None,
                    message: MSG_MONGO_SRV.to_string(),
                }
            } else {
                MongoErrorPayload {
                    code: None,
                    message: MSG_MONGO_DNS.to_string(),
                }
            }
        }
        ErrorKind::InvalidTlsConfig { .. } => MongoErrorPayload {
            code: None,
            message: MSG_MONGO_TLS.to_string(),
        },
        ErrorKind::InvalidArgument { .. } => MongoErrorPayload {
            code: None,
            message: MSG_INVALID_CONFIG.to_string(),
        },
        ErrorKind::Io(_) | ErrorKind::ConnectionPoolCleared { .. } => MongoErrorPayload {
            code: None,
            message: MSG_CONN_RESET.to_string(),
        },
        _ => {
            // ServerSelection and anything else: distinguish TLS handshake
            // failures hiding in the source chain, then fall back to
            // unreachable/generic.
            if is_tls_source(err) {
                return MongoErrorPayload {
                    code: None,
                    message: MSG_MONGO_TLS.to_string(),
                };
            }
            let text = err.to_string();
            if text.contains("timed out") || text.contains("timeout") {
                return MongoErrorPayload {
                    code: None,
                    message: MSG_TIMEOUT.to_string(),
                };
            }
            if matches!(err.kind.as_ref(), ErrorKind::ServerSelection { .. }) {
                return MongoErrorPayload {
                    code: None,
                    message: MSG_MONGO_UNREACHABLE.to_string(),
                };
            }
            MongoErrorPayload {
                code: None,
                message: MSG_MONGO_GENERIC.to_string(),
            }
        }
    }
}

fn is_tls_source(err: &mongodb::error::Error) -> bool {
    // The driver's nested `source` field is private; walk the public
    // `std::error::Error::source` chain instead (works because Error impls
    // thiserror's Error trait, exposing its boxed source).
    let mut cur: Option<&dyn std::error::Error> = Some(err);
    while let Some(e) = cur {
        let t = e.to_string();
        if t.contains("certificate")
            || t.contains("tls")
            || t.contains("TLS")
            || t.contains("handshake")
            || t.contains("unknown ca")
            || t.contains("UnknownIssuer")
        {
            return true;
        }
        cur = e.source();
    }
    false
}

const MSG_MONGO_AUTH_FAILED: &str =
    "MongoDB authentication failed. Re-check username and password.";
const MSG_MONGO_DNS: &str =
    "DNS lookup failed. Verify the hostname of the MongoDB deployment.";
const MSG_MONGO_SRV: &str =
    "SRV lookup failed. Verify the mongodb+srv hostname and DNS SRV records.";
const MSG_MONGO_UNREACHABLE: &str =
    "Could not reach any MongoDB server. Verify host, port, and network access.";
const MSG_MONGO_TLS: &str =
    "TLS handshake failed. Check certificates and TLS settings.";
const MSG_MONGO_SERVER: &str =
    "The MongoDB operation failed on the server. Review the request and retry.";
const MSG_MONGO_GENERIC: &str =
    "The MongoDB operation failed. Review the connection settings and retry.";

impl From<&mongodb::error::Error> for AppError {
    fn from(err: &mongodb::error::Error) -> Self {
        sanitize_mongo_error(err).to_app_error()
    }
}

impl From<mongodb::error::Error> for AppError {
    fn from(err: mongodb::error::Error) -> Self {
        sanitize_mongo_error(&err).to_app_error()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::borrow::Cow;
    /// Minimal `DatabaseError` mock so sanitizer tests can exercise the
    #[derive(Debug)]
    struct MockDbError {
        message: String,
        code: &'static str,
        kind_name: &'static str,
    }

    impl std::fmt::Display for MockDbError {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            write!(f, "{}", self.message)
        }
    }

    impl std::error::Error for MockDbError {}

    impl sqlx::error::DatabaseError for MockDbError {
        fn message(&self) -> &str {
            &self.message
        }

        fn code(&self) -> Option<Cow<'_, str>> {
            Some(Cow::Borrowed(self.code))
        }

        fn kind(&self) -> sqlx::error::ErrorKind {
            match self.kind_name {
                "unique" => sqlx::error::ErrorKind::UniqueViolation,
                "not_null" => sqlx::error::ErrorKind::NotNullViolation,
                "foreign_key" => sqlx::error::ErrorKind::ForeignKeyViolation,
                "check" => sqlx::error::ErrorKind::CheckViolation,
                _ => sqlx::error::ErrorKind::Other,
            }
        }

        fn as_error(&self) -> &(dyn std::error::Error + Send + Sync + 'static) {
            self
        }

        fn as_error_mut(&mut self) -> &mut (dyn std::error::Error + Send + Sync + 'static) {
            self
        }

        fn into_error(self: Box<Self>) -> Box<dyn std::error::Error + Send + Sync + 'static> {
            self
        }
    }

    fn db_error(code: &'static str, kind: &'static str, message: &str) -> sqlx::Error {
        sqlx::Error::Database(Box::new(MockDbError {
            message: message.to_string(),
            code,
            kind_name: kind,
        }))
    }

    /// Extract the sanitized body of a Database-category AppError.
    fn database_body(err: AppError) -> String {
        match err {
            AppError::Database(body) => body,
            other => panic!("expected AppError::Database, got {:?}", other),
        }
    }

    #[test]
    fn sanitize_pg_auth_state_to_stable_auth_message() {
        let err = db_error(
            "28P01",
            "other",
            "password authentication failed for user \"topsecret\" at postgres://user:pw@db.host/db",
        );
        let body = database_body(sanitize_sqlx_error(&err));
        assert!(body.contains("Authentication failed"));
        assert!(!body.contains("topsecret"));
        assert!(!body.contains("postgres://"));
        assert!(!body.contains("db.host"));
    }

    #[test]
    fn sanitize_mysql_access_denied_to_stable_auth_message() {
        let err = db_error(
            "28000",
            "other",
            "Access denied for user 'root'@'10.1.2.3' (using password: YES)",
        );
        let body = database_body(sanitize_sqlx_error(&err));
        assert!(body.contains("Authentication failed"));
        assert!(!body.contains("root"));
        assert!(!body.contains("10.1.2.3"));
    }

    #[test]
    fn sanitize_unique_violation_hides_row_values() {
        let err = db_error(
            "23505",
            "unique",
            "duplicate key value violates unique constraint \"users_email_key\"\nDETAIL: Key (email)=(secret@example.com) already exists.",
        );
        let body = database_body(sanitize_sqlx_error(&err));
        assert!(body.contains("same unique value already exists"));
        assert!(!body.contains("secret@example.com"));
        assert!(!body.contains("users_email_key"));
    }

    #[test]
    fn sanitize_not_null_and_fk_and_check_categories() {
        let not_null = db_error("23502", "not_null", "null value in column x");
        assert!(database_body(sanitize_sqlx_error(&not_null)).contains("NOT NULL"));

        let fk = db_error("23503", "foreign_key", "violates foreign key constraint");
        assert!(database_body(sanitize_sqlx_error(&fk)).contains("foreign key constraint"));

        let check = db_error("23514", "check", "violates check constraint");
        assert!(database_body(sanitize_sqlx_error(&check)).contains("check constraint"));
    }

    #[test]
    fn sanitize_io_connection_refused_strips_sample_postgres_url() {
        let err = sqlx::Error::Io(std::io::Error::new(
            std::io::ErrorKind::ConnectionRefused,
            "error connecting to server at postgres://user:secret@db.host:5432/appdb: Connection refused",
        ));
        let body = database_body(sanitize_sqlx_error(&err));
        assert!(body.contains("Connection refused"));
        // Retry-compat phrase preserved for pool::is_transient.
        assert!(body.to_lowercase().contains("connection refused"));
        assert!(!body.contains("user:secret"));
        assert!(!body.contains("postgres://"));
        assert!(!body.contains("db.host"));
    }

    #[test]
    fn sanitize_io_generic_error_strips_sample_mysql_url() {
        let err = sqlx::Error::Io(std::io::Error::other(
            "Can't reach server mysql://admin:hunter2@127.0.0.1:3306/shop",
        ));
        let body = database_body(sanitize_sqlx_error(&err));
        assert!(body.to_lowercase().starts_with("io error"));
        assert!(!body.contains("admin"));
        assert!(!body.contains("hunter2"));
        assert!(!body.contains("mysql://"));
        assert!(!body.contains("127.0.0.1"));
    }

    #[test]
    fn sanitize_pool_timeout_keeps_retry_trigger_phrase() {
        let body = database_body(sanitize_sqlx_error(&sqlx::Error::PoolTimedOut));
        assert!(body.to_lowercase().contains("timed out"));
    }

    #[test]
    fn sanitize_generic_db_error_drops_driver_text_and_urls() {
        let err = db_error(
            "XX000",
            "other",
            "internal detail postgres://svc:hunter2@private-host/prod crashed",
        );
        let body = database_body(sanitize_sqlx_error(&err));
        assert!(body.contains("database operation failed"));
        assert!(!body.contains("postgres://"));
        assert!(!body.contains("hunter2"));
        assert!(!body.contains("private-host"));
    }

    #[test]
    fn sanitize_classifies_connect_phase_message_as_connection_refused() {
        let err = db_error(
            "08006",
            "other",
            "error connecting to server 10.0.0.9:5432 (behind tunnel)",
        );
        let body = database_body(sanitize_sqlx_error(&err));
        assert!(body.contains("Connection refused"));
        assert!(!body.contains("10.0.0.9"));
    }

    #[test]
    fn from_sqlx_error_uses_sanitizer_not_raw_display() {
        let err: AppError = sqlx::Error::Io(std::io::Error::new(
            std::io::ErrorKind::ConnectionRefused,
            "boom postgres://user:secret@host/db",
        ))
        .into();
        let rendered = err.to_string();
        assert!(!rendered.contains("postgres://"));
        assert!(!rendered.contains("user:secret"));
        assert!(rendered.contains("Connection refused"));
    }
}
