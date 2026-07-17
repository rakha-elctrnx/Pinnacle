use std::time::Instant;

use sqlx::{
    Column, Connection, Executor, Row, Statement, mysql::MySqlConnectOptions, postgres::PgConnectOptions, sqlite::SqliteConnectOptions
};

use crate::domain::query::{
    CommitTableChangesPayload, CommitTableChangesResult, ConnectionPayload, DdlExecutionResult,
    DdlPlan, DdlStatementResult, DropTablePayload, DropTableResult, ForeignKeyConstraint,
    IndexDefinition, PrimaryKeyConstraint, QueryResult, SchemaColumn, SchemaForeignKey,
    TableColumn, TableSchemaInfo, UniqueConstraint,
};
use crate::core::{error::AppError, result::AppResult};
use super::postgresql::quote_identifier_pg;

/// Wrap an identifier in backticks, escaping any internal backticks.
fn quote_identifier_mysql(id: &str) -> String {
    format!("`{}`", id.replace('`', "``"))
}

fn ensure_supported_driver(driver: &str) -> AppResult<()> {
    match driver {
        "postgresql" | "mysql" | "sqlite" => Ok(()),
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

pub(crate) fn extract_mysql_value(row: &sqlx::mysql::MySqlRow, column_name: &str) -> serde_json::Value {
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
        return serde_json::Value::String(v.to_string());
    }
    // Chrono types – format as ISO strings so the frontend receives human-readable values
    if let Ok(Some(v)) = row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>(column_name) {
        return serde_json::Value::String(v.to_rfc3339());
    }
    if let Ok(Some(v)) = row.try_get::<Option<chrono::NaiveDateTime>, _>(column_name) {
        return serde_json::Value::String(v.to_string());
    }
    if let Ok(Some(v)) = row.try_get::<Option<chrono::NaiveDate>, _>(column_name) {
        return serde_json::Value::String(v.to_string());
    }
    if let Ok(Some(v)) = row.try_get::<Option<chrono::NaiveTime>, _>(column_name) {
        return serde_json::Value::String(v.to_string());
    }
    serde_json::Value::Null
}


pub(crate) fn extract_sqlite_value(row: &sqlx::sqlite::SqliteRow, column_name: &str) -> serde_json::Value {
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
    if let Ok(Some(v)) = row.try_get::<Option<bool>, _>(column_name) {
        return serde_json::json!(v);
    }
    serde_json::Value::Null
}
pub async fn test_connection(payload: &ConnectionPayload) -> AppResult<()> {
    ensure_supported_driver(payload.r#type.as_str())?;

    match payload.r#type.as_str() {
        "postgresql" => {
            return test_connection_pg(payload).await;
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
        "sqlite" => {
            let options = SqliteConnectOptions::new()
                .filename(&payload.database)
                .create_if_missing(true);
            let conn = sqlx::SqliteConnection::connect_with(&options).await?;
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
            return execute_sql_pg(payload, sql).await;
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
                    // When 0 rows, prepare the statement to extract column metadata
                    // so the frontend can show column headers even with no data.
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
        "sqlite" => {
            let options = SqliteConnectOptions::new()
                .filename(&payload.database)
                .create_if_missing(true);
            let mut conn = sqlx::SqliteConnection::connect_with(&options).await?;

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
        _ => Err(AppError::UnsupportedDriver(payload.r#type.clone())),
    }
}

// ── Table Schema Introspection ────────────────────────────────────

pub async fn get_table_schema(
    payload: &ConnectionPayload,
    table_name: &str,
) -> AppResult<TableSchemaInfo> {
    ensure_supported_driver(payload.r#type.as_str())?;

    if table_name.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "table_name cannot be empty".to_string(),
        ));
    }

    match payload.r#type.as_str() {
        "postgresql" => get_pg_table_schema(payload, table_name).await,
        "mysql" => get_mysql_table_schema(payload, table_name).await,
        "sqlite" => get_sqlite_table_schema(payload, table_name).await,
        _ => Err(AppError::UnsupportedDriver(payload.r#type.clone())),
    }
}

// ── PostgreSQL Schema Introspection ───────────────────────────────

async fn get_pg_table_schema(
    payload: &ConnectionPayload,
    table_name: &str,
) -> AppResult<TableSchemaInfo> {
    let options = PgConnectOptions::new()
        .host(payload.host.as_str())
        .port(payload.port)
        .username(payload.username.as_str())
        .password(payload.password.as_str())
        .database(payload.database.as_str());
    let mut conn = sqlx::PgConnection::connect_with(&options).await?;

    let schema = if payload.schema.is_empty() {
        "public".to_string()
    } else {
        payload.schema.clone()
    };

    // ── Resolve canonical table name & schema ─────────────────────
    // PostgreSQL normalizes unquoted identifiers to lowercase, so
    // `CREATE TABLE MenuItem` is stored as `menuitem`.  Quoted
    // identifiers (`"MenuItem"`) preserve case.  The caller may pass
    // a mixed-case name from a sidebar label.
    //
    // Strategy: use information_schema with LOWER() on BOTH sides so
    // we match regardless of quoting style.  Try the provided schema
    // first, then fall back to searching all user schemas.
    let resolved: Option<(String, String)> = sqlx::query_as::<_, (String, String)>(
        "SELECT table_schema, table_name FROM information_schema.tables \
         WHERE table_schema = $1 AND LOWER(table_name) = LOWER($2) LIMIT 1",
    )
    .bind(&schema)
    .bind(table_name)
    .fetch_optional(&mut conn)
    .await?;

    let (found_schema, canonical_name) = match resolved {
        Some((s, n)) => (s, n),
        None => {
            // Schema-specific lookup failed — search all user schemas
            let broad: Option<(String, String)> = sqlx::query_as::<_, (String, String)>(
                "SELECT table_schema, table_name FROM information_schema.tables \
                 WHERE table_schema NOT IN ('pg_catalog','information_schema') \
                 AND LOWER(table_name) = LOWER($1) LIMIT 1",
            )
            .bind(table_name)
            .fetch_optional(&mut conn)
            .await?;

            match broad {
                Some((s, n)) => (s, n),
                None => {
                    conn.close().await?;
                    return Err(AppError::InvalidInput(format!(
                        "table '{}.{}' does not exist",
                        schema, table_name
                    )));
                }
            }
        }
    };

    let schema = found_schema;

    // ── Columns ───────────────────────────────────────────────────
    let column_rows = sqlx::query(
        r#"
        SELECT
            c.column_name,
            c.data_type,
            c.udt_name,
            c.is_nullable,
            c.column_default,
            c.identity_generation,
            pgd.description AS column_comment
        FROM information_schema.columns c
        LEFT JOIN pg_catalog.pg_statio_all_tables st
            ON st.schemaname = c.table_schema AND st.relname = c.table_name
        LEFT JOIN pg_catalog.pg_description pgd
            ON pgd.objoid = st.relid
            AND pgd.objsubid = c.ordinal_position
        WHERE c.table_schema = $1 AND c.table_name = $2
        ORDER BY c.ordinal_position
        "#,
    )
    .bind(&schema)
    .bind(&canonical_name)
    .fetch_all(&mut conn)
    .await?;

    let columns: Vec<TableColumn> = column_rows
        .iter()
        .map(|row| {
            let udt_name: String = row.get("udt_name");
            let identity: Option<String> = row.get("identity_generation");
            let default_val: Option<String> = row.get("column_default");

            // Use udt_name for a more precise type (e.g. int4, varchar, timestamptz)
            let data_type = udt_name.clone();
            let is_auto_increment = identity.is_some()
                || default_val
                    .as_deref()
                    .unwrap_or("")
                    .contains("nextval");

            TableColumn {
                name: row.get("column_name"),
                data_type,
                is_nullable: row.get::<&str, _>("is_nullable") == "YES",
                default_value: default_val,
                is_auto_increment,
                comment: row.get("column_comment"),
            }
        })
        .collect();

    // ── Primary Key ───────────────────────────────────────────────
    let pk_rows = sqlx::query(
        r#"
        SELECT
            tc.constraint_name,
            kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = $1
            AND tc.table_name = $2
            AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position
        "#,
    )
    .bind(&schema)
    .bind(&canonical_name)
    .fetch_all(&mut conn)
    .await?;

    let primary_key = if pk_rows.is_empty() {
        None
    } else {
        let pk_name: String = pk_rows[0].get("constraint_name");
        let pk_columns: Vec<String> = pk_rows.iter().map(|r| r.get("column_name")).collect();
        Some(PrimaryKeyConstraint {
            name: pk_name,
            columns: pk_columns,
        })
    };

    // ── Unique Constraints ────────────────────────────────────────
    let unique_rows = sqlx::query(
        r#"
        SELECT
            tc.constraint_name,
            kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = $1
            AND tc.table_name = $2
            AND tc.constraint_type = 'UNIQUE'
        ORDER BY tc.constraint_name, kcu.ordinal_position
        "#,
    )
    .bind(&schema)
    .bind(&canonical_name)
    .fetch_all(&mut conn)
    .await?;

    let unique_constraints = group_constraint_columns(unique_rows);

    // ── Foreign Keys ──────────────────────────────────────────────
    let fk_rows = sqlx::query(
        r#"
        SELECT
            tc.constraint_name,
            kcu.column_name,
            ccu.table_schema AS referenced_schema,
            ccu.table_name   AS referenced_table,
            ccu.column_name  AS referenced_column,
            rc.update_rule   AS on_update,
            rc.delete_rule   AS on_delete
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
            AND tc.table_schema = ccu.table_schema
        JOIN information_schema.referential_constraints rc
            ON tc.constraint_name = rc.constraint_name
            AND tc.table_schema = rc.constraint_schema
        WHERE tc.table_schema = $1
            AND tc.table_name = $2
            AND tc.constraint_type = 'FOREIGN KEY'
        ORDER BY tc.constraint_name, kcu.ordinal_position
        "#,
    )
    .bind(&schema)
    .bind(&canonical_name)
    .fetch_all(&mut conn)
    .await?;

    let foreign_keys = build_foreign_keys(fk_rows);

    // ── Indexes ───────────────────────────────────────────────────
    let index_rows = sqlx::query(
        r#"
        SELECT
            i.relname AS index_name,
            ix.indisunique AS is_unique,
            am.amname AS index_type,
            array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) AS column_names
        FROM pg_index ix
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_am am ON am.oid = i.relam
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        WHERE n.nspname = $1
            AND t.relname = $2
        GROUP BY i.relname, ix.indisunique, am.amname
        ORDER BY i.relname
        "#,
    )
    .bind(&schema)
    .bind(&canonical_name)
    .fetch_all(&mut conn)
    .await?;

    let indexes: Vec<IndexDefinition> = index_rows
        .iter()
        .map(|row| {
            let cols: Vec<String> = row.get("column_names");
            IndexDefinition {
                name: row.get("index_name"),
                columns: cols,
                is_unique: row.get("is_unique"),
                index_type: row.get("index_type"),
            }
        })
        .collect();

    conn.close().await?;

    Ok(TableSchemaInfo {
        table_name: canonical_name,
        schema,
        columns,
        primary_key,
        unique_constraints,
        foreign_keys,
        indexes,
    })
}

// ── MySQL Schema Introspection ────────────────────────────────────

async fn get_mysql_table_schema(
    payload: &ConnectionPayload,
    table_name: &str,
) -> AppResult<TableSchemaInfo> {
    let options = MySqlConnectOptions::new()
        .host(payload.host.as_str())
        .port(payload.port)
        .username(payload.username.as_str())
        .password(payload.password.as_str())
        .database(payload.database.as_str());
    let mut conn = sqlx::MySqlConnection::connect_with(&options).await?;

    let db = &payload.database;

    // Verify the table exists
    let table_exists: (String,) = sqlx::query_as(
        "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?"
    )
    .bind(db)
    .bind(table_name)
    .fetch_optional(&mut conn)
    .await?
    .ok_or_else(|| {
        AppError::InvalidInput(format!("table '{}.{}' does not exist", db, table_name))
    })?;
    // Ensure the table was found
    let _ = table_exists;

    // ── Columns ───────────────────────────────────────────────────
    let column_rows = sqlx::query(
        r#"
        SELECT
            COLUMN_NAME,
            DATA_TYPE,
            COLUMN_TYPE,
            IS_NULLABLE,
            COLUMN_DEFAULT,
            EXTRA,
            COLUMN_COMMENT
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
        "#,
    )
    .bind(db)
    .bind(table_name)
    .fetch_all(&mut conn)
    .await?;

    let columns: Vec<TableColumn> = column_rows
        .iter()
        .map(|row| {
            let extra: String = row.get("EXTRA");
            let col_type: String = row.get("COLUMN_TYPE");
            TableColumn {
                name: row.get("COLUMN_NAME"),
                data_type: col_type,
                is_nullable: row.get::<&str, _>("IS_NULLABLE") == "YES",
                default_value: row.get("COLUMN_DEFAULT"),
                is_auto_increment: extra.contains("auto_increment"),
                comment: row.get("COLUMN_COMMENT"),
            }
        })
        .collect();

    // ── Primary Key ───────────────────────────────────────────────
    let pk_rows = sqlx::query(
        r#"
        SELECT INDEX_NAME, COLUMN_NAME
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME = ?
            AND INDEX_NAME = 'PRIMARY'
        ORDER BY SEQ_IN_INDEX
        "#,
    )
    .bind(db)
    .bind(table_name)
    .fetch_all(&mut conn)
    .await?;

    let primary_key = if pk_rows.is_empty() {
        None
    } else {
        let pk_columns: Vec<String> = pk_rows.iter().map(|r| r.get("COLUMN_NAME")).collect();
        Some(PrimaryKeyConstraint {
            name: "PRIMARY".to_string(),
            columns: pk_columns,
        })
    };

    // ── Unique Constraints ────────────────────────────────────────
    let unique_rows = sqlx::query(
        r#"
        SELECT s.INDEX_NAME AS constraint_name, s.COLUMN_NAME
        FROM information_schema.STATISTICS s
        JOIN information_schema.TABLE_CONSTRAINTS tc
            ON tc.TABLE_SCHEMA = s.TABLE_SCHEMA
            AND tc.TABLE_NAME = s.TABLE_NAME
            AND tc.CONSTRAINT_NAME = s.INDEX_NAME
        WHERE s.TABLE_SCHEMA = ?
            AND s.TABLE_NAME = ?
            AND tc.CONSTRAINT_TYPE = 'UNIQUE'
        ORDER BY s.INDEX_NAME, s.SEQ_IN_INDEX
        "#,
    )
    .bind(db)
    .bind(table_name)
    .fetch_all(&mut conn)
    .await?;

    let unique_constraints = group_constraint_columns_mysql(unique_rows);

    // ── Foreign Keys ──────────────────────────────────────────────
    let fk_rows = sqlx::query(
        r#"
        SELECT
            kcu.CONSTRAINT_NAME,
            kcu.COLUMN_NAME,
            kcu.REFERENCED_TABLE_SCHEMA,
            kcu.REFERENCED_TABLE_NAME,
            kcu.REFERENCED_COLUMN_NAME,
            rc.UPDATE_RULE,
            rc.DELETE_RULE
        FROM information_schema.KEY_COLUMN_USAGE kcu
        JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
            ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
            AND kcu.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
        WHERE kcu.TABLE_SCHEMA = ?
            AND kcu.TABLE_NAME = ?
            AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
        "#,
    )
    .bind(db)
    .bind(table_name)
    .fetch_all(&mut conn)
    .await?;

    let foreign_keys = build_foreign_keys_mysql(fk_rows);

    // ── Indexes ───────────────────────────────────────────────────
    let index_rows = sqlx::query(
        r#"
        SELECT
            INDEX_NAME,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS column_names,
            NOT NON_UNIQUE AS is_unique,
            INDEX_TYPE
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME = ?
        GROUP BY INDEX_NAME, INDEX_TYPE, NON_UNIQUE
        ORDER BY INDEX_NAME
        "#,
    )
    .bind(db)
    .bind(table_name)
    .fetch_all(&mut conn)
    .await?;

    let indexes: Vec<IndexDefinition> = index_rows
        .iter()
        .map(|row| {
            let cols_str: String = row.get("column_names");
            IndexDefinition {
                name: row.get("INDEX_NAME"),
                columns: cols_str.split(',').map(|s| s.trim().to_string()).collect(),
                is_unique: row.get("is_unique"),
                index_type: row.get::<String, _>("INDEX_TYPE").to_lowercase(),
            }
        })
        .collect();

    conn.close().await?;

    Ok(TableSchemaInfo {
        table_name: table_name.to_string(),
        schema: db.clone(),
        columns,
        primary_key,
        unique_constraints,
        foreign_keys,
        indexes,
    })
}

// ── Helper Functions ──────────────────────────────────────────────

/// Group PostgreSQL unique constraint rows (one row per column) into UniqueConstraint entries.
fn group_constraint_columns(
    rows: Vec<sqlx::postgres::PgRow>,
) -> Vec<UniqueConstraint> {
    let mut map: std::collections::BTreeMap<String, Vec<String>> =
        std::collections::BTreeMap::new();
    for row in rows {
        let name: String = row.get("constraint_name");
        let col: String = row.get("column_name");
        map.entry(name).or_default().push(col);
    }
    map.into_iter()
        .map(|(name, columns)| UniqueConstraint { name, columns })
        .collect()
}

/// Group MySQL unique constraint rows into UniqueConstraint entries.
fn group_constraint_columns_mysql(
    rows: Vec<sqlx::mysql::MySqlRow>,
) -> Vec<UniqueConstraint> {
    let mut map: std::collections::BTreeMap<String, Vec<String>> =
        std::collections::BTreeMap::new();
    for row in rows {
        let name: String = row.get("constraint_name");
        let col: String = row.get("COLUMN_NAME");
        map.entry(name).or_default().push(col);
    }
    map.into_iter()
        .map(|(name, columns)| UniqueConstraint { name, columns })
        .collect()
}

/// Build foreign key entries from PostgreSQL referential constraint rows.
fn build_foreign_keys(rows: Vec<sqlx::postgres::PgRow>) -> Vec<ForeignKeyConstraint> {
    use std::collections::BTreeMap;

    // Intermediate: (constraint_name) -> ForeignKeyConstraint
    let mut map: BTreeMap<String, ForeignKeyConstraint> = BTreeMap::new();
    for row in rows {
        let name: String = row.get("constraint_name");
        let col: String = row.get("column_name");
        let ref_schema: String = row.get("referenced_schema");
        let ref_table: String = row.get("referenced_table");
        let ref_col: String = row.get("referenced_column");
        let on_update: String = row.get("on_update");
        let on_delete: String = row.get("on_delete");

        map.entry(name.clone())
            .and_modify(|fk| {
                fk.columns.push(col.clone());
                fk.referenced_columns.push(ref_col.clone());
            })
            .or_insert(ForeignKeyConstraint {
                name,
                columns: vec![col],
                referenced_table: ref_table,
                referenced_schema: ref_schema,
                referenced_columns: vec![ref_col],
                on_update,
                on_delete,
            });
    }
    map.into_values().collect()
}

/// Build foreign key entries from MySQL referential constraint rows.
fn build_foreign_keys_mysql(rows: Vec<sqlx::mysql::MySqlRow>) -> Vec<ForeignKeyConstraint> {
    use std::collections::BTreeMap;

    let mut map: BTreeMap<String, ForeignKeyConstraint> = BTreeMap::new();
    for row in rows {
        let name: String = row.get("CONSTRAINT_NAME");
        let col: String = row.get("COLUMN_NAME");
        let ref_schema: String = row.get("REFERENCED_TABLE_SCHEMA");
        let ref_table: String = row.get("REFERENCED_TABLE_NAME");
        let ref_col: String = row.get("REFERENCED_COLUMN_NAME");
        let on_update: String = row.get("UPDATE_RULE");
        let on_delete: String = row.get("DELETE_RULE");

        map.entry(name.clone())
            .and_modify(|fk| {
                fk.columns.push(col.clone());
                fk.referenced_columns.push(ref_col.clone());
            })
            .or_insert(ForeignKeyConstraint {
                name,
                columns: vec![col],
                referenced_table: ref_table,
                referenced_schema: ref_schema,
                referenced_columns: vec![ref_col],
                on_update,
                on_delete,
            });
    }
    map.into_values().collect()
}

// ── Bulk Foreign Key Fetch ──────────────────────────────────────

/// Fetch all foreign key relationships for an entire schema/database in one query.
/// Used by the ER Diagram to render edges without N+1 per-table queries.
pub async fn get_all_foreign_keys(
    payload: &ConnectionPayload,
) -> AppResult<Vec<SchemaForeignKey>> {
    ensure_supported_driver(payload.r#type.as_str())?;

    match payload.r#type.as_str() {
        "postgresql" => get_all_foreign_keys_pg(payload).await,
        "mysql" => get_all_foreign_keys_mysql(payload).await,
        "sqlite" => get_all_foreign_keys_sqlite(payload).await,
        _ => Err(AppError::UnsupportedDriver(payload.r#type.clone())),
    }
}

async fn get_all_foreign_keys_pg(
    payload: &ConnectionPayload,
) -> AppResult<Vec<SchemaForeignKey>> {
    let options = PgConnectOptions::new()
        .host(payload.host.as_str())
        .port(payload.port)
        .username(payload.username.as_str())
        .password(payload.password.as_str())
        .database(payload.database.as_str());
    let mut conn = sqlx::PgConnection::connect_with(&options).await?;

    let schema = if payload.schema.is_empty() {
        "public".to_string()
    } else {
        payload.schema.clone()
    };

    let rows = sqlx::query(
        r#"
        SELECT
            tc.table_name        AS source_table,
            tc.constraint_name,
            kcu.column_name,
            ccu.table_name       AS referenced_table,
            ccu.table_schema     AS referenced_schema
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
            AND tc.table_schema = ccu.table_schema
        WHERE tc.table_schema = $1
            AND tc.constraint_type = 'FOREIGN KEY'
        ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
        "#,
    )
    .bind(&schema)
    .fetch_all(&mut conn)
    .await?;

    let result = build_schema_foreign_keys_pg(rows);
    conn.close().await?;
    Ok(result)
}

fn build_schema_foreign_keys_pg(
    rows: Vec<sqlx::postgres::PgRow>,
) -> Vec<SchemaForeignKey> {
    use std::collections::BTreeMap;

    // Key: (source_table, constraint_name)
    let mut map: BTreeMap<(String, String), SchemaForeignKey> = BTreeMap::new();
    for row in rows {
        let source_table: String = row.get("source_table");
        let constraint_name: String = row.get("constraint_name");
        let col: String = row.get("column_name");
        let ref_table: String = row.get("referenced_table");
        let ref_schema: String = row.get("referenced_schema");

        let key = (source_table.clone(), constraint_name.clone());
        map.entry(key)
            .and_modify(|fk| {
                fk.columns.push(col.clone());
                fk.referenced_columns.push(col.clone());
            })
            .or_insert(SchemaForeignKey {
                source_table,
                constraint_name,
                columns: vec![col.clone()],
                referenced_table: ref_table,
                referenced_schema: ref_schema,
                referenced_columns: vec![col],
            });
    }
    map.into_values().collect()
}

async fn get_all_foreign_keys_mysql(
    payload: &ConnectionPayload,
) -> AppResult<Vec<SchemaForeignKey>> {
    let options = MySqlConnectOptions::new()
        .host(payload.host.as_str())
        .port(payload.port)
        .username(payload.username.as_str())
        .password(payload.password.as_str())
        .database(payload.database.as_str());
    let mut conn = sqlx::MySqlConnection::connect_with(&options).await?;

    let db = &payload.database;

    let rows = sqlx::query(
        r#"
        SELECT
            kcu.TABLE_NAME            AS source_table,
            kcu.CONSTRAINT_NAME       AS constraint_name,
            kcu.COLUMN_NAME           AS column_name,
            kcu.REFERENCED_TABLE_NAME AS referenced_table,
            kcu.REFERENCED_TABLE_SCHEMA AS referenced_schema
        FROM information_schema.KEY_COLUMN_USAGE kcu
        WHERE kcu.TABLE_SCHEMA = ?
            AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
        "#,
    )
    .bind(db)
    .fetch_all(&mut conn)
    .await?;

    let result = build_schema_foreign_keys_mysql(rows);
    conn.close().await?;
    Ok(result)
}

fn build_schema_foreign_keys_mysql(
    rows: Vec<sqlx::mysql::MySqlRow>,
) -> Vec<SchemaForeignKey> {
    use std::collections::BTreeMap;

    let mut map: BTreeMap<(String, String), SchemaForeignKey> = BTreeMap::new();
    for row in rows {
        let source_table: String = row.get("source_table");
        let constraint_name: String = row.get("constraint_name");
        let col: String = row.get("column_name");
        let ref_table: String = row.get("referenced_table");
        let ref_schema: String = row.get("referenced_schema");

        let key = (source_table.clone(), constraint_name.clone());
        map.entry(key)
            .and_modify(|fk| {
                fk.columns.push(col.clone());
                fk.referenced_columns.push(col.clone());
            })
            .or_insert(SchemaForeignKey {
                source_table,
                constraint_name,
                columns: vec![col.clone()],
                referenced_table: ref_table,
                referenced_schema: ref_schema,
                referenced_columns: vec![col],
            });
    }
    map.into_values().collect()
}

// ── Bulk Column Fetch ───────────────────────────────────────────

/// Fetch all columns for every table in a schema/database in one query.
/// Used by the ER Diagram to show table columns in nodes.
pub async fn get_all_columns(
    payload: &ConnectionPayload,
) -> AppResult<Vec<SchemaColumn>> {
    match payload.r#type.as_str() {
        "postgresql" => get_all_columns_pg(payload).await,
        "mysql" => get_all_columns_mysql(payload).await,
        "sqlite" => get_all_columns_sqlite(payload).await,
        _ => Err(AppError::UnsupportedDriver(payload.r#type.clone())),
    }
}

async fn get_all_columns_pg(
    payload: &ConnectionPayload,
) -> AppResult<Vec<SchemaColumn>> {
    let options = PgConnectOptions::new()
        .host(payload.host.as_str())
        .port(payload.port)
        .username(payload.username.as_str())
        .password(payload.password.as_str())
        .database(payload.database.as_str());
    let mut conn = sqlx::PgConnection::connect_with(&options).await?;

    let schema = if payload.schema.is_empty() {
        "public".to_string()
    } else {
        payload.schema.clone()
    };

    let rows = sqlx::query(
        r#"
        SELECT 
            table_name,
            column_name,
            is_nullable = 'YES' AS is_nullable,
            column_default,
            udt_name as data_type_name,
            CASE 
                WHEN data_type = 'ARRAY' THEN substring(udt_name, 2) || '[]'
                WHEN character_maximum_length IS NOT NULL THEN udt_name || '(' || character_maximum_length || ')'
                WHEN data_type IN ('numeric', 'decimal') THEN udt_name || '(' || numeric_precision || ',' || numeric_scale || ')'
                WHEN datetime_precision IS NOT NULL AND datetime_precision < 6 
                     AND udt_name IN ('timestamp', 'timestamptz', 'time', 'timetz', 'interval') 
                     THEN udt_name || '(' || datetime_precision || ')'
                ELSE udt_name
            END as data_type
        FROM information_schema.columns
        WHERE table_schema = $1
        ORDER BY table_name, ordinal_position
        "#,
    )
    .bind(&schema)
    .fetch_all(&mut conn)
    .await?;

    let result: Vec<SchemaColumn> = rows
        .into_iter()
        .map(|row| SchemaColumn {
            table_name: row.get("table_name"),
            column_name: row.get("column_name"),
            data_type: row.get("data_type"),
            is_nullable: row.get::<bool, _>("is_nullable"),
            default_value: row.get("column_default"),
            data_type_name: row.get("data_type_name"),
        })
        .collect();

    conn.close().await?;
    Ok(result)
}

async fn get_all_columns_mysql(
    payload: &ConnectionPayload,
) -> AppResult<Vec<SchemaColumn>> {
    let options = MySqlConnectOptions::new()
        .host(payload.host.as_str())
        .port(payload.port)
        .username(payload.username.as_str())
        .password(payload.password.as_str())
        .database(payload.database.as_str());
    let mut conn = sqlx::MySqlConnection::connect_with(&options).await?;

    let db = &payload.database;

    let rows = sqlx::query(
        r#"
        SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLUMN_TYPE AS data_type, IS_NULLABLE = 'YES' AS is_nullable, COLUMN_DEFAULT AS column_default, DATA_TYPE AS data_type_name
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME, ORDINAL_POSITION
        "#,
    )
    .bind(db)
    .fetch_all(&mut conn)
    .await?;

    let result: Vec<SchemaColumn> = rows
        .into_iter()
        .map(|row| SchemaColumn {
            table_name: row.get("table_name"),
            column_name: row.get("column_name"),
            data_type: row.get("data_type"),
            is_nullable: row.get::<bool, _>("is_nullable"),
            default_value: row.get("column_default"),
            data_type_name: row.get("data_type_name"),
        })
        .collect();

    conn.close().await?;
    Ok(result)
}

// ── DDL Execution ────────────────────────────────────────────────

/// Execute a validated DDL plan against the target database.
///
/// PostgreSQL wraps all statements in a transaction so partial failures roll back.
/// MySQL does not support transactional DDL, so each statement is executed independently.
pub async fn execute_ddl_statements(
    payload: &ConnectionPayload,
    plan: &DdlPlan,
) -> AppResult<DdlExecutionResult> {
    ensure_supported_driver(payload.r#type.as_str())?;

    match payload.r#type.as_str() {
        "postgresql" => execute_ddl_pg(payload, plan).await,
        "mysql" => execute_ddl_mysql(payload, plan).await,
        "sqlite" => execute_ddl_sqlite(payload, plan).await,
        _ => Err(AppError::UnsupportedDriver(payload.r#type.clone())),
    }
}

async fn execute_ddl_pg(
    payload: &ConnectionPayload,
    plan: &DdlPlan,
) -> AppResult<DdlExecutionResult> {
    let options = PgConnectOptions::new()
        .host(payload.host.as_str())
        .port(payload.port)
        .username(payload.username.as_str())
        .password(payload.password.as_str())
        .database(payload.database.as_str());
    let mut conn = sqlx::PgConnection::connect_with(&options).await?;

    // Set search_path if schema is specified
    if !payload.schema.is_empty() {
        sqlx::query(&format!(
            "SET search_path TO {}",
            quote_identifier_pg(&payload.schema)
        ))
        .execute(&mut conn)
        .await?;
    }

    // Wrap in transaction for atomic DDL
    sqlx::query("BEGIN").execute(&mut conn).await?;

    let mut results: Vec<DdlStatementResult> = Vec::new();
    let mut all_ok = true;

    for stmt in &plan.statements {
        let start = Instant::now();
        let res = sqlx::query(&stmt.sql).execute(&mut conn).await;
        let elapsed = start.elapsed().as_millis();

        match res {
            Ok(_) => {
                results.push(DdlStatementResult {
                    order: stmt.order,
                    sql: stmt.sql.clone(),
                    success: true,
                    error: None,
                    elapsed_ms: elapsed,
                });
            }
            Err(err) => {
                all_ok = false;
                results.push(DdlStatementResult {
                    order: stmt.order,
                    sql: stmt.sql.clone(),
                    success: false,
                    error: Some(err.to_string()),
                    elapsed_ms: elapsed,
                });
                // Rollback on first error
                let _ = sqlx::query("ROLLBACK").execute(&mut conn).await;
                break;
            }
        }
    }

    if all_ok {
        sqlx::query("COMMIT").execute(&mut conn).await?;
    }

    conn.close().await?;

    Ok(DdlExecutionResult {
        success: all_ok,
        executed_count: results.len() as u32,
        statements: results,
    })
}

async fn execute_ddl_mysql(
    payload: &ConnectionPayload,
    plan: &DdlPlan,
) -> AppResult<DdlExecutionResult> {
    let options = MySqlConnectOptions::new()
        .host(payload.host.as_str())
        .port(payload.port)
        .username(payload.username.as_str())
        .password(payload.password.as_str())
        .database(payload.database.as_str());
    let mut conn = sqlx::MySqlConnection::connect_with(&options).await?;

    let mut results: Vec<DdlStatementResult> = Vec::new();
    let mut all_ok = true;

    for stmt in &plan.statements {
        let start = Instant::now();
        let res = sqlx::query(&stmt.sql).execute(&mut conn).await;
        let elapsed = start.elapsed().as_millis();

        match res {
            Ok(_) => {
                results.push(DdlStatementResult {
                    order: stmt.order,
                    sql: stmt.sql.clone(),
                    success: true,
                    error: None,
                    elapsed_ms: elapsed,
                });
            }
            Err(err) => {
                all_ok = false;
                results.push(DdlStatementResult {
                    order: stmt.order,
                    sql: stmt.sql.clone(),
                    success: false,
                    error: Some(err.to_string()),
                    elapsed_ms: elapsed,
                });
                // MySQL: stop on first error but keep already-executed results
                break;
            }
        }
    }

    conn.close().await?;

    Ok(DdlExecutionResult {
        success: all_ok,
        executed_count: results.len() as u32,
        statements: results,
    })
}

// ── Drop Table ─────────────────────────────────────────────────

/// Generate a connector-specific `DROP TABLE` statement with safe identifier quoting.
pub fn generate_drop_table_sql(driver: &str, schema: &str, table_name: &str, cascade: bool) -> String {
    let fq_table = match driver {
        "mysql" => {
            if schema.is_empty() {
                quote_identifier_mysql(table_name)
            } else {
                format!(
                    "{}.{}",
                    quote_identifier_mysql(schema),
                    quote_identifier_mysql(table_name)
                )
            }
        }
        "sqlite" => {
            let qt = super::sqlite::quote_identifier;
            if schema.is_empty() {
                qt(table_name)
            } else {
                format!("{}.{}", qt(schema), qt(table_name))
            }
        }
        _ => {
            // PostgreSQL: double-quote identifiers
            if schema.is_empty() {
                quote_identifier_pg(table_name)
            } else {
                format!(
                    "{}.{}",
                    quote_identifier_pg(schema),
                    quote_identifier_pg(table_name)
                )
            }
        }
    };

    let cascade_clause = if cascade { " CASCADE" } else { "" };
    format!("DROP TABLE {}{};", fq_table, cascade_clause)
}

/// Validate drop-table request inputs and execute the drop.
pub async fn drop_table(payload: &DropTablePayload) -> AppResult<DropTableResult> {
    ensure_supported_driver(payload.connection.r#type.as_str())?;

    if payload.table_name.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "table_name must not be empty".to_string(),
        ));
    }

    // Use connection schema as fallback when payload schema is empty
    let schema = if payload.schema.is_empty() {
        payload.connection.schema.clone()
    } else {
        payload.schema.clone()
    };

    let sql = generate_drop_table_sql(
        &payload.connection.r#type,
        &schema,
        &payload.table_name,
        payload.cascade,
    );

    let start = Instant::now();
    let result = execute_sql(&payload.connection, &sql).await;
    let elapsed = start.elapsed().as_millis();

    match result {
        Ok(_) => Ok(DropTableResult {
            success: true,
            sql,
            elapsed_ms: elapsed,
            error: None,
        }),
        Err(err) => Ok(DropTableResult {
            success: false,
            sql,
            elapsed_ms: elapsed,
            error: Some(err.to_string()),
        }),
    }
}

// ── Commit Table Changes (task-011c) ─────────────────────────────

/// Commit batched inserts, updates, and deletes atomically in a SQL transaction.
///
/// Steps:
/// 1. Re-fetch table schema to detect schema drift
/// 2. Validate that primary key column still exists
/// 3. Begin transaction
/// 4. Execute all INSERT statements
/// 5. Execute all UPDATE statements (WHERE pk = rowId)
/// 6. Execute all DELETE statements (WHERE pk = rowId)
/// 7. Commit on success, rollback on any failure
pub async fn commit_table_changes(
    payload: &CommitTableChangesPayload,
) -> AppResult<CommitTableChangesResult> {
    ensure_supported_driver(payload.connection.r#type.as_str())?;

    match payload.connection.r#type.as_str() {
        "postgresql" => commit_table_changes_pg(payload).await,
        "mysql" => commit_table_changes_mysql(payload).await,
        "sqlite" => commit_table_changes_sqlite(payload).await,
        _ => Err(AppError::UnsupportedDriver(payload.connection.r#type.clone())),
    }
}

/// PostgreSQL implementation of commit_table_changes.
async fn commit_table_changes_pg(
    payload: &CommitTableChangesPayload,
) -> AppResult<CommitTableChangesResult> {
    use sqlx::postgres::PgConnection;

    let options = PgConnectOptions::new()
        .host(payload.connection.host.as_str())
        .port(payload.connection.port)
        .username(payload.connection.username.as_str())
        .password(payload.connection.password.as_str())
        .database(payload.connection.database.as_str());
    let mut conn = sqlx::PgConnection::connect_with(&options).await?;

    // Set search_path if schema is specified
    if !payload.connection.schema.is_empty() {
        sqlx::query(&format!(
            "SET search_path TO {}",
            quote_identifier_pg(&payload.connection.schema)
        ))
        .execute(&mut conn)
        .await?;
    }

    // ── Schema drift detection ────────────────────────────────────
    // Re-fetch columns for the table and verify they match expectations.
    // get_pg_table_schema resolves the canonical name AND the correct schema,
    // so we use schema_info.schema for the fully-qualified table name below.
    let schema_info = get_pg_table_schema(&payload.connection, &payload.table_name).await?;
    let column_names: Vec<String> = schema_info.columns.iter().map(|c| c.name.clone()).collect();

    // Verify primary key column exists
    if !column_names.contains(&payload.primary_key_column) {
        conn.close().await?;
        return Err(AppError::InvalidInput(format!(
            "Primary key column '{}' not found in table schema. The table structure may have changed. Please refresh.",
            payload.primary_key_column
        )));
    }

    // ── Build fully-qualified table name using canonical name ─────
    // schema_info.table_name is the canonical name resolved by
    // get_pg_table_schema (e.g. "menuitem" not "MenuItem" for
    // unquoted PG identifiers).  Using payload.table_name directly
    // would fail with "relation does not exist" on mixed-case input.
    // schema_info.schema is the resolved schema (e.g. "public") even if
    // the caller sent an empty string.
    let fq_table = if schema_info.schema.is_empty() {
        quote_identifier_pg(&schema_info.table_name)
    } else {
        format!(
            "{}.{}",
            quote_identifier_pg(&schema_info.schema),
            quote_identifier_pg(&schema_info.table_name)
        )
    };

    let pk_quoted = quote_identifier_pg(&payload.primary_key_column);

    let mut inserted_rows: u64 = 0;
    let mut updated_rows: u64 = 0;
    let mut deleted_rows: u64 = 0;

    // ── Begin transaction ─────────────────────────────────────────
    let mut tx = conn.begin().await?;

    // ── Process INSERTs ───────────────────────────────────────────
    for insert_row in &payload.inserts {
        let cols: Vec<&String> = insert_row.keys().collect();
        if cols.is_empty() {
            continue;
        }
        let quoted_cols: Vec<String> = cols.iter().map(|c| quote_identifier_pg(c)).collect();
        let placeholders: Vec<String> = (1..=cols.len()).map(|i| format!("${}", i)).collect();

        let sql = format!(
            "INSERT INTO {} ({}) VALUES ({})",
            fq_table,
            quoted_cols.join(", "),
            placeholders.join(", "),
        );

        let mut query = sqlx::query(&sql);
        for col in &cols {
            let val = insert_row.get(*col as &str);
            query = bind_json_value_pg(query, val);
        }

        query.execute(&mut *tx).await.map_err(|e| {
            AppError::Database(format!("INSERT failed: {} (row values: {:?})", e, insert_row))
        })?;
        inserted_rows += 1;
    }

    // ── Process UPDATEs ───────────────────────────────────────────
    for update in &payload.updates {
        let changes = &update.changes;
        let cols: Vec<&String> = changes.keys().collect();
        if cols.is_empty() {
            continue;
        }
        let set_clauses: Vec<String> = cols
            .iter()
            .enumerate()
            .map(|(i, c)| format!("{} = ${}", quote_identifier_pg(c), i + 1))
            .collect();
        let pk_placeholder = format!("${}", cols.len() + 1);

        let sql = format!(
            "UPDATE {} SET {} WHERE {}::text = {}",
            fq_table,
            set_clauses.join(", "),
            pk_quoted,
            pk_placeholder,
        );

        let mut query = sqlx::query(&sql);
        for col in &cols {
            let val = changes.get(*col as &str);
            query = bind_json_value_pg(query, val);
        }
        query = query.bind(&update.row_id);

        query.execute(&mut *tx).await.map_err(|e| {
            AppError::Database(format!(
                "UPDATE failed for row '{}': {}",
                update.row_id, e
            ))
        })?;
        updated_rows += 1;
    }

    // ── Process DELETEs ───────────────────────────────────────────
    for row_id in &payload.deletes {
        if row_id.trim().is_empty() {
            continue;
        }
        let sql = format!(
            "DELETE FROM {} WHERE {}::text = $1",
            fq_table, pk_quoted,
        );
        sqlx::query(&sql)
            .bind(row_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Database(format!(
                    "DELETE failed for row '{}': {}",
                    row_id, e
                ))
            })?;
        deleted_rows += 1;
    }

    // ── Commit transaction ───────────────────────────────────────
    tx.commit().await?;
    conn.close().await?;

    Ok(CommitTableChangesResult {
        inserted_rows,
        updated_rows,
        deleted_rows,
    })
}

/// Bind a serde_json::Value to a PgQuery, dispatching on the JSON type.
fn bind_json_value_pg<'q>(
    query: sqlx::query::Query<'q, sqlx::postgres::Postgres, <sqlx::postgres::Postgres as sqlx::Database>::Arguments<'q>>,
    val: Option<&serde_json::Value>,
) -> sqlx::query::Query<'q, sqlx::postgres::Postgres, <sqlx::postgres::Postgres as sqlx::Database>::Arguments<'q>> {
    match val {
        None | Some(serde_json::Value::Null) => query.bind(None::<String>),
        Some(serde_json::Value::Bool(b)) => query.bind(*b),
        Some(serde_json::Value::Number(n)) => {
            if let Some(i) = n.as_i64() {
                query.bind(i)
            } else if let Some(f) = n.as_f64() {
                query.bind(f)
            } else {
                query.bind(n.to_string())
            }
        }
        Some(serde_json::Value::String(s)) => query.bind(s.clone()),
        Some(serde_json::Value::Array(arr)) => {
            // Serialize arrays as JSON strings for simple storage
            query.bind(serde_json::json!(arr).to_string())
        }
        Some(serde_json::Value::Object(obj)) => {
            query.bind(serde_json::json!(obj).to_string())
        }
    }
}

/// MySQL implementation of commit_table_changes.
async fn commit_table_changes_mysql(
    payload: &CommitTableChangesPayload,
) -> AppResult<CommitTableChangesResult> {
    use sqlx::mysql::MySqlConnection;

    let options = MySqlConnectOptions::new()
        .host(payload.connection.host.as_str())
        .port(payload.connection.port)
        .username(payload.connection.username.as_str())
        .password(payload.connection.password.as_str())
        .database(payload.connection.database.as_str());
    let mut conn = sqlx::MySqlConnection::connect_with(&options).await?;

    let fq_table = quote_identifier_mysql(&payload.table_name);
    let pk_quoted = quote_identifier_mysql(&payload.primary_key_column);

    let mut inserted_rows: u64 = 0;
    let mut updated_rows: u64 = 0;
    let mut deleted_rows: u64 = 0;

    // ── Begin transaction ─────────────────────────────────────────
    let mut tx = conn.begin().await?;

    // ── Process INSERTs ───────────────────────────────────────────
    for insert_row in &payload.inserts {
        let cols: Vec<&String> = insert_row.keys().collect();
        if cols.is_empty() {
            continue;
        }
        let quoted_cols: Vec<String> = cols.iter().map(|c| quote_identifier_mysql(c)).collect();
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
            query = bind_json_value_mysql(query, val);
        }

        query.execute(&mut *tx).await.map_err(|e| {
            AppError::Database(format!("INSERT failed: {} (row values: {:?})", e, insert_row))
        })?;
        inserted_rows += 1;
    }

    // ── Process UPDATEs ───────────────────────────────────────────
    for update in &payload.updates {
        let changes = &update.changes;
        let cols: Vec<&String> = changes.keys().collect();
        if cols.is_empty() {
            continue;
        }
        let set_clauses: Vec<String> = cols
            .iter()
            .enumerate()
            .map(|(i, c)| format!("{} = ?", quote_identifier_mysql(c)))
            .collect();

        let sql = format!(
            "UPDATE {} SET {} WHERE CAST({} AS CHAR) = ?",
            fq_table,
            set_clauses.join(", "),
            pk_quoted,
        );

        let mut query = sqlx::query(&sql);
        for col in &cols {
            let val = changes.get(*col as &str);
            query = bind_json_value_mysql(query, val);
        }
        query = query.bind(&update.row_id);

        query.execute(&mut *tx).await.map_err(|e| {
            AppError::Database(format!(
                "UPDATE failed for row '{}': {}",
                update.row_id, e
            ))
        })?;
        updated_rows += 1;
    }

    // ── Process DELETEs ───────────────────────────────────────────
    for row_id in &payload.deletes {
        if row_id.trim().is_empty() {
            continue;
        }
        let sql = format!("DELETE FROM {} WHERE CAST({} AS CHAR) = ?", fq_table, pk_quoted);
        sqlx::query(&sql)
            .bind(row_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Database(format!(
                    "DELETE failed for row '{}': {}",
                    row_id, e
                ))
            })?;
        deleted_rows += 1;
    }

    // ── Commit transaction ───────────────────────────────────────
    tx.commit().await?;
    conn.close().await?;

    Ok(CommitTableChangesResult {
        inserted_rows,
        updated_rows,
        deleted_rows,
    })
}

/// Bind a serde_json::Value to a MySQL query.
fn bind_json_value_mysql<'q>(
    query: sqlx::query::Query<'q, sqlx::mysql::MySql, <sqlx::mysql::MySql as sqlx::Database>::Arguments<'q>>,
    val: Option<&serde_json::Value>,
) -> sqlx::query::Query<'q, sqlx::mysql::MySql, <sqlx::mysql::MySql as sqlx::Database>::Arguments<'q>> {
    match val {
        None | Some(serde_json::Value::Null) => query.bind(None::<String>),
        Some(serde_json::Value::Bool(b)) => query.bind(*b as i32),
        Some(serde_json::Value::Number(n)) => {
            if let Some(i) = n.as_i64() {
                query.bind(i)
            } else if let Some(f) = n.as_f64() {
                query.bind(f)
            } else {
                query.bind(n.to_string())
            }
        }
        Some(serde_json::Value::String(s)) => query.bind(s.clone()),
        Some(serde_json::Value::Array(arr)) => {
            query.bind(serde_json::json!(arr).to_string())
        }
        Some(serde_json::Value::Object(obj)) => {
            query.bind(serde_json::json!(obj).to_string())
        }
    }
}

// ── SQLite-specific functions ─────────────────────────────────────

async fn get_sqlite_table_schema(
    payload: &ConnectionPayload,
    table_name: &str,
) -> AppResult<TableSchemaInfo> {
    super::sqlite::get_table_schema(payload, table_name).await
}

async fn execute_ddl_sqlite(
    payload: &ConnectionPayload,
    plan: &DdlPlan,
) -> AppResult<DdlExecutionResult> {
    super::sqlite::execute_ddl(payload, plan).await
}

async fn commit_table_changes_sqlite(
    payload: &CommitTableChangesPayload,
) -> AppResult<CommitTableChangesResult> {
    super::sqlite::commit_table_changes(payload).await
}

async fn get_all_columns_sqlite(
    payload: &ConnectionPayload,
) -> AppResult<Vec<SchemaColumn>> {
    super::sqlite::get_all_columns(payload).await
}

async fn get_all_foreign_keys_sqlite(
    payload: &ConnectionPayload,
) -> AppResult<Vec<SchemaForeignKey>> {
    super::sqlite::get_all_foreign_keys(payload).await
}

// ── PostgreSQL dispatch helpers (delegating to postgresql.rs) ─────

async fn test_connection_pg(payload: &ConnectionPayload) -> AppResult<()> {
    super::postgresql::test_connection(payload).await
}

async fn execute_sql_pg(payload: &ConnectionPayload, sql: &str) -> AppResult<QueryResult> {
    super::postgresql::execute_sql(payload, sql).await
}

// ── Tests ────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn drop_table_pg_quoting() {
        let sql = generate_drop_table_sql("postgresql", "public", "users", false);
        assert_eq!(sql, "DROP TABLE \"public\".\"users\";");
    }

    #[test]
    fn drop_table_pg_cascade() {
        let sql = generate_drop_table_sql("postgresql", "public", "users", true);
        assert_eq!(sql, "DROP TABLE \"public\".\"users\" CASCADE;");
    }

    #[test]
    fn drop_table_pg_no_schema() {
        let sql = generate_drop_table_sql("postgresql", "", "users", false);
        assert_eq!(sql, "DROP TABLE \"users\";");
    }

    #[test]
    fn drop_table_mysql_quoting() {
        let sql = generate_drop_table_sql("mysql", "mydb", "users", false);
        assert_eq!(sql, "DROP TABLE `mydb`.`users`;");
    }

    #[test]
    fn drop_table_mysql_cascade() {
        let sql = generate_drop_table_sql("mysql", "mydb", "users", true);
        assert_eq!(sql, "DROP TABLE `mydb`.`users` CASCADE;");
    }

    #[test]
    fn drop_table_mysql_no_schema() {
        let sql = generate_drop_table_sql("mysql", "", "users", false);
        assert_eq!(sql, "DROP TABLE `users`;");
    }

    #[test]
    fn drop_table_pg_escaping() {
        // Identifiers containing quotes should be escaped
        let sql = generate_drop_table_sql("postgresql", "public", "my\"table", false);
        assert_eq!(sql, "DROP TABLE \"public\".\"my\"\"table\";");
    }

    #[test]
    fn drop_table_mysql_escaping() {
        // Identifiers containing backticks should be escaped
        let sql = generate_drop_table_sql("mysql", "my`db", "my`table", false);
        assert_eq!(sql, "DROP TABLE `my``db`.`my``table`;");
    }
}
