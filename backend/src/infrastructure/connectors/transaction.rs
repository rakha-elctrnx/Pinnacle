use std::collections::HashMap;
use std::sync::LazyLock;
use std::time::Instant;

use sqlx::{
    Column, Connection, Executor, Row,
    mysql::MySqlConnectOptions,
    postgres::PgConnectOptions,
};
use tokio::sync::Mutex;

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
/// Uses manual `BEGIN` / `COMMIT` / `ROLLBACK` SQL (same pattern as `execute_ddl_pg`)
/// to avoid sqlx `Transaction` lifetime complexity.
enum TransactionState {
    Pg { conn: sqlx::PgConnection },
    MySql { conn: sqlx::MySqlConnection },
}

static REGISTRY: LazyLock<TransactionRegistry> = LazyLock::new(TransactionRegistry::default);

// ── Public API ───────────────────────────────────────────────────

pub async fn begin(payload: &ConnectionPayload) -> AppResult<String> {
    ensure_supported_driver(payload.r#type.as_str())?;

    let id = uuid::Uuid::new_v4().to_string();

    match payload.r#type.as_str() {
        "postgresql" => {
            let opts = PgConnectOptions::new()
                .host(payload.host.as_str())
                .port(payload.port)
                .username(payload.username.as_str())
                .password(payload.password.as_str())
                .database(payload.database.as_str());
            let mut conn = sqlx::PgConnection::connect_with(&opts).await?;

            // Set search_path so unqualified table names resolve
            if !payload.schema.is_empty() {
                sqlx::query(&format!(
                    "SET search_path TO {}",
                    quote_identifier_pg(&payload.schema)
                ))
                .execute(&mut conn)
                .await?;
            }

            sqlx::query("BEGIN").execute(&mut conn).await?;

            REGISTRY
                .inner
                .lock()
                .await
                .insert(id.clone(), TransactionState::Pg { conn });
            Ok(id)
        }
        "mysql" => {
            let opts = MySqlConnectOptions::new()
                .host(payload.host.as_str())
                .port(payload.port)
                .username(payload.username.as_str())
                .password(payload.password.as_str())
                .database(payload.database.as_str());
            let mut conn = sqlx::MySqlConnection::connect_with(&opts).await?;
            sqlx::query("BEGIN").execute(&mut conn).await?;
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
                    conn.execute(sqlx::query(stmt))
                        .await
                        .map_err(|e| format!("[statement {}] {}", i, e))?;
                } else if read {
                    // Last read statement — return rows
                    let rows = conn
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
                    let res = conn
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
                    conn.execute(sqlx::query(stmt))
                        .await
                        .map_err(|e| format!("[statement {}] {}", i, e))?;
                } else if read {
                    let rows = conn
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
                    let res = conn
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
                .execute(&mut conn)
                .await
                .map_err(|e| e.to_string())?;
            conn.close().await.map_err(|e| e.to_string())?;
        }
        TransactionState::MySql { mut conn } => {
            sqlx::query("COMMIT")
                .execute(&mut conn)
                .await
                .map_err(|e| e.to_string())?;
            conn.close().await.map_err(|e| e.to_string())?;
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
            let _ = sqlx::query("ROLLBACK").execute(&mut conn).await;
            let _ = conn.close().await;
        }
        TransactionState::MySql { mut conn } => {
            let _ = sqlx::query("ROLLBACK").execute(&mut conn).await;
            let _ = conn.close().await;
        }
    }

    Ok(TransactionCommitResult {
        committed: false,
        elapsed_ms: start.elapsed().as_millis() as u64,
    })
}
