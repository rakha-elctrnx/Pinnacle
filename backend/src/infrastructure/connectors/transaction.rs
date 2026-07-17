use std::collections::HashMap;
use std::sync::LazyLock;
use std::time::Instant;

use sqlx::{pool::PoolConnection, Column, Executor, Row};
use tokio::sync::Mutex;

use super::pool;

use crate::{
    core::{error::AppError, result::AppResult},
    domain::query::{
        ConnectionPayload, QueryResult, TransactionCommitResult, TransactionStepResult,
    },
};

use super::postgresql::{extract_pg_value, quote_identifier_pg};
use super::sql::extract_mysql_value;

// ── Helpers ──────────────────────────────────────────────────────

fn ensure_supported_driver(driver: &str) -> AppResult<()> {
    match driver {
        "postgresql" | "mysql" => Ok(()),
        other => Err(AppError::UnsupportedDriver(other.to_string())),
    }
}

fn is_read_query(sql: &str) -> bool {
    let trimmed = sql.trim().to_uppercase();
    trimmed.starts_with("SELECT")
        || trimmed.starts_with("SHOW")
        || trimmed.starts_with("DESCRIBE")
        || trimmed.starts_with("EXPLAIN")
        || trimmed.starts_with("WITH")
        || trimmed.starts_with("VALUES")
}

// ── Registry ─────────────────────────────────────────────────────

#[derive(Default)]
struct TransactionRegistry {
    inner: Mutex<HashMap<String, TransactionState>>,
}

/// Stores an open connection in transaction mode.
pub enum TransactionState {
    Pg {
        conn: PoolConnection<sqlx::Postgres>,
    },
    MySql {
        conn: PoolConnection<sqlx::MySql>,
    },
}

static REGISTRY: LazyLock<TransactionRegistry> = LazyLock::new(TransactionRegistry::default);

// ── Public API ───────────────────────────────────────────────────

pub async fn begin(payload: &ConnectionPayload) -> AppResult<String> {
    ensure_supported_driver(payload.r#type.as_str())?;

    let id = uuid::Uuid::new_v4().to_string();

    // Try pool first (saved connections); fall back to ad-hoc for test-before-save
    let pooled = pool::get_or_create(payload, None, None).await?;

    match payload.r#type.as_str() {
        "postgresql" => {
            let mut conn = match &pooled {
                Some(pool::PooledDb::Pg(p)) => p.acquire().await?,
                _ => {
                    // Ad-hoc fallback (no connection_id — test-before-save flow).
                    // We don't have a saved pool; create a single-shot lazy pool
                    // so the connection can live as a PoolConnection in the registry
                    // (drop returns it to the pool — never crashed mid-transaction).
                    let opts = super::postgresql::build_connection_options(payload, None);
                    let tmp = sqlx::Pool::<sqlx::Postgres>::connect_lazy_with(opts);
                    tmp.acquire().await?
                }
            };

            // Set search_path so unqualified table names resolve
            if !payload.schema.is_empty() {
                sqlx::query(&format!(
                    "SET search_path TO {}",
                    quote_identifier_pg(&payload.schema)
                ))
                .execute(&mut *conn)
                .await?;
            }

            sqlx::query("BEGIN").execute(&mut *conn).await?;

            REGISTRY
                .inner
                .lock()
                .await
                .insert(id.clone(), TransactionState::Pg { conn });
            Ok(id)
        }
        "mysql" => {
            let mut conn = match &pooled {
                Some(pool::PooledDb::MySql(p)) => p.acquire().await?,
                _ => {
                    // Ad-hoc fallback (no connection_id — test-before-save flow)
                    let opts = super::ssl::build_mysql_options(payload, None);
                    let tmp = sqlx::Pool::<sqlx::MySql>::connect_lazy_with(opts);
                    tmp.acquire().await?
                }
            };
            sqlx::query("BEGIN").execute(&mut *conn).await?;
            REGISTRY
                .inner
                .lock()
                .await
                .insert(id.clone(), TransactionState::MySql { conn });
            Ok(id)
        }
        _ => Err(AppError::UnsupportedDriver(payload.r#type.clone())),
    }
}
/// Execute one or more SQL statements inside an open transaction.
/// Splits on `;` and executes each statement sequentially.
/// Returns the last statement's result on success.
/// On any failure, returns the error with the failed statement's index.
/// Rollback is handled by the caller (`sql_execute_in_transaction` command).
pub async fn execute(
    transaction_id: &str,
    sql: &str,
) -> Result<TransactionStepResult, String> {
    let sql = sql.trim();
    if sql.is_empty() {
        return Err("No SQL to execute".to_string());
    }

    // Split on semicolons and filter empty statements
    let statements: Vec<&str> = sql
        .split(';')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();

    if statements.is_empty() {
        return Err("No SQL to execute".to_string());
    }

    let mut map = REGISTRY.inner.lock().await;
    let state = map.get_mut(&transaction_id.to_string()).ok_or_else(|| {
        "Transaction not found".to_string()
    })?;

    let total_start = Instant::now();
    let num_stmts = statements.len();

    match state {
        TransactionState::Pg { conn } => {
            for (i, stmt) in statements.iter().enumerate() {
                let is_last = i == num_stmts - 1;
                let read = is_read_query(stmt);

                if !is_last {
                    // Non-last statement — execute for side effects only
                    (&mut **conn).execute(sqlx::query(stmt))
                        .await
                        .map_err(|e| format!("[statement {}] {}", i, e))?;
                } else if read {
                    // Last read statement — return rows
                    let rows = (&mut **conn)
                        .fetch_all(sqlx::query(stmt))
                        .await
                        .map_err(|e| format!("[statement {}] {}", i, e))?;
                    let columns: Vec<String> = if let Some(first) = rows.first() {
                        first.columns().iter().map(|c| c.name().to_string()).collect()
                    } else {
                        vec![]
                    };
                    let json_rows: Vec<serde_json::Map<String, serde_json::Value>> = rows
                        .iter()
                        .map(|row| {
                            let mut map = serde_json::Map::new();
                            for col_name in &columns {
                                map.insert(col_name.clone(), extract_pg_value(row, col_name));
                            }
                            map
                        })
                        .collect();
                    let elapsed = total_start.elapsed().as_millis() as u64;
                    let count = json_rows.len() as u64;
                    return Ok(TransactionStepResult {
                        statement_index: i as u32,
                        success: true,
                        error: None,
                        elapsed_ms: elapsed,
                        query_result: Some(QueryResult {
                            rows_affected: count,
                            elapsed_ms: total_start.elapsed().as_millis(),
                            columns,
                            rows: json_rows,
                        }),
                        rows_affected: count,
                    });
                } else {
                    // Last write statement — return rows_affected
                    let res = (&mut **conn)
                        .execute(sqlx::query(stmt))
                        .await
                        .map_err(|e| format!("[statement {}] {}", i, e))?;
                    let elapsed = total_start.elapsed().as_millis() as u64;
                    return Ok(TransactionStepResult {
                        statement_index: i as u32,
                        success: true,
                        error: None,
                        elapsed_ms: elapsed,
                        query_result: None,
                        rows_affected: res.rows_affected(),
                    });
                }
            }

            // Should not reach here — last statement returns above
            Err("No statements executed".to_string())
        }
        TransactionState::MySql { conn } => {
            for (i, stmt) in statements.iter().enumerate() {
                let is_last = i == num_stmts - 1;
                let read = is_read_query(stmt);

                if !is_last {
                    (&mut **conn).execute(sqlx::query(stmt))
                        .await
                        .map_err(|e| format!("[statement {}] {}", i, e))?;
                } else if read {
                    let rows = (&mut **conn)
                        .fetch_all(sqlx::query(stmt))
                        .await
                        .map_err(|e| format!("[statement {}] {}", i, e))?;
                    let columns: Vec<String> = if let Some(first) = rows.first() {
                        first.columns().iter().map(|c| c.name().to_string()).collect()
                    } else {
                        vec![]
                    };
                    let json_rows: Vec<serde_json::Map<String, serde_json::Value>> = rows
                        .iter()
                        .map(|row| {
                            let mut map = serde_json::Map::new();
                            for col_name in &columns {
                                map.insert(col_name.clone(), extract_mysql_value(row, col_name));
                            }
                            map
                        })
                        .collect();
                    let elapsed = total_start.elapsed().as_millis() as u64;
                    let count = json_rows.len() as u64;
                    return Ok(TransactionStepResult {
                        statement_index: i as u32,
                        success: true,
                        error: None,
                        elapsed_ms: elapsed,
                        query_result: Some(QueryResult {
                            rows_affected: count,
                            elapsed_ms: total_start.elapsed().as_millis(),
                            columns,
                            rows: json_rows,
                        }),
                        rows_affected: count,
                    });
                } else {
                    let res = (&mut **conn)
                        .execute(sqlx::query(stmt))
                        .await
                        .map_err(|e| format!("[statement {}] {}", i, e))?;
                    let elapsed = total_start.elapsed().as_millis() as u64;
                    return Ok(TransactionStepResult {
                        statement_index: i as u32,
                        success: true,
                        error: None,
                        elapsed_ms: elapsed,
                        query_result: None,
                        rows_affected: res.rows_affected(),
                    });
                }
            }

            Err("No statements executed".to_string())
        }
    }
}

/// Commit the open transaction. Removes the entry from the registry.
pub async fn commit(transaction_id: &str) -> Result<TransactionCommitResult, String> {
    let start = Instant::now();
    let mut map = REGISTRY.inner.lock().await;
    let state = map.remove(&transaction_id.to_string()).ok_or_else(|| {
        "Transaction not found".to_string()
    })?;

    match state {
        TransactionState::Pg { mut conn } => {
            sqlx::query("COMMIT")
                .execute(&mut *conn)
                .await
                .map_err(|e| e.to_string())?;
            // Drop returns conn to the pool; no explicit close needed.
            drop(conn);
        }
        TransactionState::MySql { mut conn } => {
            sqlx::query("COMMIT")
                .execute(&mut *conn)
                .await
                .map_err(|e| e.to_string())?;
            drop(conn);
        }
    }

    Ok(TransactionCommitResult {
        committed: true,
        elapsed_ms: start.elapsed().as_millis() as u64,
    })
}

/// Rollback the open transaction. Idempotent — if id not found, return zero result.
pub async fn rollback(transaction_id: &str) -> Result<TransactionCommitResult, String> {
    let start = Instant::now();
    let mut map = REGISTRY.inner.lock().await;
    let state = map.remove(&transaction_id.to_string());

    let Some(state) = state else {
        return Ok(TransactionCommitResult {
            committed: false,
            elapsed_ms: start.elapsed().as_millis() as u64,
        });
    };

    match state {
        TransactionState::Pg { mut conn } => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *conn).await;
            drop(conn);
        }
        TransactionState::MySql { mut conn } => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *conn).await;
            drop(conn);
        }
    }

    Ok(TransactionCommitResult {
        committed: false,
        elapsed_ms: start.elapsed().as_millis() as u64,
    })
}
