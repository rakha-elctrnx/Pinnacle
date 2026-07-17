//! Shared SSL/TLS configuration helpers for SQL connectors.
//!
//! Centralizes resolution of `payload.ssl_config` (with legacy `ssl: bool`
//! fallback) into sqlx `PgConnectOptions` / `MySqlConnectOptions` SSL settings.
//! Certificate/key files live on the user's disk; sqlx loads them at connect
//! time, so only file PATHS are stored (never cert content).
//!
//! Paths that fail `canonicalize()` (missing / unreadable file) are skipped
//! silently — the connection will then surface a meaningful sqlx error at
//! connect time, which is preferable to crashing while building options.

use sqlx::mysql::MySqlConnectOptions;
use sqlx::postgres::PgConnectOptions;

use crate::domain::query::ConnectionPayload;

/// Resolve `(mode, ca_path, client_cert_path, client_key_path)` from a payload.
///
/// Prefers `ssl_config` when present (empty mode => "require"); falls back to
/// the legacy `ssl: bool` field (`true` => "require", `false` => "disable")
/// for pre-task-041 connection profiles.
pub(crate) fn resolve_ssl(
    payload: &ConnectionPayload,
) -> (String, Option<String>, Option<String>, Option<String>) {
    if let Some(ssl) = &payload.ssl_config {
        let mode = if ssl.mode.is_empty() {
            "require".to_string()
        } else {
            ssl.mode.clone()
        };
        (
            mode,
            ssl.ca_cert_path.clone(),
            ssl.client_cert_path.clone(),
            ssl.client_key_path.clone(),
        )
    } else if payload.ssl {
        ("require".to_string(), None, None, None)
    } else {
        ("disable".to_string(), None, None, None)
    }
}

/// Apply `cert_path` to `options` via `apply` iff the path canonicalizes to an
/// existing file; otherwise return `options` unchanged.
fn with_cert<O, F>(options: O, cert_path: &Option<String>, apply: F) -> O
where
    F: FnOnce(O, std::path::PathBuf) -> O,
{
    match cert_path {
        Some(p) => match std::path::Path::new(p).canonicalize() {
            Ok(c) => apply(options, c),
            // Missing/unreadable cert — skip; sqlx will error meaningfully later.
            Err(_) => options,
        },
        None => options,
    }
}

/// Apply SSL/TLS configuration to `PgConnectOptions`.
pub(crate) fn apply_pg_ssl(
    options: PgConnectOptions,
    payload: &ConnectionPayload,
) -> PgConnectOptions {
    use sqlx::postgres::PgSslMode;

    let (mode, ca, cert, key) = resolve_ssl(payload);
    let pg_mode = match mode.as_str() {
        "disable" => PgSslMode::Disable,
        "prefer" => PgSslMode::Prefer,
        "require" => PgSslMode::Require,
        "verify-ca" => PgSslMode::VerifyCa,
        "verify-full" => PgSslMode::VerifyFull,
        // Unknown mode — safest non-disabling default.
        _ => PgSslMode::Prefer,
    };
    let options = options.ssl_mode(pg_mode);
    let options = with_cert(options, &ca, |o, c| o.ssl_root_cert(c));
    let options = with_cert(options, &cert, |o, c| o.ssl_client_cert(c));
    let options = with_cert(options, &key, |o, c| o.ssl_client_key(c));
    options
}

/// Apply SSL/TLS configuration to `MySqlConnectOptions`.
pub(crate) fn apply_mysql_ssl(
    options: MySqlConnectOptions,
    payload: &ConnectionPayload,
) -> MySqlConnectOptions {
    use sqlx::mysql::MySqlSslMode;

    let (mode, ca, cert, key) = resolve_ssl(payload);
    // `verify-full` maps to MySQL's `VerifyIdentity` (CA + hostname check);
    // there is no distinct "verify-full" variant in MySqlSslMode.
    let mysql_mode = match mode.as_str() {
        "disable" => MySqlSslMode::Disabled,
        "prefer" => MySqlSslMode::Preferred,
        "require" => MySqlSslMode::Required,
        "verify-ca" => MySqlSslMode::VerifyCa,
        "verify-full" => MySqlSslMode::VerifyIdentity,
        _ => MySqlSslMode::Preferred,
    };
    let options = options.ssl_mode(mysql_mode);
    let options = with_cert(options, &ca, |o, c| o.ssl_ca(c));
    let options = with_cert(options, &cert, |o, c| o.ssl_client_cert(c));
    let options = with_cert(options, &key, |o, c| o.ssl_client_key(c));
    options
}

/// Build `MySqlConnectOptions` from a payload, honoring `host_override`
/// (SSH-tunnel local addr) and SSL/TLS configuration.
pub(crate) fn build_mysql_options(
    payload: &ConnectionPayload,
    host_override: Option<(&str, u16)>,
) -> MySqlConnectOptions {
    let (host, port) = host_override.unwrap_or((payload.host.as_str(), payload.port));
    let options = MySqlConnectOptions::new()
        .host(host)
        .port(port)
        .username(payload.username.as_str())
        .password(payload.password.as_str())
        .database(payload.database.as_str());
    apply_mysql_ssl(options, payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::query::SslConfig;

    fn payload(ssl: bool, ssl_config: Option<SslConfig>) -> ConnectionPayload {
        ConnectionPayload {
            r#type: "postgresql".into(),
            host: "localhost".into(),
            port: 5432,
            username: "u".into(),
            password: "p".into(),
            database: "db".into(),
            ssl,
            schema: String::new(),
            ssh: None,
            connection_id: None,
            ssl_config,
            pool_size: None,
            idle_timeout_secs: None,
        }
    }

    #[test]
    fn resolve_ssl_falls_back_to_legacy_bool_true() {
        let p = payload(true, None);
        let (mode, ca, cert, key) = resolve_ssl(&p);
        assert_eq!(mode, "require");
        assert!(ca.is_none() && cert.is_none() && key.is_none());
    }

    #[test]
    fn resolve_ssl_falls_back_to_legacy_bool_false() {
        let p = payload(false, None);
        assert_eq!(resolve_ssl(&p).0, "disable");
    }

    #[test]
    fn resolve_ssl_prefers_ssl_config_over_legacy_bool() {
        let p = payload(
            true,
            Some(SslConfig {
                mode: "verify-full".into(),
                ca_cert_path: Some("/x/ca.pem".into()),
                client_cert_path: Some("/x/cert.pem".into()),
                client_key_path: Some("/x/key.pem".into()),
            }),
        );
        let (mode, ca, cert, key) = resolve_ssl(&p);
        assert_eq!(mode, "verify-full");
        assert_eq!(ca.as_deref(), Some("/x/ca.pem"));
        assert_eq!(cert.as_deref(), Some("/x/cert.pem"));
        assert_eq!(key.as_deref(), Some("/x/key.pem"));
    }

    #[test]
    fn resolve_ssl_empty_mode_defaults_to_require() {
        let p = payload(
            false,
            Some(SslConfig {
                mode: String::new(),
                ca_cert_path: None,
                client_cert_path: None,
                client_key_path: None,
            }),
        );
        assert_eq!(resolve_ssl(&p).0, "require");
    }
}
