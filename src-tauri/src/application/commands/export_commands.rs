//! Tauri commands for SQL table data export.
//!
//! Exposes two commands to the frontend:
//! - `estimate_table_export` – preflight row-count / size estimate.
//! - `execute_table_export` – run the export and write the file locally.

use tauri::Emitter;

use crate::{
    domain::export::{
        TableExportEstimate, TableExportPayload, TableExportProgress, TableExportResult,
    },
    infrastructure::connectors::export as export_connector,
};

/// Preflight: estimate row count and rough output size for a table export.
///
/// The frontend calls this before showing the export confirmation dialog so it
/// can display row-count info and warn about large exports.
#[tauri::command]
pub async fn estimate_table_export(
    connection: crate::domain::query::ConnectionPayload,
    table_name: String,
) -> Result<TableExportEstimate, String> {
    export_connector::estimate_export(&connection, &table_name)
        .await
        .map_err(|err| err.to_string())
}

/// Execute a table export to a local file.
///
/// For large exports (`is_large` from the estimate) the frontend can call this
/// knowing that progress events will be emitted via Tauri's event system:
///   event: `export://progress`
///   payload: `TableExportProgress`
///
/// The `app_handle` is injected by Tauri automatically so the command can emit
/// progress events without requiring a separate state manager.
#[tauri::command]
pub async fn execute_table_export(
    app: tauri::AppHandle,
    payload: TableExportPayload,
) -> Result<TableExportResult, String> {
    let app_handle = app.clone();

    // Run the export with a progress callback that emits Tauri events.
    let progress_cb = move |progress: TableExportProgress| {
        let _ = app_handle.emit("export://progress", &progress);
    };

    export_connector::execute_export(&payload, Some(progress_cb))
        .await
        .map_err(|err| err.to_string())
}
