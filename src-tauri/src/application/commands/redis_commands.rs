// application/commands/redis_commands.rs
use crate::{
    domain::redis::{ConnectionRedis, ConnectionTestRedisResult, ShowAllDatabases},
    infrastructure::connectors::redis as redis_connector,
};

// IMPLEMENT REDIS COMMANDS (NANTI HAHAH)
// INFO keyspace
// SCAN
// TYPE key
// TTL key
// GET key
// HGETALL key
// LRANGE key 0 -1
// SMEMBERS key
// ZRANGE key 0 -1 WITHSCORES

#[tauri::command]
pub async fn redis_test_connection(
    payload: ConnectionRedis,
) -> Result<ConnectionTestRedisResult, String> {
    redis_connector::test_connection(&payload)
        .await
        .map(|_| ConnectionTestRedisResult {
            ok: true,
            message: "Connection successful".to_string(),
        })
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn redis_show_all_databases(
    payload: ConnectionRedis,
) -> Result<Vec<ShowAllDatabases>, String> {
    redis_connector::show_all_databases(&payload)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn redis_execute_command(
    payload: ConnectionRedis,
    command: String,
) -> Result<String, String> {
    redis_connector::execute_command(&payload, &command)
        .await
        .map_err(|err| err.to_string())
}
