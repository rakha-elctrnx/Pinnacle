// infrastructure/connectors/redis.rs
use std::collections::HashMap;
use std::sync::LazyLock;
use std::time::Duration;

use redis::aio::MultiplexedConnection;
use redis::{ConnectionAddr, ConnectionInfo, IntoConnectionInfo, RedisConnectionInfo};
use tokio::sync::Mutex;
use tokio::time::timeout;

use crate::core::error::AppError;
use crate::core::result::AppResult;
use crate::domain::query::ConnectionPayload;
use crate::domain::redis::{
    RedisKeyDetail, RedisKeySummary, RedisScanResult, RedisServerInfo, ShowAllDatabases,
};

struct CachedRedisConnection {
    conn: MultiplexedConnection,
    fingerprint: String,
    _tunnel: Option<super::ssh::TunnelHandle>,
}

static REDIS_CONNECTIONS: LazyLock<Mutex<HashMap<String, CachedRedisConnection>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Evict cached Redis connection(s) when connection settings change or on explicit disconnect.
pub async fn evict_redis_connections(connection_id: &str) {
    let mut guard = REDIS_CONNECTIONS.lock().await;
    let prefix = format!("{}:", connection_id);
    guard.retain(|k, _| !k.starts_with(&prefix) && k != connection_id);
}

fn target_db_index(raw: &str) -> i64 {
    let trimmed = raw.trim();
    let s = trimmed.strip_prefix("db").unwrap_or(trimmed);
    s.parse::<i64>().unwrap_or(0)
}

fn compute_fingerprint(
    host: &str,
    port: u16,
    db: i64,
    ssl: bool,
    username: &str,
    ssh: Option<&crate::domain::query::SshConfig>,
) -> String {
    let ssh_str = ssh.map_or_else(String::new, |s| format!("{}:{}:{}", s.host, s.port, s.username));
    format!("{}:{}:{}:{}:{}:{}", host, port, db, ssl, username, ssh_str)
}

fn build_connection_info(
    host: &str,
    port: u16,
    db: i64,
    ssl: bool,
    ssl_config: Option<&crate::domain::query::SslConfig>,
    username: &str,
    password: &str,
) -> ConnectionInfo {
    let addr = if ssl {
        let insecure = ssl_config.map_or(false, |s| s.mode == "disable");
        // Custom CA cert paths are not supported by the redis crate; noted inline.
        ConnectionAddr::TcpTls {
            host: host.to_string(),
            port,
            insecure,
            tls_params: None,
        }
    } else {
        ConnectionAddr::Tcp(host.to_string(), port)
    };

    let mut redis_info = RedisConnectionInfo::default();
    redis_info = redis_info.set_db(db);
    if !username.trim().is_empty() {
        redis_info = redis_info.set_username(username.trim());
    }
    if !password.trim().is_empty() {
        redis_info = redis_info.set_password(password.trim());
    }

    // ConnectionAddr -> ConnectionInfo conversion is infallible.
    addr.into_connection_info()
        .expect("infallible")
        .set_redis_settings(redis_info)
}

async fn get_redis_connection(
    payload: &ConnectionPayload,
    ssh_pw: Option<&str>,
    key_pp: Option<&str>,
    override_db: Option<&str>,
) -> AppResult<MultiplexedConnection> {
    let db_index = override_db
        .map(target_db_index)
        .unwrap_or_else(|| target_db_index(&payload.database));

    let fingerprint = compute_fingerprint(
        &payload.host,
        payload.port,
        db_index,
        payload.ssl,
        &payload.username,
        payload.ssh.as_ref(),
    );

    if let Some(conn_id) = &payload.connection_id {
        let cache_key = format!("{}:{}", conn_id, db_index);
        {
            let guard = REDIS_CONNECTIONS.lock().await;
            if let Some(cached) = guard.get(&cache_key) {
                if cached.fingerprint == fingerprint {
                    return Ok(cached.conn.clone());
                }
            }
        }

        let (connect_host, connect_port, tunnel) =
            super::sql::resolve_connect_addr(payload, ssh_pw, key_pp).await?;

        let conn_info = build_connection_info(
            &connect_host,
            connect_port,
            db_index,
            payload.ssl,
            payload.ssl_config.as_ref(),
            &payload.username,
            &payload.password,
        );

        let client = redis::Client::open(conn_info)?;
        let conn_fut = client.get_multiplexed_async_connection();
        let conn = timeout(Duration::from_secs(5), conn_fut)
            .await
            .map_err(|_| AppError::Database("Database operation timed out.".to_string()))??;

        let mut guard = REDIS_CONNECTIONS.lock().await;
        guard.insert(
            cache_key,
            CachedRedisConnection {
                conn: conn.clone(),
                fingerprint,
                _tunnel: tunnel,
            },
        );
        Ok(conn)
    } else {
        let (connect_host, connect_port, _tunnel) =
            super::sql::resolve_connect_addr(payload, ssh_pw, key_pp).await?;

        let conn_info = build_connection_info(
            &connect_host,
            connect_port,
            db_index,
            payload.ssl,
            payload.ssl_config.as_ref(),
            &payload.username,
            &payload.password,
        );

        let client = redis::Client::open(conn_info)?;
        let conn_fut = client.get_multiplexed_async_connection();
        let conn = timeout(Duration::from_secs(5), conn_fut)
            .await
            .map_err(|_| AppError::Database("Database operation timed out.".to_string()))??;

        Ok(conn)
    }
}

pub async fn test_connection(
    payload: &ConnectionPayload,
    ssh_pw: Option<&str>,
    key_pp: Option<&str>,
) -> AppResult<()> {
    let mut conn = get_redis_connection(payload, ssh_pw, key_pp, None).await?;
    let ping_cmd = redis::cmd("PING");
    let ping_fut = ping_cmd.query_async::<String>(&mut conn);
    let _res: String = timeout(Duration::from_secs(5), ping_fut)
        .await
        .map_err(|_| AppError::Database("Database operation timed out.".to_string()))??;
    Ok(())
}

pub async fn show_all_databases(
    payload: &ConnectionPayload,
    ssh_pw: Option<&str>,
    key_pp: Option<&str>,
) -> AppResult<Vec<ShowAllDatabases>> {
    let mut conn = get_redis_connection(payload, ssh_pw, key_pp, None).await?;
    let mut info_cmd = redis::cmd("INFO");
    info_cmd.arg("keyspace");
    let info_fut = info_cmd.query_async::<String>(&mut conn);
    let info: String = timeout(Duration::from_secs(5), info_fut)
        .await
        .map_err(|_| AppError::Database("Database operation timed out.".to_string()))??;

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

pub async fn scan_keys(
    payload: &ConnectionPayload,
    ssh_pw: Option<&str>,
    key_pp: Option<&str>,
    database: &str,
    pattern: &str,
    cursor: &str,
) -> AppResult<RedisScanResult> {
    let mut conn = get_redis_connection(payload, ssh_pw, key_pp, Some(database)).await?;
    let match_pattern = if pattern.trim().is_empty() { "*" } else { pattern.trim() };
    let cur = if cursor.trim().is_empty() { "0" } else { cursor.trim() };

    let mut scan_cmd = redis::cmd("SCAN");
    scan_cmd
        .arg(cur)
        .arg("MATCH")
        .arg(match_pattern)
        .arg("COUNT")
        .arg(50);
    let scan_fut = scan_cmd.query_async::<(String, Vec<String>)>(&mut conn);

    let (next_cursor, keys) = timeout(Duration::from_secs(5), scan_fut)
        .await
        .map_err(|_| AppError::Database("Database operation timed out.".to_string()))??;

    let mut summaries = Vec::new();
    if !keys.is_empty() {
        let mut pipe = redis::pipe();
        for key in &keys {
            pipe.cmd("TYPE").arg(key);
            pipe.cmd("TTL").arg(key);
        }
        let pipe_fut = pipe.query_async::<Vec<redis::Value>>(&mut conn);
        let results: Vec<redis::Value> = timeout(Duration::from_secs(5), pipe_fut)
            .await
            .map_err(|_| AppError::Database("Database operation timed out.".to_string()))??;

        for (i, key) in keys.into_iter().enumerate() {
            let key_type = results.get(i * 2)
                .map(|v| match v {
                    redis::Value::SimpleString(s) => s.clone(),
                    redis::Value::BulkString(b) => String::from_utf8_lossy(b).to_string(),
                    _ => "unknown".to_string(),
                })
                .unwrap_or_else(|| "unknown".to_string());

            let ttl = results.get(i * 2 + 1)
                .map(|v| match v {
                    redis::Value::Int(n) => *n,
                    _ => -1,
                })
                .unwrap_or(-1);

            summaries.push(RedisKeySummary {
                key,
                key_type,
                ttl,
            });
        }
    }

    Ok(RedisScanResult {
        cursor: next_cursor,
        keys: summaries,
    })
}

pub async fn get_key(
    payload: &ConnectionPayload,
    ssh_pw: Option<&str>,
    key_pp: Option<&str>,
    database: &str,
    key: &str,
) -> AppResult<RedisKeyDetail> {
    let mut conn = get_redis_connection(payload, ssh_pw, key_pp, Some(database)).await?;

    let mut type_cmd = redis::cmd("TYPE");
    type_cmd.arg(key);
    let type_fut = type_cmd.query_async::<redis::Value>(&mut conn);
    let type_val: redis::Value = timeout(Duration::from_secs(5), type_fut)
        .await
        .map_err(|_| AppError::Database("Database operation timed out.".to_string()))??;

    let key_type = match type_val {
        redis::Value::SimpleString(s) => s,
        redis::Value::BulkString(b) => String::from_utf8_lossy(&b).to_string(),
        _ => "none".to_string(),
    };
    let mut ttl_cmd = redis::cmd("TTL");
    ttl_cmd.arg(key);
    let ttl_fut = ttl_cmd.query_async::<i64>(&mut conn);
    let ttl: i64 = timeout(Duration::from_secs(5), ttl_fut)
        .await
        .map_err(|_| AppError::Database("Database operation timed out.".to_string()))??;

    let value = match key_type.as_str() {
        "string" => {
            let mut get_cmd = redis::cmd("GET");
            get_cmd.arg(key);
            let fut = get_cmd.query_async::<redis::Value>(&mut conn);
            let val: redis::Value = timeout(Duration::from_secs(5), fut)
                .await
                .map_err(|_| AppError::Database("Database operation timed out.".to_string()))??;
            match val {
                redis::Value::BulkString(b) => serde_json::Value::String(String::from_utf8_lossy(&b).to_string()),
                redis::Value::SimpleString(s) => serde_json::Value::String(s),
                redis::Value::Nil => serde_json::Value::Null,
                _ => serde_json::Value::String(format_redis_value(&val)),
            }
        }
        "list" => {
            let mut lrange_cmd = redis::cmd("LRANGE");
            lrange_cmd.arg(key).arg(0).arg(-1);
            let fut = lrange_cmd.query_async::<Vec<redis::Value>>(&mut conn);
            let items: Vec<redis::Value> = timeout(Duration::from_secs(5), fut)
                .await
                .map_err(|_| AppError::Database("Database operation timed out.".to_string()))??;
            let list: Vec<serde_json::Value> = items
                .into_iter()
                .map(|v| match v {
                    redis::Value::BulkString(b) => serde_json::Value::String(String::from_utf8_lossy(&b).to_string()),
                    redis::Value::SimpleString(s) => serde_json::Value::String(s),
                    _ => serde_json::Value::String(format_redis_value(&v)),
                })
                .collect();
            serde_json::Value::Array(list)
        }
        "set" => {
            let mut smembers_cmd = redis::cmd("SMEMBERS");
            smembers_cmd.arg(key);
            let fut = smembers_cmd.query_async::<Vec<redis::Value>>(&mut conn);
            let items: Vec<redis::Value> = timeout(Duration::from_secs(5), fut)
                .await
                .map_err(|_| AppError::Database("Database operation timed out.".to_string()))??;
            let set: Vec<serde_json::Value> = items
                .into_iter()
                .map(|v| match v {
                    redis::Value::BulkString(b) => serde_json::Value::String(String::from_utf8_lossy(&b).to_string()),
                    redis::Value::SimpleString(s) => serde_json::Value::String(s),
                    _ => serde_json::Value::String(format_redis_value(&v)),
                })
                .collect();
            serde_json::Value::Array(set)
        }
        "hash" => {
            let mut hgetall_cmd = redis::cmd("HGETALL");
            hgetall_cmd.arg(key);
            let fut = hgetall_cmd.query_async::<Vec<redis::Value>>(&mut conn);
            let items: Vec<redis::Value> = timeout(Duration::from_secs(5), fut)
                .await
                .map_err(|_| AppError::Database("Database operation timed out.".to_string()))??;
            let mut map = serde_json::Map::new();
            let mut iter = items.into_iter();
            while let (Some(k), Some(v)) = (iter.next(), iter.next()) {
                let key_str = match k {
                    redis::Value::BulkString(b) => String::from_utf8_lossy(&b).to_string(),
                    redis::Value::SimpleString(s) => s,
                    _ => format_redis_value(&k),
                };
                let val_str = match v {
                    redis::Value::BulkString(b) => String::from_utf8_lossy(&b).to_string(),
                    redis::Value::SimpleString(s) => s,
                    _ => format_redis_value(&v),
                };
                map.insert(key_str, serde_json::Value::String(val_str));
            }
            serde_json::Value::Object(map)
        }
        "zset" => {
            let mut zrange_cmd = redis::cmd("ZRANGE");
            zrange_cmd.arg(key).arg(0).arg(-1).arg("WITHSCORES");
            let fut = zrange_cmd.query_async::<Vec<redis::Value>>(&mut conn);
            let items: Vec<redis::Value> = timeout(Duration::from_secs(5), fut)
                .await
                .map_err(|_| AppError::Database("Database operation timed out.".to_string()))??;
            let mut zset = Vec::new();
            let mut iter = items.into_iter();
            while let (Some(val_v), Some(score_v)) = (iter.next(), iter.next()) {
                let member_str = match val_v {
                    redis::Value::BulkString(b) => String::from_utf8_lossy(&b).to_string(),
                    redis::Value::SimpleString(s) => s,
                    _ => format_redis_value(&val_v),
                };
                let score_num: f64 = match score_v {
                    redis::Value::BulkString(b) => String::from_utf8_lossy(&b).parse().unwrap_or(0.0),
                    redis::Value::SimpleString(s) => s.parse().unwrap_or(0.0),
                    redis::Value::Int(i) => i as f64,
                    redis::Value::Double(d) => d,
                    _ => 0.0,
                };
                let mut obj = serde_json::Map::new();
                obj.insert("value".to_string(), serde_json::Value::String(member_str));
                obj.insert(
                    "score".to_string(),
                    serde_json::Number::from_f64(score_num)
                        .map(serde_json::Value::Number)
                        .unwrap_or(serde_json::Value::Number(0.into())),
                );
                zset.push(serde_json::Value::Object(obj));
            }
            serde_json::Value::Array(zset)
        }
        _ => serde_json::Value::Null,
    };

    Ok(RedisKeyDetail {
        key: key.to_string(),
        key_type,
        ttl,
        value,
    })
}

pub async fn get_info(
    payload: &ConnectionPayload,
    ssh_pw: Option<&str>,
    key_pp: Option<&str>,
) -> AppResult<RedisServerInfo> {
    let mut conn = get_redis_connection(payload, ssh_pw, key_pp, None).await?;
    let info_cmd = redis::cmd("INFO");
    let info_fut = info_cmd.query_async::<String>(&mut conn);
    let raw_info: String = timeout(Duration::from_secs(5), info_fut)
        .await
        .map_err(|_| AppError::Database("Database operation timed out.".to_string()))??;

    let mut redis_version = String::new();
    let mut redis_mode = "standalone".to_string();
    let mut os = None;
    let mut arch_bits = None;
    let mut uptime_in_seconds = None;
    let mut connected_clients = None;
    let mut used_memory_human = None;
    let mut role = None;

    for line in raw_info.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once(':') {
            match k {
                "redis_version" => redis_version = v.to_string(),
                "redis_mode" => redis_mode = v.to_string(),
                "os" => os = Some(v.to_string()),
                "arch_bits" => arch_bits = v.parse::<i64>().ok(),
                "uptime_in_seconds" => uptime_in_seconds = v.parse::<i64>().ok(),
                "connected_clients" => connected_clients = v.parse::<i64>().ok(),
                "used_memory_human" => used_memory_human = Some(v.to_string()),
                "role" => role = Some(v.to_string()),
                _ => {}
            }
        }
    }

    Ok(RedisServerInfo {
        redis_version,
        redis_mode,
        os,
        arch_bits,
        uptime_in_seconds,
        connected_clients,
        used_memory_human,
        role,
    })
}

pub fn split_command_args(input: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut escape = false;

    for c in input.chars() {
        if escape {
            current.push(c);
            escape = false;
            continue;
        }

        if c == '\\' && !in_single_quote {
            escape = true;
            continue;
        }

        if c == '\'' && !in_double_quote {
            in_single_quote = !in_single_quote;
            continue;
        }

        if c == '"' && !in_single_quote {
            in_double_quote = !in_double_quote;
            continue;
        }

        if c.is_whitespace() && !in_single_quote && !in_double_quote {
            if !current.is_empty() {
                args.push(current.clone());
                current.clear();
            }
            continue;
        }

        current.push(c);
    }

    if !current.is_empty() {
        args.push(current);
    }

    args
}

pub fn format_redis_value(val: &redis::Value) -> String {
    format_redis_value_indent(val, 0)
}

fn format_redis_value_indent(val: &redis::Value, indent_level: usize) -> String {
    let indent = "  ".repeat(indent_level);
    match val {
        redis::Value::Nil => "(nil)".to_string(),
        redis::Value::Int(n) => n.to_string(),
        redis::Value::SimpleString(s) => s.clone(),
        redis::Value::BulkString(b) => String::from_utf8_lossy(b).to_string(),
        redis::Value::Okay => "OK".to_string(),
        redis::Value::Double(d) => d.to_string(),
        redis::Value::Boolean(b) => b.to_string(),
        redis::Value::Array(arr) => {
            if arr.is_empty() {
                "(empty list or set)".to_string()
            } else {
                let mut lines = Vec::new();
                for (i, v) in arr.iter().enumerate() {
                    let formatted = format_redis_value_indent(v, indent_level + 1);
                    lines.push(format!("{}{}) {}", indent, i + 1, formatted));
                }
                lines.join("\n")
            }
        }
        redis::Value::Set(arr) => {
            if arr.is_empty() {
                "(empty set)".to_string()
            } else {
                let mut lines = Vec::new();
                for (i, v) in arr.iter().enumerate() {
                    let formatted = format_redis_value_indent(v, indent_level + 1);
                    lines.push(format!("{}{}) {}", indent, i + 1, formatted));
                }
                lines.join("\n")
            }
        }
        redis::Value::Map(pairs) => {
            if pairs.is_empty() {
                "(empty map)".to_string()
            } else {
                let mut lines = Vec::new();
                for (i, (k, v)) in pairs.iter().enumerate() {
                    let fk = format_redis_value_indent(k, indent_level + 1);
                    let fv = format_redis_value_indent(v, indent_level + 1);
                    lines.push(format!("{}{}) {}\n{}   {}", indent, i + 1, fk, indent, fv));
                }
                lines.join("\n")
            }
        }
        _ => format!("{:?}", val),
    }
}

pub async fn execute_command(
    payload: &ConnectionPayload,
    ssh_pw: Option<&str>,
    key_pp: Option<&str>,
    command: &str,
) -> AppResult<String> {
    let mut conn = get_redis_connection(payload, ssh_pw, key_pp, None).await?;
    let parts = split_command_args(command);
    if parts.is_empty() {
        return Ok("(empty command)".to_string());
    }

    let mut cmd = redis::cmd(&parts[0]);
    for arg in parts.iter().skip(1) {
        cmd.arg(arg);
    }

    let cmd_fut = cmd.query_async::<redis::Value>(&mut conn);
    let val: redis::Value = timeout(Duration::from_secs(5), cmd_fut)
        .await
        .map_err(|_| AppError::Database("Database operation timed out.".to_string()))??;

    Ok(format_redis_value(&val))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_command_args() {
        assert_eq!(split_command_args("GET \"my key\""), vec!["GET", "my key"]);
        assert_eq!(split_command_args("SET foo 'bar baz'"), vec!["SET", "foo", "bar baz"]);
        assert_eq!(
            split_command_args("SET foo \"bar \\\"baz\\\"\""),
            vec!["SET", "foo", "bar \"baz\""]
        );
        assert_eq!(split_command_args("PING"), vec!["PING"]);
        assert!(split_command_args("  ").is_empty());
    }

    #[test]
    fn test_target_db_index() {
        assert_eq!(target_db_index("db0"), 0);
        assert_eq!(target_db_index("db15"), 15);
        assert_eq!(target_db_index("2"), 2);
        assert_eq!(target_db_index("invalid"), 0);
    }

    /// Live probe against the docker fixture (`pinnacle-redis-test` on :6380,
    /// seeded via docker/redis/init.sh). Run with:
    ///   cargo test redis_live_probe -- --ignored
    #[tokio::test]
    #[ignore]
    async fn redis_live_probe() {
        let p = ConnectionPayload {
            r#type: "redis".into(),
            host: "127.0.0.1".into(),
            port: 6380,
            username: String::new(),
            password: String::new(),
            database: "db0".into(),
            ssl: false,
            ..Default::default()
        };
        test_connection(&p, None, None).await.expect("ping");

        let dbs = show_all_databases(&p, None, None).await.unwrap();
        let names: Vec<&str> = dbs.iter().map(|d| d.db.as_str()).collect();
        assert!(names.contains(&"db0") && names.contains(&"db1"), "{names:?}");

        let scan = scan_keys(&p, None, None, "db0", "*", "0").await.unwrap();
        assert_eq!(scan.keys.len(), 5, "{:?}", scan.keys);
        assert!(scan.keys.iter().all(|k| !k.key_type.is_empty()));

        let filtered = scan_keys(&p, None, None, "db0", "user:*", "0").await.unwrap();
        assert_eq!(filtered.keys.len(), 1);
        assert_eq!(filtered.keys[0].key, "user:1:name");

        let s = get_key(&p, None, None, "db0", "user:1:name").await.unwrap();
        assert_eq!(s.key_type, "string");
        assert_eq!(s.value, serde_json::json!("Alice"));

        let l = get_key(&p, None, None, "db0", "queue:tasks").await.unwrap();
        assert_eq!(l.key_type, "list");
        assert_eq!(l.value, serde_json::json!(["a", "b", "c"]));

        let h = get_key(&p, None, None, "db0", "session:1").await.unwrap();
        assert_eq!(h.key_type, "hash");
        assert_eq!(h.value, serde_json::json!({"user": "alice", "expires": "3600"}));

        let z = get_key(&p, None, None, "db0", "leaderboard").await.unwrap();
        assert_eq!(z.key_type, "zset");
        assert_eq!(z.value[0]["value"], "bob");
        assert_eq!(z.value[0]["score"], 85.0);

        let p1 = ConnectionPayload { database: "db1".into(), ..p.clone() };
        let f = get_key(&p1, None, None, "db1", "flag:beta").await.unwrap();
        assert_eq!(f.value, serde_json::json!("on"));

        let info = get_info(&p, None, None).await.unwrap();
        assert!(info.redis_version.starts_with("7."), "{}", info.redis_version);
        assert_eq!(info.redis_mode, "standalone");

        assert_eq!(execute_command(&p, None, None, "PING").await.unwrap(), "PONG");
        assert_eq!(
            execute_command(&p, None, None, "GET user:1:name").await.unwrap(),
            "Alice"
        );
        execute_command(&p, None, None, "SET \"my key\" v").await.unwrap();
        assert_eq!(execute_command(&p, None, None, "GET \"my key\"").await.unwrap(), "v");

        let err = execute_command(&p, None, None, "GET").await.unwrap_err().to_string();
        assert!(err.contains("rejected the command"), "{err}");

        let mut wrong = p.clone();
        wrong.port = 6399;
        let e = test_connection(&wrong, None, None).await.unwrap_err().to_string();
        assert!(e.contains("Could not reach"), "{e}");
    }
}
