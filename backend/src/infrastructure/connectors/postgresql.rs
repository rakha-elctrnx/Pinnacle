use std::time::Instant;

use crate::{
    core::{error::AppError, result::AppResult},
    domain::query::{ConnectionPayload, QueryResult},
    infrastructure::connectors::pool,
};

use chrono::Utc;
use sqlx::{
    postgres::PgConnectOptions,
    types::BigDecimal as Decimal,
    types::Uuid,
    Column, Executor, Row, Statement,
};

fn ensure_is_postgresql(payload: &ConnectionPayload) -> bool {
    if payload.r#type != "postgresql" {
        return false;
    }
    true
}

pub(crate) fn build_connection_options(
    payload: &ConnectionPayload,
    host_override: Option<(&str, u16)>,
) -> PgConnectOptions {
    let (host, port) = host_override.unwrap_or((payload.host.as_str(), payload.port));
    let options = PgConnectOptions::new()
        .host(host)
        .port(port)
        .username(payload.username.as_str())
        .password(payload.password.as_str())
        .database(payload.database.as_str());
    super::ssl::apply_pg_ssl(options, payload)
}

pub async fn test_connection(
    payload: &ConnectionPayload,
    host_override: Option<(&str, u16)>,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<()> {
    if !ensure_is_postgresql(payload) {
        return Err(AppError::UnsupportedDriver(payload.r#type.clone()));
    }

    let conn_id = payload.connection_id.clone();
    let res = pool::with_retry(|| async {
        let mut conn = acquire_pg_conn(payload, host_override, ssh_password, key_passphrase).await?;
        // test_before_acquire pings on acquire; drop returns the conn to the pool.
        let _ = &mut conn;
        AppResult::Ok(())
    })
    .await;
    super::sql::mark_result(conn_id.as_deref(), res).await
}

fn is_read_query(sql: &str) -> bool {
    let upper = sql.trim().to_uppercase();
    upper.starts_with("SELECT")
        || upper.starts_with("SHOW")
        || upper.starts_with("DESCRIBE")
        || upper.starts_with("EXPLAIN")
        || upper.starts_with("WITH")
}

pub fn quote_identifier_pg(id: &str) -> String {
    format!("\"{}\"", id.replace('"', "\"\""))
}

pub async fn execute_sql(
    payload: &ConnectionPayload,
    sql: &str,
    host_override: Option<(&str, u16)>,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<QueryResult> {
    if !ensure_is_postgresql(payload) {
        return Err(AppError::UnsupportedDriver(payload.r#type.clone()));
    }

    let start = Instant::now();
    let read = is_read_query(sql);

    let conn_id = payload.connection_id.clone();
    let res = pool::with_retry(|| async {
        let mut pooled = acquire_pg_conn(payload, host_override, ssh_password, key_passphrase).await?;

        // Set search_path so unqualified table names resolve to the chosen schema
        if !payload.schema.is_empty() {
            sqlx::query(&format!(
                "SET search_path TO {}",
                quote_identifier_pg(&payload.schema)
            ))
            .execute(&mut *pooled)
            .await?;
        }

        if read {
            let rows = (&mut *pooled).fetch_all(sqlx::query(sql)).await?;
            let columns: Vec<String> = if let Some(first) = rows.first() {
                first
                    .columns()
                    .iter()
                    .map(|c| c.name().to_string())
                    .collect()
            } else {
                // When 0 rows, prepare the statement to extract column metadata
                // so the frontend can show column headers even with no data.
                let statement = (&mut *pooled).prepare(sql).await?;
                statement
                    .columns()
                    .iter()
                    .map(|c| c.name().to_string())
                    .collect()
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
            Ok(QueryResult {
                rows_affected: json_rows.len() as u64,
                elapsed_ms: start.elapsed().as_millis(),
                columns,
                rows: json_rows,
            })
        } else {
            let result = (&mut *pooled).execute(sqlx::query(sql)).await?;
            Ok(QueryResult {
                rows_affected: result.rows_affected(),
                elapsed_ms: start.elapsed().as_millis(),
                columns: vec![],
                rows: vec![],
            })
        }
    })
    .await;
    super::sql::mark_result(conn_id.as_deref(), res).await
}

/// Acquire a pooled Postgres connection when `connection_id` is set (saved
/// connection), else connect ad-hoc using `host_override` (test-before-save).
/// Both paths yield `PoolConnection<Postgres>`; callers MUST NOT call `.close()`.
pub(crate) async fn acquire_pg_conn(
    payload: &ConnectionPayload,
    _host_override: Option<(&str, u16)>,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<sqlx::pool::PoolConnection<sqlx::Postgres>> {
    if let Some(pool::PooledDb::Pg(p)) =
        pool::get_or_create(payload, ssh_password, key_passphrase).await?
    {
        Ok(p.acquire().await?)
    } else {
        // Ad-hoc (test-before-save): resolve the SSH tunnel here so it stays
        // alive through connect. The tunnel handle drops at the end of this
        // call, but the established connection survives via the tunnel's
        // detached per-connection forward task.
        let (host, port, _tunnel) =
            super::sql::resolve_connect_addr(payload, ssh_password, key_passphrase).await?;
        let options = build_connection_options(payload, Some((&host, port)));
        let pool = sqlx::pool::PoolOptions::<sqlx::Postgres>::new()
            .max_connections(1)
            .connect_with(options)
            .await?;
        Ok(pool.acquire().await?)
    }
}

pub(crate) fn extract_pg_value(row: &sqlx::postgres::PgRow, column_name: &str) -> serde_json::Value {
    if let Ok(Some(v)) = row.try_get::<Option<bool>, _>(column_name) {
        return serde_json::json!(v);
    }
    if let Ok(Some(v)) = row.try_get::<Option<i32>, _>(column_name) {
        return serde_json::json!(v);
    }
    if let Ok(Some(v)) = row.try_get::<Option<i64>, _>(column_name) {
        return serde_json::json!(v);
    }
    if let Ok(Some(v)) = row.try_get::<Option<f64>, _>(column_name) {
        return serde_json::json!(v);
    }
    if let Ok(Some(v)) = row.try_get::<Option<String>, _>(column_name) {
        return serde_json::Value::String(v);
    }

    // handle UUIDs as strings to preserve formatting
    if let Ok(Some(v)) = row.try_get::<Option<Uuid>, _>(column_name) {
        return serde_json::Value::String(v.to_string());
    }

    // handle decimal types from postgresql to floating point numbers in JSON
    if let Ok(Some(v)) = row.try_get::<Option<Decimal>, _>(column_name) {
        if let Ok(f) = v.to_string().parse::<f64>() {
            return serde_json::json!(f);
        }
    }

    // TODO : handle date/time types more robustly, respecting the original timezone and formatting
    if let Ok(Some(v)) = row.try_get::<Option<chrono::DateTime<Utc>>, _>(column_name) {
        return serde_json::json!(v.to_string());
    }

    // Handle date types without time component
    if let Ok(Some(v)) = row.try_get::<Option<chrono::NaiveDate>, _>(column_name) {
        return serde_json::json!(v.to_string());
    }

    // handle array columns as arrays of strings
    if let Ok(Some(v)) = row.try_get::<Option<Vec<String>>, _>(column_name) {
        return serde_json::json!(v);
    }

    // handle array columns as arrays
    if let Ok(Some(v)) = row.try_get::<Option<Vec<serde_json::Value>>, _>(column_name) {
        return serde_json::json!(v);
    }

    // handle JSONB columns in PostgreSQL — return the raw value
    // (not stringified), so the frontend receives a proper JSON object
    // and can send it back as a JSONB-compatible type on update.
    if let Ok(Some(v)) = row.try_get::<Option<serde_json::Value>, _>(column_name) {
        return v;
    }

    serde_json::Value::Null
}