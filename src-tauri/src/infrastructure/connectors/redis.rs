// infrastructure/connectors/redis.rs
use crate::domain::redis::{ConnectionRedis, ShowAllDatabases};
use std::time::Duration;
use tokio::time::timeout;

fn build_redis_url(payload: &ConnectionRedis) -> String {
    let scheme = if payload.ssl { "rediss" } else { "redis" };

    let db = if payload.database.trim().is_empty() {
        "0".to_string()
    } else {
        payload.database.trim().to_string()
    };

    let host = payload.host.trim();
    let username = payload.username.trim();
    let password = payload.password.trim();

    if !username.is_empty() && !password.is_empty() {
        format!(
            "{}://{}:{}@{}:{}/{}",
            scheme, username, password, host, payload.port, db
        )
    } else if !password.is_empty() {
        format!(
            "{}://:{}@{}:{}/{}",
            scheme, password, host, payload.port, db
        )
    } else {
        format!("{}://{}:{}/{}", scheme, host, payload.port, db)
    }
}

async fn get_connection(
    payload: &ConnectionRedis,
) -> Result<redis::aio::MultiplexedConnection, String> {
    let url = build_redis_url(payload);

    let client =
        redis::Client::open(url).map_err(|err| format!("Invalid Redis config: {}", err))?;

    timeout(
        Duration::from_secs(5),
        client.get_multiplexed_async_connection(),
    )
    .await
    .map_err(|_| "Redis connection timed out".to_string())?
    .map_err(|err| format!("Failed to connect Redis: {}", err))
}

pub async fn test_connection(payload: &ConnectionRedis) -> Result<(), String> {
    let mut conn = get_connection(payload).await?;

    let _: String = timeout(
        Duration::from_secs(5),
        redis::cmd("PING").query_async(&mut conn),
    )
    .await
    .map_err(|_| "Redis ping timed out".to_string())?
    .map_err(|err| format!("Redis ping failed: {}", err))?;

    Ok(())
}

pub async fn show_all_databases(
    payload: &ConnectionRedis,
) -> Result<Vec<ShowAllDatabases>, String> {
    let mut conn = get_connection(payload).await?;

    let info: String = timeout(
        Duration::from_secs(5),
        redis::cmd("INFO").arg("keyspace").query_async(&mut conn),
    )
    .await
    .map_err(|_| "Redis INFO keyspace timed out".to_string())?
    .map_err(|err| format!("Redis INFO keyspace failed: {}", err))?;

    let mut databases = Vec::new();

    for line in info.lines() {
        if !line.starts_with("db") {
            continue;
        }

        let Some((db, stats)) = line.split_once(':') else {
            continue;
        };

        let mut keys = 0;
        let mut expires = 0;
        let mut avg_ttl = 0;

        for item in stats.split(',') {
            let Some((key, value)) = item.split_once('=') else {
                continue;
            };

            let value = value.parse::<i64>().unwrap_or(0);

            match key {
                "keys" => keys = value,
                "expires" => expires = value,
                "avg_ttl" => avg_ttl = value,
                _ => {}
            }
        }

        databases.push(ShowAllDatabases {
            db: db.to_string(),
            keys,
            expires,
            avg_ttl,
        });
    }

    Ok(databases)
}

pub async fn execute_command(payload: &ConnectionRedis, command: &str) -> Result<String, String> {
    let mut conn = get_connection(payload).await?;

    let parts: Vec<&str> = command.split_whitespace().collect();

    if parts.is_empty() {
        return Ok("Empty command".to_string());
    }

    let mut cmd = redis::cmd(parts[0]);

    for arg in parts.iter().skip(1) {
        cmd.arg(arg);
    }

    let result: redis::Value = timeout(Duration::from_secs(5), cmd.query_async(&mut conn))
        .await
        .map_err(|_| "Redis command timed out".to_string())?
        .map_err(|err| format!("Redis command failed: {}", err))?;

    Ok(format!("{:?}", result))
}
