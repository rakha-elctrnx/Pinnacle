use std::time::Instant;

use crate::{
    core::{error::AppError, result::AppResult},
    domain::query::{ConnectionPayload, QueryResult},
};

use chrono::Utc;
use sqlx::{
    postgres::PgConnectOptions, types::BigDecimal as Decimal, types::Uuid, Column, Connection,
    Executor, Row,
};

fn ensure_is_postgresql(payload: &ConnectionPayload) -> bool {
    if payload.r#type != "postgresql" {
        return false;
    }
    true
}

fn build_connection_options(payload: &ConnectionPayload) -> PgConnectOptions {
    PgConnectOptions::new()
        .host(payload.host.as_str())
        .port(payload.port)
        .username(payload.username.as_str())
        .password(payload.password.as_str())
        .database(payload.database.as_str())
}

pub async fn test_connection(payload: &ConnectionPayload) -> AppResult<()> {
    if !ensure_is_postgresql(payload) {
        return Err(AppError::UnsupportedDriver(payload.r#type.clone()));
    }

    let options = build_connection_options(payload);
    let conn = sqlx::PgConnection::connect_with(&options).await?;
    conn.close().await?;
    Ok(())
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

pub async fn execute_sql(payload: &ConnectionPayload, sql: &str) -> AppResult<QueryResult> {
    if !ensure_is_postgresql(payload) {
        return Err(AppError::UnsupportedDriver(payload.r#type.clone()));
    }

    let options = build_connection_options(payload);
    let mut conn = sqlx::PgConnection::connect_with(&options).await?;

    let start = Instant::now();
    let read = is_read_query(sql);

    // Set search_path so unqualified table names resolve to the chosen schema
    if !payload.schema.is_empty() {
        sqlx::query(&format!(
            "SET search_path TO {}",
            quote_identifier_pg(&payload.schema)
        ))
        .execute(&mut conn)
        .await?;
    }

    if read {
        let rows = conn.fetch_all(sqlx::query(sql)).await?;
        let columns: Vec<String> = if let Some(first) = rows.first() {
            first
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect()
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
        conn.close().await?;
        Ok(QueryResult {
            rows_affected: json_rows.len() as u64,
            elapsed_ms: start.elapsed().as_millis(),
            columns,
            rows: json_rows,
        })
    } else {
        let result = conn.execute(sqlx::query(sql)).await?;
        conn.close().await?;
        Ok(QueryResult {
            rows_affected: result.rows_affected(),
            elapsed_ms: start.elapsed().as_millis(),
            columns: vec![],
            rows: vec![],
        })
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

    // handle JSONB columns in PostgreSQL
    if let Ok(Some(v)) = row.try_get::<Option<serde_json::Value>, _>(column_name) {
        // stringify JSON values to preserve formatting and avoid issues with nested structures
        return serde_json::Value::String(v.to_string());
    }

    if let Ok(Some(v)) = row.try_get::<Option<serde_json::Value>, _>(column_name) {
        return v;
    }

    serde_json::Value::Null
}
