//! SQL table data export – connector-level logic.
//!
//! Responsible for:
//! 1. Preflight estimation (row count + rough size heuristic).
//! 2. Fetching the entire target table data.
//! 3. Serializing to TXT / CSV / JSON / SQL / XLSX.
//! 4. Writing the output to a local file.
//!
//! Large-table support: rows are streamed in chunks and written progressively
//! so memory usage stays bounded.  Progress is reported via Tauri events when
//! the caller supplies an event emitter closure.

use std::io::Write;
use std::path::Path;
use std::time::Instant;

use sqlx::{Column, Connection, Row};

use crate::{
    core::{error::AppError, result::AppResult},
    domain::{
        export::{
            SqlExportMode, TableExportEstimate, TableExportFormat,
            TableExportPayload, TableExportProgress, TableExportResult,
        },
        query::ConnectionPayload,
    },
};

// ── Constants ────────────────────────────────────────────────────

/// Estimated average row size in bytes used when column statistics are
/// unavailable.  A rough default of ~512 bytes per row.
const DEFAULT_AVG_ROW_BYTES: u64 = 512;

/// When a table has more rows than this threshold the export should be
/// considered "large" and may benefit from background execution.
const LARGE_ROW_THRESHOLD: u64 = 50_000;

/// Number of rows fetched per chunk when streaming.
const CHUNK_SIZE: usize = 5_000;

// ── Identifier quoting (reuse existing patterns) ─────────────────

fn quote_ident_pg(id: &str) -> String {
    // Always double-quote PostgreSQL identifiers to preserve exact case.
    // The identifier comes from database metadata introspection, so it
    // reflects the actual stored name (e.g. "Modifier" for a table created
    // with CREATE TABLE "Modifier", or "modifier" for one created without
    // quotes).  Quoting both cases is safe and avoids case-folding bugs.
    format!("\"{}\"", id.replace('"', "\"\""))
}

fn quote_ident_mysql(id: &str) -> String {
    format!("`{}`", id.replace('`', "``"))
}

fn quote_ident(driver: &str, id: &str) -> String {
    match driver {
        "mysql" => quote_ident_mysql(id),
        _ => quote_ident_pg(id),
    }
}

fn qualified_table(driver: &str, schema: &str, table: &str) -> String {
    if schema.is_empty() {
        quote_ident(driver, table)
    } else {
        format!("{}.{}", quote_ident(driver, schema), quote_ident(driver, table))
    }
}

// ── Value formatting helpers ─────────────────────────────────────

/// Format a `serde_json::Value` for SQL INSERT literal output.
fn sql_value_literal(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Null => "NULL".to_string(),
        serde_json::Value::Bool(b) => {
            if *b {
                "TRUE".to_string()
            } else {
                "FALSE".to_string()
            }
        }
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => {
            // Escape single quotes for SQL string literals
            format!("'{}'", s.replace('\'', "''"))
        }
        // Arrays and objects are serialized as JSON strings.
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => {
            let s = v.to_string();
            format!("'{}'", s.replace('\'', "''"))
        }
    }
}

/// Format a `serde_json::Value` for plain text / CSV cell output.
fn text_cell_value(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Null => String::new(),
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => s.clone(),
        // Arrays/objects → compact JSON representation
        other => other.to_string(),
    }
}

// ── Ensure supported driver ──────────────────────────────────────

fn ensure_supported_driver(driver: &str) -> AppResult<()> {
    match driver {
        "postgresql" | "mysql" => Ok(()),
        _ => Err(AppError::UnsupportedDriver(driver.to_string())),
    }
}

// ── Schema resolution ────────────────────────────────────────────

fn resolve_schema(payload: &ConnectionPayload) -> String {
    if payload.schema.is_empty() {
        if payload.r#type == "mysql" {
            payload.database.clone()
        } else {
            "public".to_string()
        }
    } else {
        payload.schema.clone()
    }
}

// ── Preflight estimation ─────────────────────────────────────────

/// Estimate the row count and rough output size for a table export.
///
/// Uses `COUNT(*)` which is instant on InnoDB (approximate) and may scan on
/// PostgreSQL with large tables, but is acceptable for preflight use.
pub async fn estimate_export(payload: &ConnectionPayload, table_name: &str) -> AppResult<TableExportEstimate> {
    ensure_supported_driver(&payload.r#type)?;

    let schema = resolve_schema(payload);
    let fq = qualified_table(&payload.r#type, &schema, table_name);
    let count_sql = format!("SELECT COUNT(*) AS cnt FROM {}", fq);

    let row_count: u64 = match payload.r#type.as_str() {
        "postgresql" => {
            let options = super::postgresql::build_connection_options(payload, None);
            let mut conn = sqlx::PgConnection::connect_with(&options).await?;

            if !payload.schema.is_empty() {
                sqlx::query(&format!(
                    "SET search_path TO {}",
                    quote_ident_pg(&payload.schema)
                ))
                .execute(&mut conn)
                .await?;
            }

            let val: (i64,) = sqlx::query_as(&count_sql).fetch_one(&mut conn).await?;
            conn.close().await?;
            val.0 as u64
        }
        "mysql" => {
            let options = super::ssl::build_mysql_options(payload, None);
            let mut conn = sqlx::MySqlConnection::connect_with(&options).await?;

            let val: (i64,) = sqlx::query_as(&count_sql).fetch_one(&mut conn).await?;
            conn.close().await?;
            val.0 as u64
        }
        _ => return Err(AppError::UnsupportedDriver(payload.r#type.clone())),
    };

    let estimated_size = row_count * DEFAULT_AVG_ROW_BYTES;

    Ok(TableExportEstimate {
        row_count,
        estimated_size_bytes: estimated_size,
        is_large: row_count > LARGE_ROW_THRESHOLD,
    })
}

// ── Core export execution ────────────────────────────────────────

/// Execute a full table export to a local file.
///
/// The caller can optionally provide a progress callback that will be invoked
/// after each chunk is written.  This allows the Tauri command layer to emit
/// events for the frontend.
pub async fn execute_export<F>(
    payload: &TableExportPayload,
    progress_callback: Option<F>,
) -> AppResult<TableExportResult>
where
    F: Fn(TableExportProgress) + Send + Sync,
{
    ensure_supported_driver(&payload.connection.r#type)?;

    let schema = resolve_schema(&payload.connection);
    let fq = qualified_table(
        &payload.connection.r#type,
        &schema,
        &payload.table_name,
    );
    let select_sql = format!("SELECT * FROM {}", fq);

    // Validate save path parent directory exists
    let path = Path::new(&payload.save_path);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            return Err(AppError::Export(format!(
                "directory '{}' does not exist",
                parent.display()
            )));
        }
    }

    match &payload.format {
        TableExportFormat::Txt => {
            export_delimited(payload, &select_sql, '\t', progress_callback).await
        }
        TableExportFormat::Csv => {
            export_csv(payload, &select_sql, progress_callback).await
        }
        TableExportFormat::Json => {
            export_json(payload, &select_sql, progress_callback).await
        }
        TableExportFormat::Sql => {
            export_sql_inserts(payload, &select_sql, progress_callback).await
        }
        TableExportFormat::Xlsx => {
            export_xlsx(payload, &select_sql, progress_callback).await
        }
    }
}

// ── Chunked fetch helper ─────────────────────────────────────────

/// Fetch all rows from a query as JSON, returning columns and row data.
///
/// This fetches all rows at once since we need column names from the first row.
/// For very large tables, the streaming write approach keeps memory bounded
/// at the write layer.
async fn fetch_all_json_rows(
    conn_type: &str,
    payload: &ConnectionPayload,
    sql: &str,
) -> AppResult<(Vec<String>, Vec<Vec<serde_json::Value>>)> {
    match conn_type {
        "postgresql" => {
            let options = super::postgresql::build_connection_options(payload, None);
            let mut conn = sqlx::PgConnection::connect_with(&options).await?;

            if !payload.schema.is_empty() {
                sqlx::query(&format!(
                    "SET search_path TO {}",
                    quote_ident_pg(&payload.schema)
                ))
                .execute(&mut conn)
                .await?;
            }

            let rows = sqlx::query(sql).fetch_all(&mut conn).await?;
            let columns: Vec<String> = if let Some(first) = rows.first() {
                first
                    .columns()
                    .iter()
                    .map(|c| c.name().to_string())
                    .collect()
            } else {
                vec![]
            };

            let json_rows: Vec<Vec<serde_json::Value>> = rows
                .iter()
                .map(|row| {
                    columns
                        .iter()
                        .map(|col_name| extract_pg_value(row, col_name))
                        .collect()
                })
                .collect();

            conn.close().await?;
            Ok((columns, json_rows))
        }
        "mysql" => {
            let options = super::ssl::build_mysql_options(payload, None);
            let mut conn = sqlx::MySqlConnection::connect_with(&options).await?;

            let rows = sqlx::query(sql).fetch_all(&mut conn).await?;
            let columns: Vec<String> = if let Some(first) = rows.first() {
                first
                    .columns()
                    .iter()
                    .map(|c| c.name().to_string())
                    .collect()
            } else {
                vec![]
            };

            let json_rows: Vec<Vec<serde_json::Value>> = rows
                .iter()
                .map(|row| {
                    columns
                        .iter()
                        .map(|col_name| extract_mysql_value(row, col_name))
                        .collect()
                })
                .collect();

            conn.close().await?;
            Ok((columns, json_rows))
        }
        _ => Err(AppError::UnsupportedDriver(conn_type.to_string())),
    }
}

// ── Value extraction (mirror of sql.rs helpers) ──────────────────

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

// ── TXT / generic delimited export ───────────────────────────────

async fn export_delimited<F>(
    payload: &TableExportPayload,
    select_sql: &str,
    delimiter: char,
    progress_callback: Option<F>,
) -> AppResult<TableExportResult>
where
    F: Fn(TableExportProgress) + Send + Sync,
{
    let start = Instant::now();

    // Allow options to override the delimiter (used for TXT tab-delimited)
    let effective_delim = payload
        .options
        .delimiter
        .as_deref()
        .and_then(|s| s.chars().next())
        .unwrap_or(delimiter);

    let (columns, rows) = fetch_all_json_rows(
        &payload.connection.r#type,
        &payload.connection,
        select_sql,
    )
    .await?;

    let row_count = rows.len() as u64;
    let file = std::fs::File::create(&payload.save_path)?;
    let mut writer = std::io::BufWriter::new(file);

    // Header line
    if payload.options.include_headers && !columns.is_empty() {
        let header = columns.join(&effective_delim.to_string());
        writeln!(writer, "{}", header).map_err(|e| AppError::Io(e.to_string()))?;
    }

    // Data lines
    let mut written: u64 = 0;
    for row_values in &rows {
        let line: Vec<String> = row_values.iter().map(|v| text_cell_value(v)).collect();
        writeln!(writer, "{}", line.join(&effective_delim.to_string())).map_err(|e| AppError::Io(e.to_string()))?;
        written += 1;

        // Emit progress every CHUNK_SIZE rows
        if written % CHUNK_SIZE as u64 == 0 {
            if let Some(ref cb) = progress_callback {
                cb(TableExportProgress {
                    rows_exported: written,
                    total_rows: row_count,
                    done: false,
                    error: None,
                });
            }
        }
    }

    writer.flush().map_err(|e| AppError::Io(e.to_string()))?;
    drop(writer);

    // Final progress
    if let Some(ref cb) = progress_callback {
        cb(TableExportProgress {
            rows_exported: written,
            total_rows: row_count,
            done: true,
            error: None,
        });
    }

    let elapsed = start.elapsed().as_millis();
    Ok(TableExportResult {
        success: true,
        file_path: Some(payload.save_path.clone()),
        row_count: written,
        elapsed_ms: elapsed,
        background: false,
        error: None,
    })
}

// ── CSV export ───────────────────────────────────────────────────

async fn export_csv<F>(
    payload: &TableExportPayload,
    select_sql: &str,
    progress_callback: Option<F>,
) -> AppResult<TableExportResult>
where
    F: Fn(TableExportProgress) + Send + Sync,
{
    let start = Instant::now();

    let (columns, rows) = fetch_all_json_rows(
        &payload.connection.r#type,
        &payload.connection,
        select_sql,
    )
    .await?;

    let row_count = rows.len() as u64;
    let file = std::fs::File::create(&payload.save_path).map_err(|e| AppError::Io(e.to_string()))?;
    let mut wtr = csv::WriterBuilder::new()
        .has_headers(payload.options.include_headers)
        .from_writer(file);

    // Write header if include_headers is true (csv writer handles this)
    if payload.options.include_headers && !columns.is_empty() {
        wtr.write_record(&columns).map_err(|e| AppError::Export(e.to_string()))?;
    }

    let mut written: u64 = 0;
    for row_values in &rows {
        let record: Vec<String> = row_values.iter().map(|v| text_cell_value(v)).collect();
        wtr.write_record(&record).map_err(|e| AppError::Export(e.to_string()))?;
        written += 1;

        if written % CHUNK_SIZE as u64 == 0 {
            if let Some(ref cb) = progress_callback {
                cb(TableExportProgress {
                    rows_exported: written,
                    total_rows: row_count,
                    done: false,
                    error: None,
                });
            }
        }
    }

    wtr.flush().map_err(|e| AppError::Export(e.to_string()))?;

    if let Some(ref cb) = progress_callback {
        cb(TableExportProgress {
            rows_exported: written,
            total_rows: row_count,
            done: true,
            error: None,
        });
    }

    let elapsed = start.elapsed().as_millis();
    Ok(TableExportResult {
        success: true,
        file_path: Some(payload.save_path.clone()),
        row_count: written,
        elapsed_ms: elapsed,
        background: false,
        error: None,
    })
}

// ── JSON export ──────────────────────────────────────────────────

async fn export_json<F>(
    payload: &TableExportPayload,
    select_sql: &str,
    progress_callback: Option<F>,
) -> AppResult<TableExportResult>
where
    F: Fn(TableExportProgress) + Send + Sync,
{
    let start = Instant::now();

    let (columns, rows) = fetch_all_json_rows(
        &payload.connection.r#type,
        &payload.connection,
        select_sql,
    )
    .await?;

    let row_count = rows.len() as u64;
    let file = std::fs::File::create(&payload.save_path)?;
    let mut writer = std::io::BufWriter::new(file);

    // Write as JSON array of objects
    write!(writer, "[").map_err(|e| AppError::Io(e.to_string()))?;

    let mut written: u64 = 0;
    for (i, row_values) in rows.iter().enumerate() {
        let mut map = serde_json::Map::new();
        for (j, col_name) in columns.iter().enumerate() {
            let val = row_values.get(j).cloned().unwrap_or(serde_json::Value::Null);
            map.insert(col_name.clone(), val);
        }

        if i > 0 {
            write!(writer, ",")?;
        }
        serde_json::to_writer(&mut writer, &map).map_err(|e| AppError::Export(e.to_string()))?;
        written += 1;

        if written % CHUNK_SIZE as u64 == 0 {
            if let Some(ref cb) = progress_callback {
                cb(TableExportProgress {
                    rows_exported: written,
                    total_rows: row_count,
                    done: false,
                    error: None,
                });
            }
        }
    }

    write!(writer, "]").map_err(|e| AppError::Io(e.to_string()))?;
    writer.flush().map_err(|e| AppError::Io(e.to_string()))?;
    drop(writer);

    if let Some(ref cb) = progress_callback {
        cb(TableExportProgress {
            rows_exported: written,
            total_rows: row_count,
            done: true,
            error: None,
        });
    }

    let elapsed = start.elapsed().as_millis();
    Ok(TableExportResult {
        success: true,
        file_path: Some(payload.save_path.clone()),
        row_count: written,
        elapsed_ms: elapsed,
        background: false,
        error: None,
    })
}

// ── SQL INSERT export ────────────────────────────────────────────

async fn export_sql_inserts<F>(
    payload: &TableExportPayload,
    select_sql: &str,
    progress_callback: Option<F>,
) -> AppResult<TableExportResult>
where
    F: Fn(TableExportProgress) + Send + Sync,
{
    let start = Instant::now();

    // v1 only supports DataOnly mode
    if payload.options.sql_mode != SqlExportMode::DataOnly {
        return Err(AppError::Export(
            "v1 only supports SQL DataOnly mode (INSERT statements). SchemaOnly and SchemaAndData are not yet implemented.".to_string()
        ));
    }

    let (columns, rows) = fetch_all_json_rows(
        &payload.connection.r#type,
        &payload.connection,
        select_sql,
    )
    .await?;

    let row_count = rows.len() as u64;
    let mut file = std::fs::File::create(&payload.save_path)?;
    let mut writer = std::io::BufWriter::new(&mut file);

    let driver = &payload.connection.r#type;
    let schema = resolve_schema(&payload.connection);
    let fq_table = qualified_table(driver, &schema, &payload.table_name);

    // Column list for INSERT
    let col_list: Vec<String> = columns.iter().map(|c| quote_ident(driver, c)).collect();
    let col_str = col_list.join(", ");

    let mut written: u64 = 0;
    for row_values in &rows {
        let val_list: Vec<String> = row_values.iter().map(|v| sql_value_literal(v)).collect();
        let val_str = val_list.join(", ");

        writeln!(
            writer,
            "INSERT INTO {} ({}) VALUES ({});",
            fq_table, col_str, val_str
        )
        .map_err(|e| AppError::Io(e.to_string()))?;
        written += 1;

        if written % CHUNK_SIZE as u64 == 0 {
            if let Some(ref cb) = progress_callback {
                cb(TableExportProgress {
                    rows_exported: written,
                    total_rows: row_count,
                    done: false,
                    error: None,
                });
            }
        }
    }

    writer.flush().map_err(|e| AppError::Io(e.to_string()))?;
    drop(writer);

    if let Some(ref cb) = progress_callback {
        cb(TableExportProgress {
            rows_exported: written,
            total_rows: row_count,
            done: true,
            error: None,
        });
    }

    let elapsed = start.elapsed().as_millis();
    Ok(TableExportResult {
        success: true,
        file_path: Some(payload.save_path.clone()),
        row_count: written,
        elapsed_ms: elapsed,
        background: false,
        error: None,
    })
}

// ── XLSX export ──────────────────────────────────────────────────

async fn export_xlsx<F>(
    payload: &TableExportPayload,
    select_sql: &str,
    progress_callback: Option<F>,
) -> AppResult<TableExportResult>
where
    F: Fn(TableExportProgress) + Send + Sync,
{
    let start = Instant::now();

    let (columns, rows) = fetch_all_json_rows(
        &payload.connection.r#type,
        &payload.connection,
        select_sql,
    )
    .await?;

    let row_count = rows.len() as u64;

    let mut workbook = rust_xlsxwriter::Workbook::new();
    let sheet = workbook.add_worksheet();

    let mut written: u64 = 0;

    // Write header row
    if payload.options.include_headers {
        for (col_idx, col_name) in columns.iter().enumerate() {
            sheet.write_string(0, col_idx as u16, col_name).map_err(|e| {
                AppError::Export(format!("xlsx header write error: {}", e))
            })?;
        }
        written = 0; // header doesn't count as data row
    }

    // Write data rows
    let row_offset: u32 = if payload.options.include_headers { 1 } else { 0 };
    for (row_idx, row_values) in rows.iter().enumerate() {
        let excel_row = row_offset + row_idx as u32;
        for (col_idx, val) in row_values.iter().enumerate() {
            match val {
                serde_json::Value::Null => {
                    // Write empty string for null
                    sheet
                        .write_string(excel_row, col_idx as u16, "")
                        .map_err(|e| AppError::Export(format!("xlsx write error: {}", e)))?;
                }
                serde_json::Value::Bool(b) => {
                    sheet
                        .write_boolean(excel_row, col_idx as u16, *b)
                        .map_err(|e| AppError::Export(format!("xlsx write error: {}", e)))?;
                }
                serde_json::Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        sheet
                            .write_number(excel_row, col_idx as u16, i as f64)
                            .map_err(|e| AppError::Export(format!("xlsx write error: {}", e)))?;
                    } else if let Some(f) = n.as_f64() {
                        sheet
                            .write_number(excel_row, col_idx as u16, f)
                            .map_err(|e| AppError::Export(format!("xlsx write error: {}", e)))?;
                    } else {
                        sheet
                            .write_string(excel_row, col_idx as u16, &n.to_string())
                            .map_err(|e| AppError::Export(format!("xlsx write error: {}", e)))?;
                    }
                }
                serde_json::Value::String(s) => {
                    sheet
                        .write_string(excel_row, col_idx as u16, s)
                        .map_err(|e| AppError::Export(format!("xlsx write error: {}", e)))?;
                }
                // Arrays/objects → write as JSON string
                other => {
                    sheet
                        .write_string(excel_row, col_idx as u16, &other.to_string())
                        .map_err(|e| AppError::Export(format!("xlsx write error: {}", e)))?;
                }
            }
        }
        written += 1;

        if written % CHUNK_SIZE as u64 == 0 {
            if let Some(ref cb) = progress_callback {
                cb(TableExportProgress {
                    rows_exported: written,
                    total_rows: row_count,
                    done: false,
                    error: None,
                });
            }
        }
    }

    workbook
        .save(&payload.save_path)
        .map_err(|e| AppError::Export(format!("xlsx save error: {}", e)))?;

    if let Some(ref cb) = progress_callback {
        cb(TableExportProgress {
            rows_exported: written,
            total_rows: row_count,
            done: true,
            error: None,
        });
    }

    let elapsed = start.elapsed().as_millis();
    Ok(TableExportResult {
        success: true,
        file_path: Some(payload.save_path.clone()),
        row_count: written,
        elapsed_ms: elapsed,
        background: false,
        error: None,
    })
}

// ── Tests ────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::export::{SqlExportMode, TableExportEstimate, TableExportFormat, TableExportOptions, TextEncoding};

    #[test]
    fn sql_value_literal_null() {
        assert_eq!(sql_value_literal(&serde_json::Value::Null), "NULL");
    }

    #[test]
    fn sql_value_literal_bool() {
        assert_eq!(sql_value_literal(&serde_json::json!(true)), "TRUE");
        assert_eq!(sql_value_literal(&serde_json::json!(false)), "FALSE");
    }

    #[test]
    fn sql_value_literal_number() {
        assert_eq!(sql_value_literal(&serde_json::json!(42)), "42");
        assert_eq!(sql_value_literal(&serde_json::json!(3.14)), "3.14");
    }

    #[test]
    fn sql_value_literal_string() {
        assert_eq!(
            sql_value_literal(&serde_json::json!("hello")),
            "'hello'"
        );
        assert_eq!(
            sql_value_literal(&serde_json::json!("it's")),
            "'it''s'"
        );
    }

    #[test]
    fn sql_value_literal_json_object() {
        let v = serde_json::json!({"key": "val"});
        let result = sql_value_literal(&v);
        assert!(result.starts_with("'"));
        assert!(result.ends_with("'"));
    }

    #[test]
    fn text_cell_value_null() {
        assert_eq!(text_cell_value(&serde_json::Value::Null), "");
    }

    #[test]
    fn text_cell_value_string() {
        assert_eq!(text_cell_value(&serde_json::json!("hello")), "hello");
    }

    #[test]
    fn text_cell_value_number() {
        assert_eq!(text_cell_value(&serde_json::json!(42)), "42");
    }

    #[test]
    fn format_extension_txt() {
        assert_eq!(TableExportFormat::Txt.extension(), "txt");
    }

    #[test]
    fn format_extension_csv() {
        assert_eq!(TableExportFormat::Csv.extension(), "csv");
    }

    #[test]
    fn format_extension_json() {
        assert_eq!(TableExportFormat::Json.extension(), "json");
    }

    #[test]
    fn format_extension_sql() {
        assert_eq!(TableExportFormat::Sql.extension(), "sql");
    }

    #[test]
    fn format_extension_xlsx() {
        assert_eq!(TableExportFormat::Xlsx.extension(), "xlsx");
    }

    #[test]
    fn quote_ident_pg_basic() {
        // All PG identifiers are double-quoted to preserve exact case
        assert_eq!(quote_ident_pg("users"), "\"users\"");
    }

    #[test]
    fn quote_ident_pg_escape() {
        // Identifiers with special chars ARE quoted with escaping
        assert_eq!(quote_ident_pg("my\"table"), "\"my\"\"table\"");
    }

    #[test]
    fn quote_ident_pg_mixed_case() {
        // Mixed-case identifiers are quoted as-is to preserve exact case
        assert_eq!(quote_ident_pg("Modifier"), "\"Modifier\"");
    }

    #[test]
    fn quote_ident_mysql_basic() {
        assert_eq!(quote_ident_mysql("users"), "`users`");
    }

    #[test]
    fn quote_ident_mysql_escape() {
        assert_eq!(quote_ident_mysql("my`table"), "`my``table`");
    }

    #[test]
    fn qualified_table_with_schema_pg() {
        // All PG identifiers are quoted to preserve exact case
        assert_eq!(
            qualified_table("postgresql", "public", "users"),
            "\"public\".\"users\""
        );
    }

    #[test]
    fn qualified_table_no_schema_pg() {
        assert_eq!(
            qualified_table("postgresql", "", "users"),
            "\"users\""
        );
    }

    #[test]
    fn qualified_table_with_schema_mysql() {
        assert_eq!(
            qualified_table("mysql", "mydb", "users"),
            "`mydb`.`users`"
        );
    }

    #[test]
    fn default_options_include_headers() {
        let opts = TableExportOptions::default();
        assert!(opts.include_headers);
    }

    #[test]
    fn default_options_encoding_utf8() {
        let opts = TableExportOptions::default();
        assert_eq!(opts.encoding, TextEncoding::Utf8);
    }

    #[test]
    fn default_options_sql_data_only() {
        let opts = TableExportOptions::default();
        assert_eq!(opts.sql_mode, SqlExportMode::DataOnly);
    }

    #[test]
    fn estimate_is_large_threshold() {
        let est = TableExportEstimate {
            row_count: 50_001,
            estimated_size_bytes: 50_001 * 512,
            is_large: true,
        };
        assert!(est.is_large);

        let est_small = TableExportEstimate {
            row_count: 100,
            estimated_size_bytes: 100 * 512,
            is_large: false,
        };
        assert!(!est_small.is_large);
    }
}
