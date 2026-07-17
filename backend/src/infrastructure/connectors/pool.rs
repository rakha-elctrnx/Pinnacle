//! SQL connection pooling with keep-alive, retry, and health tracking.
//!
//! One pool per saved `connection_id` (test-connection-before-save stays ad-hoc —
//! no `connection_id` means no pool entry). Each entry owns its SSH `TunnelHandle`
//! so tunnels persist for the pool's lifetime rather than being re-opened per query.
//!
//! Keep-alive: `test_before_acquire(true)` pings pooled conns before handing them
//! out, evicting dead ones (covers VPN timeout / idle server drops). `idle_timeout`
//! reaps idle conns; `max_lifetime` recycles aged conns.
//!
//! Retry: `with_retry` wraps a fallible DB op, retrying up to 3 times on transient
//! errors (`PoolTimedOut`, `Io`, connection-closed refs) with exponential backoff.

use std::collections::HashMap;
use std::future::Future;
use std::sync::LazyLock;
use std::time::Duration;

use sqlx::pool::PoolOptions;
use sqlx::{MySqlPool, PgPool};
use tokio::sync::Mutex;

use crate::core::{error::AppError, result::AppResult};
use crate::domain::query::ConnectionPayload;

use super::ssh::TunnelHandle;

pub const DEFAULT_POOL_SIZE: u32 = 10;
pub const DEFAULT_IDLE_TIMEOUT_SECS: u64 = 300;
pub const DEFAULT_MAX_LIFETIME_SECS: u64 = 1800;
const MAX_RETRIES: u32 = 3;
const INITIAL_BACKOFF_MS: u64 = 100;

/// A live pool. `Clone` is cheap (sqlx Pool is internally Arc'd).
#[derive(Clone)]
pub enum PooledDb {
    Pg(PgPool),
    MySql(MySqlPool),
}

struct PoolEntry {
    db: PooledDb,
    /// Holds the SSH tunnel alive for the pool's lifetime.
    _tunnel: Option<TunnelHandle>,
    health: HealthState,
}

/// Health snapshot for status-bar polling.
#[derive(Debug, Clone, serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HealthState {
    pub state: String,
    pub last_error: Option<String>,
    pub last_checked_at: String,
}

#[derive(Default)]
struct PoolRegistry {
    inner: Mutex<HashMap<String, PoolEntry>>,
}

static REGISTRY: LazyLock<PoolRegistry> = LazyLock::new(PoolRegistry::default);

/// Get the pool for `payload.connection_id`, creating it lazily on first use.
/// Returns `None` when `connection_id` is absent (test-before-save flow —
/// caller falls back to ad-hoc connections).
pub async fn get_or_create(
    payload: &ConnectionPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<Option<PooledDb>> {
    let id = match &payload.connection_id {
        Some(id) => id.clone(),
        None => return Ok(None),
    };

    // Fast path: pool already exists.
    {
        let guard = REGISTRY.inner.lock().await;
        if let Some(entry) = guard.get(&id) {
            return Ok(Some(entry.db.clone()));
        }
    }

    let (db, tunnel) = build_pool(payload, ssh_password, key_passphrase).await?;

    let mut guard = REGISTRY.inner.lock().await;
    // Another task may have raced us — reuse its pool if so.
    if let Some(existing) = guard.get(&id) {
        return Ok(Some(existing.db.clone()));
    }
    guard.insert(
        id,
        PoolEntry {
            db: db.clone(),
            _tunnel: tunnel,
            health: HealthState {
                state: "connected".into(),
                last_error: None,
                last_checked_at: chrono::Utc::now().to_rfc3339(),
            },
        },
    );
    Ok(Some(db))
}

async fn build_pool(
    payload: &ConnectionPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<(PooledDb, Option<TunnelHandle>)> {
    let (host, port, tunnel) =
        super::sql::resolve_connect_addr(payload, ssh_password, key_passphrase).await?;

    let pool_size = payload.pool_size.unwrap_or(DEFAULT_POOL_SIZE);
    let idle_timeout = Duration::from_secs(
        payload.idle_timeout_secs.unwrap_or(DEFAULT_IDLE_TIMEOUT_SECS),
    );
    let max_lifetime = Duration::from_secs(DEFAULT_MAX_LIFETIME_SECS);

    match payload.r#type.as_str() {
        "postgresql" => {
            let opts =
                super::postgresql::build_connection_options(payload, Some((&host, port)));
            let pool = PoolOptions::<sqlx::Postgres>::new()
                .max_connections(pool_size)
                .min_connections(1)
                .idle_timeout(Some(idle_timeout))
                .max_lifetime(Some(max_lifetime))
                .test_before_acquire(true)
                .connect_with(opts)
                .await?;
            Ok((PooledDb::Pg(pool), tunnel))
        }
        "mysql" => {
            let opts = super::ssl::build_mysql_options(payload, Some((&host, port)));
            let pool = PoolOptions::<sqlx::MySql>::new()
                .max_connections(pool_size)
                .min_connections(1)
                .idle_timeout(Some(idle_timeout))
                .max_lifetime(Some(max_lifetime))
                .test_before_acquire(true)
                .connect_with(opts)
                .await?;
            Ok((PooledDb::MySql(pool), tunnel))
        }
        _ => Err(AppError::UnsupportedDriver(payload.r#type.clone())),
    }
}

/// Drop the pool + tunnel for a connection (disconnect command + app shutdown).
pub async fn disconnect(connection_id: &str) {
    let mut guard = REGISTRY.inner.lock().await;
    guard.remove(connection_id);
}

/// Drop all pools (app shutdown).
pub async fn disconnect_all() {
    let mut guard = REGISTRY.inner.lock().await;
    guard.clear();
}

/// Current health snapshot for a connection.
pub async fn health(connection_id: &str) -> HealthState {
    let guard = REGISTRY.inner.lock().await;
    guard
        .get(connection_id)
        .map(|e| e.health.clone())
        .unwrap_or_default()
}

/// Mark a connection as unhealthy after a failed op (pool will self-heal on
/// next acquire via `test_before_acquire`).
pub async fn mark_unhealthy(connection_id: &str, err: &str) {
    let mut guard = REGISTRY.inner.lock().await;
    if let Some(entry) = guard.get_mut(connection_id) {
        entry.health = HealthState {
            state: "reconnecting".into(),
            last_error: Some(err.to_string()),
            last_checked_at: chrono::Utc::now().to_rfc3339(),
        };
    }
}

/// Mark healthy after a successful op.
pub async fn mark_healthy(connection_id: &str) {
    let mut guard = REGISTRY.inner.lock().await;
    if let Some(entry) = guard.get_mut(connection_id) {
        entry.health = HealthState {
            state: "connected".into(),
            last_error: None,
            last_checked_at: chrono::Utc::now().to_rfc3339(),
        };
    }
}

/// Retry a fallible DB op up to 3 times on transient errors with exponential
/// backoff (100/200/400 ms). Non-transient errors return immediately.
pub async fn with_retry<F, Fut, T>(mut f: F) -> AppResult<T>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = AppResult<T>>,
{
    let mut delay = INITIAL_BACKOFF_MS;
    let mut last_err: Option<AppError> = None;

    for attempt in 0..=MAX_RETRIES {
        match f().await {
            Ok(v) => return Ok(v),
            Err(e) => {
                let transient = is_transient(&e);
                last_err = Some(e);
                if !transient || attempt == MAX_RETRIES {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(delay)).await;
                delay *= 2;
            }
        }
    }
    Err(last_err.expect("retry loop ran at least once"))
}

/// Heuristic: substring match on the stringified `AppError` for transient
/// conditions the pool can self-heal from.
fn is_transient(err: &AppError) -> bool {
    let msg = err.to_string().to_lowercase();
    msg.contains("timed out")
        || msg.contains("pool timed out")
        || msg.contains("connection refused")
        || msg.contains("connection reset")
        || msg.contains("broken pipe")
        || msg.contains("server has gone away")
        || msg.contains("eof")
        || msg.contains("io error")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transient_detection() {
        assert!(is_transient(&AppError::Database(
            "pool timed out while waiting for connection".into()
        )));
        assert!(is_transient(&AppError::Io(
            "connection reset by peer".into()
        )));
        assert!(!is_transient(&AppError::InvalidInput("bad sql".into())));
        assert!(!is_transient(&AppError::UnsupportedDriver("foo".into())));
    }

    #[tokio::test]
    async fn retry_succeeds_on_second_attempt() {
        let mut calls = 0;
        let result: AppResult<u32> = with_retry(|| {
            calls += 1;
            async move {
                if calls < 2 {
                    Err(AppError::Io("connection reset".into()))
                } else {
                    Ok(42)
                }
            }
        })
        .await;
        assert_eq!(result.unwrap(), 42);
        assert_eq!(calls, 2);
    }

    #[tokio::test]
    async fn retry_exhausts_on_persistent_error() {
        let mut calls = 0;
        let result: AppResult<()> = with_retry(|| {
            calls += 1;
            async move {
                let _ = calls;
                Err(AppError::Io("connection reset".into()))
            }
        })
        .await;
        assert!(result.is_err());
        // 1 initial + 3 retries = 4
        assert_eq!(calls, 4);
    }

    #[tokio::test]
    async fn retry_does_not_retry_non_transient() {
        let mut calls = 0;
        let result: AppResult<()> = with_retry(|| {
            calls += 1;
            async move {
                let _ = calls;
                Err(AppError::InvalidInput("bad input".into()))
            }
        })
        .await;
        assert!(result.is_err());
        assert_eq!(calls, 1);
    }
}
