use std::time::Instant;

use crate::{
    core::{error::AppError, result::AppResult},
    domain::query::{ConnectionPayload, QueryResult},
};

use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Column, Connection, Executor, Row, Statement};

fn ensure_is_sqlite(payload: &ConnectionPayload) -> bool {
    if payload.r#type != "sqlite" {
        return false;
    }
    true
}

fn build_connection_options(payload: &ConnectionPayload) -> SqliteConnectOptions {
    SqliteConnectOptions::new()
        .filename(&payload.database)
        .create_if_missing(true)
}

pub async fn test_connection(payload: &ConnectionPayload) -> AppResult<()> {
    if !ensure_is_sqlite(payload) {
        return Err(AppError::UnsupportedDriver(payload.r#type.clone()));
    }

    let options = build_connection_options(payload);
    let conn = sqlx::SqliteConnection::connect_with(&options).await?;
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
        || upper.starts_with("VALUES")
}

pub(crate) fn extract_sqlite_value(row: &sqlx::sqlite::SqliteRow, column_name: &str) -> serde_json::Value {
    if let Ok(Some(v)) = row.try_get::<Option<i64>, _>(column_name) {
        return serde_json::json!(v);
    }
    if let Ok(Some(v)) = row.try_get::<Option<f64>, _>(column_name) {
        return serde_json::json!(v);
    }
    if let Ok(Some(v)) = row.try_get::<Option<String>, _>(column_name) {
        return serde_json::Value::String(v);
    }
    if let Ok(Some(v)) = row.try_get::<Option<bool>, _>(column_name) {
        return serde_json::json!(v);
    }
    serde_json::Value::Null
}

pub async fn execute_sql(payload: &ConnectionPayload, sql: &str) -> AppResult<QueryResult> {
    if !ensure_is_sqlite(payload) {
        return Err(AppError::UnsupportedDriver(payload.r#type.clone()));
    }

    let options = build_connection_options(payload);
    let mut conn = sqlx::SqliteConnection::connect_with(&options).await?;

    let start = Instant::now();
    let read = is_read_query(sql);

    if read {
        let rows = conn.fetch_all(sqlx::query(sql)).await?;
        let columns: Vec<String> = if let Some(first) = rows.first() {
            first
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect()
        } else {
            let statement = conn.prepare(sql).await?;
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
                    map.insert(col_name.clone(), extract_sqlite_value(row, col_name));
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

// ── SQLite Schema Types ───────────────────────────────────────────

struct SqliteColumnInfo {
    cid: i64,
    name: String,
    r#type: String,
    notnull: i64,
    dflt_value: Option<String>,
    pk: i64,
}

struct SqliteForeignKey {
    id: i64,
    table: String,
    from: String,
    to: String,
    on_update: String,
    on_delete: String,
}

struct SqliteUniqueIndex {
    name: String,
    sql: String,
}

struct SqliteTable {
    table_name: String,
}

fn parse_column_row(row: &sqlx::sqlite::SqliteRow) -> SqliteColumnInfo {
    SqliteColumnInfo {
        cid: row.get("cid"),
        name: row.get("name"),
        r#type: row.get("type"),
        notnull: row.get("notnull"),
        dflt_value: row.get("dflt_value"),
        pk: row.get("pk"),
    }
}

fn parse_fk_row(row: &sqlx::sqlite::SqliteRow) -> SqliteForeignKey {
    SqliteForeignKey {
        id: row.get("id"),
        table: row.get("table"),
        from: row.get("from"),
        to: row.get("to"),
        on_update: row.get("on_update"),
        on_delete: row.get("on_delete"),
    }
}

fn parse_unique_index_row(row: &sqlx::sqlite::SqliteRow) -> SqliteUniqueIndex {
    SqliteUniqueIndex {
        name: row.get("name"),
        sql: row.get("sql"),
    }
}

fn parse_table_row(row: &sqlx::sqlite::SqliteRow) -> SqliteTable {
    SqliteTable {
        table_name: row.get("table_name"),
    }
}

// Helper to extract column names from UNIQUE index SQL
fn extract_unique_columns(sql: &str) -> Vec<String> {
    if let Some(start) = sql.find('(') {
        if let Some(end) = sql.find(')') {
            let cols = &sql[start + 1..end];
            return cols
                .split(',')
                .map(|c| c.trim().trim_matches('"').to_string())
                .collect();
        }
    }
    Vec::new()
}

pub async fn get_table_schema(
    payload: &ConnectionPayload,
    table_name: &str,
) -> AppResult<crate::domain::query::TableSchemaInfo> {
    let options = build_connection_options(payload);
    let mut conn = sqlx::SqliteConnection::connect_with(&options).await?;

    // Get columns via PRAGMA table_info (includes PK info)
    let column_rows = sqlx::query("PRAGMA table_info(?)")
        .bind(table_name)
        .fetch_all(&mut conn)
        .await?;
    let pragma_info: Vec<SqliteColumnInfo> =
        column_rows.iter().map(parse_column_row).collect();
    drop(column_rows);

    // Get foreign keys via PRAGMA foreign_key_list
    let fk_rows = sqlx::query("PRAGMA foreign_key_list(?)")
        .bind(table_name)
        .fetch_all(&mut conn)
        .await?;
    let pragma_fks: Vec<SqliteForeignKey> = fk_rows.iter().map(parse_fk_row).collect();
    drop(fk_rows);

    let unique_rows = sqlx::query(
        "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql LIKE '%UNIQUE%'"
    )
    .bind(table_name)
    .fetch_all(&mut conn)
    .await?;
    let unique_constraints: Vec<SqliteUniqueIndex> = unique_rows.iter().map(parse_unique_index_row).collect();
    drop(unique_rows);

    // Build columns
    let columns: Vec<crate::domain::query::TableColumn> = pragma_info
        .iter()
        .map(|info| crate::domain::query::TableColumn {
            name: info.name.clone(),
            data_type: info.r#type.clone(),
            is_nullable: info.notnull == 0,
            default_value: info.dflt_value.clone(),
            is_auto_increment: false,
            comment: None,
        })
        .collect();

    // Build primary key — take the first PK column (composite PKs
    // have multiple rows with pk > 0)
    let primary_key: Option<crate::domain::query::PrimaryKeyConstraint> = pragma_info
        .iter()
        .find(|col| col.pk != 0)
        .map(|col| crate::domain::query::PrimaryKeyConstraint {
            name: "PRIMARY".to_string(),
            columns: vec![col.name.clone()],
        });

    // Build foreign keys
    let foreign_keys: Vec<crate::domain::query::ForeignKeyConstraint> = pragma_fks
        .iter()
        .fold(Vec::new(), |mut acc: Vec<_>, fk| {
            if let Some(existing) = acc.iter_mut().find(|f| f.name == fk.id.to_string()) {
                existing.columns.push(fk.from.clone());
                existing.referenced_columns.push(fk.to.clone());
            } else {
                acc.push(crate::domain::query::ForeignKeyConstraint {
                    name: fk.id.to_string(),
                    columns: vec![fk.from.clone()],
                    referenced_table: fk.table.clone(),
                    referenced_schema: "".to_string(),
                    referenced_columns: vec![fk.to.clone()],
                    on_update: fk.on_update.clone(),
                    on_delete: fk.on_delete.clone(),
                });
            }
            acc
        });

    // Build unique constraints (map to domain type)
    let unique_constraints: Vec<crate::domain::query::UniqueConstraint> = unique_constraints
        .iter()
        .map(|idx| crate::domain::query::UniqueConstraint {
            name: idx.name.clone(),
            columns: extract_unique_columns(&idx.sql),
        })
        .collect();

    conn.close().await?;

    Ok(crate::domain::query::TableSchemaInfo {
        table_name: table_name.to_string(),
        schema: "".to_string(),
        columns,
        primary_key,
        foreign_keys,
        unique_constraints,
        indexes: Vec::new(),
    })
}

pub async fn get_all_columns(
    payload: &ConnectionPayload,
) -> AppResult<Vec<crate::domain::query::SchemaColumn>> {
    if !ensure_is_sqlite(payload) {
        return Err(AppError::UnsupportedDriver(payload.r#type.clone()));
    }

    let options = build_connection_options(payload);
    let mut conn = sqlx::SqliteConnection::connect_with(&options).await?;

    let table_rows = sqlx::query(
        "SELECT name AS table_name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .fetch_all(&mut conn)
    .await?;
    let tables: Vec<SqliteTable> = table_rows.iter().map(parse_table_row).collect();
    drop(table_rows);

    let mut all_columns = Vec::new();

    for table in tables {
        let column_rows = sqlx::query("PRAGMA table_info(?)")
            .bind(&table.table_name)
            .fetch_all(&mut conn)
            .await?;
        let columns: Vec<SqliteColumnInfo> = column_rows.iter().map(parse_column_row).collect();
        drop(column_rows);

        for col in columns {
            all_columns.push(crate::domain::query::SchemaColumn {
                table_name: table.table_name.clone(),
                column_name: col.name,
                data_type: col.r#type.clone(),
                is_nullable: col.notnull == 0,
                default_value: col.dflt_value,
                data_type_name: col.r#type,
            });
        }
    }

    conn.close().await?;
    Ok(all_columns)
}

pub async fn get_all_foreign_keys(
    payload: &ConnectionPayload,
) -> AppResult<Vec<crate::domain::query::SchemaForeignKey>> {
    if !ensure_is_sqlite(payload) {
        return Err(AppError::UnsupportedDriver(payload.r#type.clone()));
    }

    let options = build_connection_options(payload);
    let mut conn = sqlx::SqliteConnection::connect_with(&options).await?;

    let table_rows = sqlx::query(
        "SELECT name AS table_name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .fetch_all(&mut conn)
    .await?;
    let tables: Vec<SqliteTable> = table_rows.iter().map(parse_table_row).collect();
    drop(table_rows);

    let mut all_fks = Vec::new();

    for table in tables {
        let fk_rows = sqlx::query("PRAGMA foreign_key_list(?)")
            .bind(&table.table_name)
            .fetch_all(&mut conn)
            .await?;
        let fks: Vec<SqliteForeignKey> = fk_rows.iter().map(parse_fk_row).collect();
        drop(fk_rows);

        for fk in fks {
            all_fks.push(crate::domain::query::SchemaForeignKey {
                source_table: table.table_name.clone(),
                constraint_name: fk.id.to_string(),
                columns: vec![fk.from],
                referenced_table: fk.table,
                referenced_schema: "".to_string(),
                referenced_columns: vec![fk.to],
            });
        }
    }

    conn.close().await?;
    Ok(all_fks)
}

// ── DDL Execution ────────────────────────────────────────────────

pub async fn execute_ddl(
    payload: &ConnectionPayload,
    plan: &crate::domain::query::DdlPlan,
) -> AppResult<crate::domain::query::DdlExecutionResult> {
    if !ensure_is_sqlite(payload) {
        return Err(AppError::UnsupportedDriver(payload.r#type.clone()));
    }

    let options = build_connection_options(payload);
    let mut conn = sqlx::SqliteConnection::connect_with(&options).await?;

    let mut results: Vec<crate::domain::query::DdlStatementResult> = Vec::new();
    let mut all_ok = true;

    for stmt in &plan.statements {
        let start = std::time::Instant::now();
        let res = sqlx::query(&stmt.sql).execute(&mut conn).await;
        let elapsed = start.elapsed().as_millis();

        match res {
            Ok(_) => {
                results.push(crate::domain::query::DdlStatementResult {
                    order: stmt.order,
                    sql: stmt.sql.clone(),
                    success: true,
                    error: None,
                    elapsed_ms: elapsed,
                });
            }
            Err(err) => {
                all_ok = false;
                results.push(crate::domain::query::DdlStatementResult {
                    order: stmt.order,
                    sql: stmt.sql.clone(),
                    success: false,
                    error: Some(err.to_string()),
                    elapsed_ms: elapsed,
                });
                break;
            }
        }
    }

    conn.close().await?;

    Ok(crate::domain::query::DdlExecutionResult {
        success: all_ok,
        executed_count: results.len() as u32,
        statements: results,
    })
}

// ── Commit Table Changes ─────────────────────────────────────────

pub async fn commit_table_changes(
    payload: &crate::domain::query::CommitTableChangesPayload,
) -> AppResult<crate::domain::query::CommitTableChangesResult> {
    if !ensure_is_sqlite(&payload.connection) {
        return Err(AppError::UnsupportedDriver(payload.connection.r#type.clone()));
    }

    let options = build_connection_options(&payload.connection);
    let mut conn = sqlx::SqliteConnection::connect_with(&options).await?;

    let schema_info = get_table_schema(&payload.connection, &payload.table_name).await?;
    let column_names: Vec<String> = schema_info
        .columns
        .iter()
        .map(|c| c.name.clone())
        .collect();

    if !column_names.contains(&payload.primary_key_column) {
        conn.close().await?;
        return Err(AppError::InvalidInput(format!(
            "Primary key column '{}' not found in table schema. The table structure may have changed. Please refresh.",
            payload.primary_key_column
        )));
    }

    let fq_table = if schema_info.schema.is_empty() {
        quote_identifier(&schema_info.table_name)
    } else {
        format!(
            "{}.{}",
            quote_identifier(&schema_info.schema),
            quote_identifier(&schema_info.table_name)
        )
    };

    let pk_quoted = quote_identifier(&payload.primary_key_column);

    let mut inserted_rows: u64 = 0;
    let mut updated_rows: u64 = 0;
    let mut deleted_rows: u64 = 0;

    sqlx::query("BEGIN").execute(&mut conn).await?;

    for insert_row in &payload.inserts {
        let cols: Vec<&String> = insert_row.keys().collect();
        if cols.is_empty() {
            continue;
        }
        let quoted_cols: Vec<String> = cols.iter().map(|c| quote_identifier(c)).collect();
        let placeholders: Vec<&str> = vec!["?"; cols.len()];

        let sql = format!(
            "INSERT INTO {} ({}) VALUES ({})",
            fq_table,
            quoted_cols.join(", "),
            placeholders.join(", "),
        );

        let mut query = sqlx::query(&sql);
        for col in &cols {
            let val = insert_row.get(*col as &str);
            query = match val {
                None => query.bind(None as Option<String>),
                Some(serde_json::Value::Null) => query.bind(None as Option<String>),
                Some(serde_json::Value::Bool(b)) => query.bind(*b),
                Some(serde_json::Value::Number(n)) => {
                    if let Some(i) = n.as_i64() {
                        query.bind(i)
                    } else if let Some(f) = n.as_f64() {
                        query.bind(f)
                    } else {
                        query.bind(None as Option<i64>)
                    }
                }
                Some(serde_json::Value::String(s)) => query.bind(s.as_str()),
                Some(serde_json::Value::Array(arr)) => {
                    let json_str = serde_json::to_string(arr).unwrap_or_default();
                    query.bind(json_str)
                }
                Some(serde_json::Value::Object(obj)) => {
                    let json_str = serde_json::to_string(obj).unwrap_or_default();
                    query.bind(json_str)
                }
            };
        }

        query.execute(&mut conn).await.map_err(|e| {
            AppError::Database(format!("INSERT failed: {} (row values: {:?})", e, insert_row))
        })?;
        inserted_rows += 1;
    }

    for update in &payload.updates {
        let changes = &update.changes;
        let cols: Vec<&String> = changes.keys().collect();
        if cols.is_empty() {
            continue;
        }
        let set_clauses: Vec<String> = cols
            .iter()
            .map(|c| format!("{} = ?", quote_identifier(c)))
            .collect();

        let sql = format!(
            "UPDATE {} SET {} WHERE CAST({} AS TEXT) = ?",
            fq_table,
            set_clauses.join(", "),
            pk_quoted,
        );
        let mut query = sqlx::query(&sql);
        for col in &cols {
            let val = changes.get(*col as &str);
            query = match val {
                None => query.bind(None as Option<String>),
                Some(serde_json::Value::Null) => query.bind(None as Option<String>),
                Some(serde_json::Value::Bool(b)) => query.bind(*b),
                Some(serde_json::Value::Number(n)) => {
                    if let Some(i) = n.as_i64() {
                        query.bind(i)
                    } else if let Some(f) = n.as_f64() {
                        query.bind(f)
                    } else {
                        query.bind(None as Option<i64>)
                    }
                }
                Some(serde_json::Value::String(s)) => query.bind(s.as_str()),
                Some(serde_json::Value::Array(arr)) => {
                    let json_str = serde_json::to_string(arr).unwrap_or_default();
                    query.bind(json_str)
                }
                Some(serde_json::Value::Object(obj)) => {
                    let json_str = serde_json::to_string(obj).unwrap_or_default();
                    query.bind(json_str)
                }
            };
        }
        query = query.bind(&update.row_id);

        query.execute(&mut conn).await.map_err(|e| {
            AppError::Database(format!("UPDATE failed: {} (row values: {:?})", e, update))
        })?;
        updated_rows += 1;
    }

    for delete in &payload.deletes {
        let sql = format!(
            "DELETE FROM {} WHERE CAST({} AS TEXT) = ?",
            fq_table,
            pk_quoted,
        );

        sqlx::query(&sql).bind(&delete).execute(&mut conn).await.map_err(|e| {
            AppError::Database(format!("DELETE failed: {} (row_id: {})", e, delete))
        })?;
        deleted_rows += 1;
    }

    sqlx::query("COMMIT").execute(&mut conn).await?;

    Ok(crate::domain::query::CommitTableChangesResult {
        inserted_rows,
        updated_rows,
        deleted_rows,
    })
}

// ── SQLite Helper Functions ──────────────────────────────────────

pub(crate) fn quote_identifier(id: &str) -> String {
    format!("\"{}\"", id.replace('"', "\"\""))
}

