// application/commands/redis_commands.rs
use crate::{
    domain::query::ConnectionPayload,
    domain::redis::{
        ConnectionTestRedisResult, RedisKeyDetail, RedisScanResult, RedisServerInfo,
        ShowAllDatabases,
    },
    infrastructure::connectors::redis as redis_connector,
};

use super::query_commands::resolve_ssh_secrets;

#[tauri::command]
pub async fn redis_test_connection(
    app: tauri::AppHandle,
    payload: ConnectionPayload,
    ssh_password: Option<String>,
    key_passphrase: Option<String>,
) -> Result<ConnectionTestRedisResult, String> {
    let (ssh_pw, key_pp) = if ssh_password.is_some() || key_passphrase.is_some() {
        (ssh_password, key_passphrase)
    } else {
        resolve_ssh_secrets(&app, &payload).await?
    };

    redis_connector::test_connection(&payload, ssh_pw.as_deref(), key_pp.as_deref())
        .await
        .map(|_| ConnectionTestRedisResult {
            ok: true,
            message: "Connection successful".to_string(),
        })
        .map_or_else(
            |err| {
                Ok(ConnectionTestRedisResult {
                    ok: false,
                    message: err.to_string(),
                })
            },
            Ok,
        )
}

#[tauri::command]
pub async fn redis_show_all_databases(
    app: tauri::AppHandle,
    payload: ConnectionPayload,
) -> Result<Vec<ShowAllDatabases>, String> {
    let (ssh_pw, key_pp) = resolve_ssh_secrets(&app, &payload).await?;
    redis_connector::show_all_databases(&payload, ssh_pw.as_deref(), key_pp.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn redis_scan_keys(
    app: tauri::AppHandle,
    payload: ConnectionPayload,
    database: String,
    pattern: String,
    cursor: String,
) -> Result<RedisScanResult, String> {
    let (ssh_pw, key_pp) = resolve_ssh_secrets(&app, &payload).await?;
    redis_connector::scan_keys(
        &payload,
        ssh_pw.as_deref(),
        key_pp.as_deref(),
        &database,
        &pattern,
        &cursor,
    )
    .await
    .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn redis_get_key(
    app: tauri::AppHandle,
    payload: ConnectionPayload,
    database: String,
    key: String,
) -> Result<RedisKeyDetail, String> {
    let (ssh_pw, key_pp) = resolve_ssh_secrets(&app, &payload).await?;
    redis_connector::get_key(
        &payload,
        ssh_pw.as_deref(),
        key_pp.as_deref(),
        &database,
        &key,
    )
    .await
    .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn redis_get_info(
    app: tauri::AppHandle,
    payload: ConnectionPayload,
) -> Result<RedisServerInfo, String> {
    let (ssh_pw, key_pp) = resolve_ssh_secrets(&app, &payload).await?;
    redis_connector::get_info(&payload, ssh_pw.as_deref(), key_pp.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn redis_execute_command(
    app: tauri::AppHandle,
    payload: ConnectionPayload,
    command: String,
) -> Result<String, String> {
    let (ssh_pw, key_pp) = resolve_ssh_secrets(&app, &payload).await?;
    redis_connector::execute_command(&payload, ssh_pw.as_deref(), key_pp.as_deref(), &command)
        .await
        .map_err(|err| err.to_string())
}
