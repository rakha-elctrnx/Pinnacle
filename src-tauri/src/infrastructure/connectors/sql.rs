use std::time::Instant;

use sqlx::{
    mysql::MySqlConnectOptions,
    postgres::PgConnectOptions,
    Column, Connection, Executor, Row,
};

use crate::{
    core::{error::AppError, result::AppResult},
    domain::query::{ConnectionPayload, QueryResult},
};

fn ensure_supported_driver(driver: &str) -> AppResult<()> {
    match driver {
        "postgresql" | "mysql" => Ok(()),
        _ => Err(AppError::UnsupportedDriver(driver.to_string())),
    }
}

fn is_read_query(sql: &str) -> bool {
    let upper = sql.trim().to_uppercase();
    upper.starts_with("SELECT")
        || upper.starts_with("SHOW")
        || upper.starts_with("DESCRIBE")
        || upper.starts_with("EXPLAIN")
        || upper.starts_with("WITH")
}

fn extract_pg_value(row: &sqlx::postgres::PgRow, column_name: &str) -> serde_json::Value {
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
    if let Ok(Some(v)) = row.try_get::<Option<serde_json::Value>, _>(column_name) {
        return v;
    }
    serde_json::Value::Null
}

fn extract_mysql_value(row: &sqlx::mysql::MySqlRow, column_name: &str) -> serde_json::Value {
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
    serde_json::Value::Null
}

pub async fn test_connection(payload: &ConnectionPayload) -> AppResult<()> {
    ensure_supported_driver(payload.r#type.as_str())?;

    match payload.r#type.as_str() {
        "postgresql" => {
            let options = PgConnectOptions::new()
                .host(payload.host.as_str())
                .port(payload.port)
                .username(payload.username.as_str())
                .password(payload.password.as_str())
                .database(payload.database.as_str());
            let conn = sqlx::PgConnection::connect_with(&options).await?;
            conn.close().await?;
        }
        "mysql" => {
            let options = MySqlConnectOptions::new()
                .host(payload.host.as_str())
                .port(payload.port)
                .username(payload.username.as_str())
                .password(payload.password.as_str())
                .database(payload.database.as_str());
            let conn = sqlx::MySqlConnection::connect_with(&options).await?;
            conn.close().await?;
        }
        _ => return Err(AppError::UnsupportedDriver(payload.r#type.clone())),
    }

    Ok(())
}

pub async fn execute_sql(payload: &ConnectionPayload, sql: &str) -> AppResult<QueryResult> {
    ensure_supported_driver(payload.r#type.as_str())?;

    let sql = sql.trim();
    if sql.is_empty() {
        return Err(AppError::InvalidInput("sql cannot be empty".to_string()));
    }

    let start = Instant::now();
    let read = is_read_query(sql);

    match payload.r#type.as_str() {
        "postgresql" => {
            let options = PgConnectOptions::new()
                .host(payload.host.as_str())
                .port(payload.port)
                .username(payload.username.as_str())
                .password(payload.password.as_str())
                .database(payload.database.as_str());
            let mut conn = sqlx::PgConnection::connect_with(&options).await?;

            // Set search_path so unqualified table names resolve to the chosen schema
            if !payload.schema.is_empty() {
                sqlx::query(&format!("SET search_path TO {}", payload.schema))
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
        "mysql" => {
            let options = MySqlConnectOptions::new()
                .host(payload.host.as_str())
                .port(payload.port)
                .username(payload.username.as_str())
                .password(payload.password.as_str())
                .database(payload.database.as_str());
            let mut conn = sqlx::MySqlConnection::connect_with(&options).await?;

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
                            map.insert(col_name.clone(), extract_mysql_value(row, col_name));
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
        _ => Err(AppError::UnsupportedDriver(payload.r#type.clone())),
    }
}