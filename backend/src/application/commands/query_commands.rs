use std::path::PathBuf;

use tauri::Manager;

use crate::{
    core::error::AppError,
    domain::query::{
        CommitTableChangesPayload, CommitTableChangesResult, ConnectionPayload,
        ConnectionTestResult, DdlExecutionResult, DdlPlan, DropTablePayload, DropTableResult,
        QueryResult, SchemaColumn, SchemaForeignKey, SqlQueryPayload, TableSchemaInfo,
        TransactionCommitResult, TransactionHandle, TransactionStepResult,
    },
    infrastructure::connectors::{ddl, keyring, pool, sql, store, transaction},
};

fn app_data(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()).to_string())
}

/// Resolve SSH-layer secrets (ssh password, key passphrase) for a saved connection.
///
/// Looks up the local store first, then falls back to the OS keyring. Returns
/// `(None, None)` when `connection_id` is absent (test-connection-before-save flow
/// — the caller passes secrets inline) or when no SSH config is present.
async fn resolve_ssh_secrets(
    app: &tauri::AppHandle,
    payload: &ConnectionPayload,
) -> Result<(Option<String>, Option<String>), String> {
    if payload.ssh.is_none() {
        return Ok((None, None));
    }
    let Some(id) = payload.connection_id.as_deref() else {
        return Ok((None, None));
    };
    let data = app_data(app)?;
    let ssh_pw = store::get_ssh_password(&data, id)
        .await
        .map_err(|e| e.to_string())?;
    let ssh_pw = match ssh_pw {
        Some(p) => Some(p),
        None => keyring::get_ssh_password(id).await.map_err(|e| e.to_string())?,
    };
    let key_pp = store::get_key_passphrase(&data, id)
        .await
        .map_err(|e| e.to_string())?;
    let key_pp = match key_pp {
        Some(p) => Some(p),
        None => keyring::get_key_passphrase(id).await.map_err(|e| e.to_string())?,
    };
    Ok((ssh_pw, key_pp))
}

#[tauri::command]
pub async fn test_connection(
    app: tauri::AppHandle,
    payload: crate::domain::query::ConnectionPayload,
    ssh_password: Option<String>,
    key_passphrase: Option<String>,
) -> Result<ConnectionTestResult, String> {
    // Inline secrets (test-before-save flow) take precedence over store lookups.
    let (ssh_pw, key_pp) = if ssh_password.is_some() || key_passphrase.is_some() {
        (ssh_password, key_passphrase)
    } else {
        resolve_ssh_secrets(&app, &payload).await?
    };
    sql::test_connection(&payload, ssh_pw.as_deref(), key_pp.as_deref())
        .await
        .map(|_| ConnectionTestResult {
            ok: true,
            message: "Connection successful".to_string(),
        })
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn execute_sql(
    app: tauri::AppHandle,
    payload: SqlQueryPayload,
) -> Result<QueryResult, String> {
    let (ssh_pw, key_pp) = resolve_ssh_secrets(&app, &payload.connection).await?;
    sql::execute_sql(
        &payload.connection,
        payload.sql.as_str(),
        ssh_pw.as_deref(),
        key_pp.as_deref(),
    )
    .await
    .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn sql_begin_transaction(
    payload: ConnectionPayload,
) -> Result<TransactionHandle, String> {
    let transaction_id = transaction::begin(&payload).await.map_err(|e| e.to_string())?;
    Ok(TransactionHandle { transaction_id })
}

#[tauri::command]
pub async fn sql_execute_in_transaction(
    _payload: ConnectionPayload,
    transaction_id: String,
    sql: String,
) -> Result<TransactionStepResult, String> {
    // On error, auto-rollback then return the error
    match transaction::execute(&transaction_id, &sql).await {
        Ok(result) => Ok(result),
        Err(e) => {
            // Attempt rollback; ignore its result (we're already in error)
            let _ = transaction::rollback(&transaction_id).await;
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn sql_commit_transaction(
    _payload: ConnectionPayload,
    transaction_id: String,
) -> Result<TransactionCommitResult, String> {
    transaction::commit(&transaction_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sql_rollback_transaction(
    _payload: ConnectionPayload,
    transaction_id: String,
) -> Result<TransactionCommitResult, String> {
    transaction::rollback(&transaction_id).await.map_err(|e| e.to_string())
}

/// Drop the connection pool (and SSH tunnel) for a saved connection.
/// Called when the user explicitly disconnects or closes the connection tab.
#[tauri::command]
pub async fn disconnect_connection(connection_id: String) -> Result<(), String> {
    pool::disconnect(&connection_id).await;
    Ok(())
}

/// Return the current health snapshot for a saved connection's pool.
/// Polled by the frontend status bar (every few seconds).
#[tauri::command]
pub async fn get_connection_health(
    connection_id: String,
) -> Result<pool::HealthState, String> {
    Ok(pool::health(&connection_id).await)
}

#[tauri::command]
pub async fn sql_get_table_schema(
    app: tauri::AppHandle,
    payload: crate::domain::query::ConnectionPayload,
    table_name: String,
) -> Result<TableSchemaInfo, String> {
    let (ssh_pw, key_pp) = resolve_ssh_secrets(&app, &payload).await?;
    sql::get_table_schema(&payload, &table_name, ssh_pw.as_deref(), key_pp.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn sql_generate_ddl(
    payload: crate::domain::query::ConnectionPayload,
    current: Option<TableSchemaInfo>,
    pending: TableSchemaInfo,
) -> Result<DdlPlan, String> {
    ddl::generate_ddl(&payload.r#type, current.as_ref(), &pending).map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn sql_execute_ddl(
    app: tauri::AppHandle,
    payload: crate::domain::query::ConnectionPayload,
    plan: DdlPlan,
) -> Result<DdlExecutionResult, String> {
    let (ssh_pw, key_pp) = resolve_ssh_secrets(&app, &payload).await?;
    sql::execute_ddl_statements(&payload, &plan, ssh_pw.as_deref(), key_pp.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn sql_drop_table(
    app: tauri::AppHandle,
    payload: DropTablePayload,
) -> Result<DropTableResult, String> {
    let (ssh_pw, key_pp) = resolve_ssh_secrets(&app, &payload.connection).await?;
    sql::drop_table(&payload, ssh_pw.as_deref(), key_pp.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn sql_get_all_foreign_keys(
    app: tauri::AppHandle,
    payload: crate::domain::query::ConnectionPayload,
) -> Result<Vec<SchemaForeignKey>, String> {
    let (ssh_pw, key_pp) = resolve_ssh_secrets(&app, &payload).await?;
    sql::get_all_foreign_keys(&payload, ssh_pw.as_deref(), key_pp.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn sql_get_all_columns(
    app: tauri::AppHandle,
    payload: crate::domain::query::ConnectionPayload,
) -> Result<Vec<SchemaColumn>, String> {
    let (ssh_pw, key_pp) = resolve_ssh_secrets(&app, &payload).await?;
    sql::get_all_columns(&payload, ssh_pw.as_deref(), key_pp.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn commit_table_changes(
    app: tauri::AppHandle,
    payload: CommitTableChangesPayload,
) -> Result<CommitTableChangesResult, String> {
    let (ssh_pw, key_pp) = resolve_ssh_secrets(&app, &payload.connection).await?;
    sql::commit_table_changes(&payload, ssh_pw.as_deref(), key_pp.as_deref())
        .await
        .map_err(|err| err.to_string())
}
