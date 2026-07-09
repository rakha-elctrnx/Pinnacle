use base64::Engine;
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::{
    core::{error::AppError, result::AppResult},
    domain::query::ConnectionPayload,
};

// ── Helper ──────────────────────────────────────────────────────────

fn build_base_url(payload: &ConnectionPayload) -> String {
    let scheme = if payload.ssl { "https" } else { "http" };
    // Strip any existing scheme prefix from host to avoid double-protocol
    let host = payload.host
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_end_matches('/');
    format!("{}://{}:{}", scheme, host, payload.port)
}

fn auth_header_value(payload: &ConnectionPayload) -> Option<String> {
    if payload.username.is_empty() {
        return None;
    }
    let creds = format!("{}:{}", payload.username, payload.password);
    let encoded = base64::engine::general_purpose::STANDARD.encode(creds);
    Some(format!("Basic {}", encoded))
}

async fn get_json(
    client: &Client,
    payload: &ConnectionPayload,
    path: &str,
) -> AppResult<serde_json::Value> {
    let url = format!("{}{}", build_base_url(payload), path);
    let mut req = client.get(&url);
    if let Some(auth) = auth_header_value(payload) {
        req = req.header("Authorization", auth);
    }
    let resp = req.send().await.map_err(|e| AppError::Http(e.to_string()))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Http(format!("HTTP {}: {}", status, body)));
    }
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| AppError::Http(e.to_string()))
}

async fn post_json(
    client: &Client,
    payload: &ConnectionPayload,
    path: &str,
    body: serde_json::Value,
) -> AppResult<serde_json::Value> {
    let url = format!("{}{}", build_base_url(payload), path);
    let mut req = client.post(&url).json(&body);
    if let Some(auth) = auth_header_value(payload) {
        req = req.header("Authorization", auth);
    }
    let resp = req.send().await.map_err(|e| AppError::Http(e.to_string()))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(AppError::Http(format!("HTTP {}: {}", status, body_text)));
    }
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| AppError::Http(e.to_string()))
}

async fn post_no_body(
    client: &Client,
    payload: &ConnectionPayload,
    path: &str,
) -> AppResult<serde_json::Value> {
    let url = format!("{}{}", build_base_url(payload), path);
    let mut req = client.post(&url);
    if let Some(auth) = auth_header_value(payload) {
        req = req.header("Authorization", auth);
    }
    let resp = req.send().await.map_err(|e| AppError::Http(e.to_string()))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(AppError::Http(format!("HTTP {}: {}", status, body_text)));
    }
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| AppError::Http(e.to_string()))
 }
async fn put_json(
    client: &Client,
    payload: &ConnectionPayload,
    path: &str,
    body: serde_json::Value,
) -> AppResult<serde_json::Value> {
    let url = format!("{}{}", build_base_url(payload), path);
    let mut req = client.put(&url).json(&body);
    if let Some(auth) = auth_header_value(payload) {
        req = req.header("Authorization", auth);
    }
    let resp = req.send().await.map_err(|e| AppError::Http(e.to_string()))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(AppError::Http(format!("HTTP {}: {}", status, body_text)));
    }
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| AppError::Http(e.to_string()))
}

async fn delete_req(
    client: &Client,
    payload: &ConnectionPayload,
    path: &str,
) -> AppResult<serde_json::Value> {
    let url = format!("{}{}", build_base_url(payload), path);
    let mut req = client.delete(&url);
    if let Some(auth) = auth_header_value(payload) {
        req = req.header("Authorization", auth);
    }
    let resp = req.send().await.map_err(|e| AppError::Http(e.to_string()))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(AppError::Http(format!("HTTP {}: {}", status, body_text)));
    }
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| AppError::Http(e.to_string()))
}

// ── Payloads ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElasticQueryPayload {
    pub connection: ConnectionPayload,
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub body: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElasticQueryResult {
    pub elapsed_ms: u128,
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexCreatePayload {
    pub connection: ConnectionPayload,
    pub index_name: String,
    #[serde(default)]
    pub settings: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexActionPayload {
    pub connection: ConnectionPayload,
    pub index_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPayload {
    pub connection: ConnectionPayload,
    pub index_name: String,
    #[serde(default)]
    pub doc_id: Option<String>,
    pub document: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentDeletePayload {
    pub connection: ConnectionPayload,
    pub index_name: String,
    pub doc_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSearchPayload {
    pub connection: ConnectionPayload,
    pub index_name: String,
    #[serde(default)]
    pub query: Option<serde_json::Value>,
    #[serde(default)]
    pub from_offset: Option<u64>,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub sort: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSearchResult {
    pub total: u64,
    pub hits: Vec<serde_json::Value>,
    pub elapsed_ms: u128,
}

// ── Public API ──────────────────────────────────────────────────────

pub async fn test_connection(payload: &ConnectionPayload) -> AppResult<()> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;

    let url = format!("{}/", build_base_url(payload));
    let mut req = client.get(&url);
    if let Some(auth) = auth_header_value(payload) {
        req = req.header("Authorization", auth);
    }
    let resp = req.send().await.map_err(|e| AppError::Http(e.to_string()))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Http(format!("HTTP {}: {}", status, body)));
    }
    Ok(())
}

/// Execute an arbitrary Elasticsearch REST API call.
pub async fn execute_query(payload: &ElasticQueryPayload) -> AppResult<ElasticQueryResult> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.connection.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;

    let start = std::time::Instant::now();
    let method = payload.method.to_uppercase();
    let body_val = payload.body.clone().unwrap_or(serde_json::Value::Null);

    let data = match method.as_str() {
        "GET" => get_json(&client, &payload.connection, &payload.path).await?,
        "POST" => post_json(&client, &payload.connection, &payload.path, body_val).await?,
        "PUT" => put_json(&client, &payload.connection, &payload.path, body_val).await?,
        "DELETE" => delete_req(&client, &payload.connection, &payload.path).await?,
        _ => return Err(AppError::InvalidInput(format!("Unsupported method: {}", method))),
    };

    Ok(ElasticQueryResult {
        elapsed_ms: start.elapsed().as_millis(),
        data,
    })
}

/// Get cluster info (GET /).
pub async fn get_cluster_info(payload: &ConnectionPayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;
    get_json(&client, payload, "/").await
}

/// Get cluster health (GET /_cluster/health).
pub async fn get_cluster_health(payload: &ConnectionPayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;
    get_json(&client, payload, "/_cluster/health").await
}

/// Get cluster stats (GET /_cluster/stats).
pub async fn get_cluster_stats(payload: &ConnectionPayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;
    get_json(&client, payload, "/_cluster/stats").await
}

/// Get node stats (GET /_nodes/stats).
pub async fn get_node_stats(payload: &ConnectionPayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;
    get_json(&client, payload, "/_nodes/stats").await
}

/// List all indices (GET /_cat/indices?format=json).
pub async fn list_indices(payload: &ConnectionPayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;
    get_json(&client, payload, "/_cat/indices?format=json&s=index").await
}

/// Create an index (PUT /<index>).
pub async fn create_index(payload: &IndexCreatePayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.connection.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;

    let body = payload.settings.clone().unwrap_or(serde_json::json!({}));
    put_json(&client, &payload.connection, &format!("/{}", payload.index_name), body).await
}

/// Delete an index (DELETE /<index>).
pub async fn delete_index(payload: &IndexActionPayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.connection.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;
    delete_req(&client, &payload.connection, &format!("/{}", payload.index_name)).await
}
/// Open an index (POST /<index>/_open).
pub async fn open_index(payload: &IndexActionPayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.connection.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;
    post_no_body(&client, &payload.connection, &format!("/{}/_open", payload.index_name)).await
}

/// Close an index (POST /<index>/_close).
pub async fn close_index(payload: &IndexActionPayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.connection.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;
    post_no_body(&client, &payload.connection, &format!("/{}/_close", payload.index_name)).await
}

/// Refresh an index (POST /<index>/_refresh).
pub async fn refresh_index(payload: &IndexActionPayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.connection.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;
    post_no_body(&client, &payload.connection, &format!("/{}/_refresh", payload.index_name)).await
}

/// Get index mapping (GET /<index>/_mapping).
pub async fn get_index_mapping(payload: &IndexActionPayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.connection.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;
    get_json(&client, &payload.connection, &format!("/{}/_mapping", payload.index_name)).await
}

/// Get index settings (GET /<index>/_settings).
pub async fn get_index_settings(payload: &IndexActionPayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.connection.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;
    get_json(&client, &payload.connection, &format!("/{}/_settings", payload.index_name)).await
}

/// Search documents in an index.
pub async fn search_documents(payload: &DocumentSearchPayload) -> AppResult<DocumentSearchResult> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.connection.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;

    let start = std::time::Instant::now();

    let mut body = serde_json::Map::new();
    if let Some(query) = &payload.query {
        body.insert("query".to_string(), query.clone());
    } else {
        body.insert("query".to_string(), serde_json::json!({"match_all": {}}));
    }
    if let Some(from) = payload.from_offset {
        body.insert("from".to_string(), serde_json::json!(from));
    }
    if let Some(size) = payload.size {
        body.insert("size".to_string(), serde_json::json!(size));
    } else {
        body.insert("size".to_string(), serde_json::json!(50));
    }
    if let Some(sort) = &payload.sort {
        body.insert("sort".to_string(), sort.clone());
    }

    let path = format!("/{}/_search", payload.index_name);
    let result = post_json(
        &client,
        &payload.connection,
        &path,
        serde_json::Value::Object(body),
    )
    .await?;

    let total = result
        .get("hits")
        .and_then(|h| h.get("total"))
        .and_then(|t| {
            if t.is_number() {
                t.as_u64()
            } else {
                t.get("value").and_then(|v| v.as_u64())
            }
        })
        .unwrap_or(0);

    let hits = result
        .get("hits")
        .and_then(|h| h.get("hits"))
        .and_then(|h| h.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(DocumentSearchResult {
        total,
        hits,
        elapsed_ms: start.elapsed().as_millis(),
    })
}

/// Index (create/update) a document.
pub async fn index_document(payload: &DocumentPayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.connection.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;

    let path = if let Some(id) = &payload.doc_id {
        format!("/{}/_doc/{}", payload.index_name, id)
    } else {
        format!("/{}/_doc", payload.index_name)
    };

    put_json(&client, &payload.connection, &path, payload.document.clone()).await
}

/// Delete a document.
pub async fn delete_document(payload: &DocumentDeletePayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.connection.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;
    let path = format!("/{}/_doc/{}", payload.index_name, payload.doc_id);
    delete_req(&client, &payload.connection, &path).await
}

/// List templates (GET /_cat/templates?format=json).
pub async fn list_templates(payload: &ConnectionPayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;
    get_json(&client, payload, "/_cat/templates?format=json").await
}

/// List pipelines (GET /_ingest/pipeline).
pub async fn list_pipelines(payload: &ConnectionPayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;
    get_json(&client, payload, "/_ingest/pipeline").await
}

/// List aliases (GET /_aliases).
pub async fn list_aliases(payload: &ConnectionPayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;
    get_json(&client, payload, "/_aliases").await
}

/// Get shard info (GET /_cat/shards?format=json).
pub async fn list_shards(payload: &ConnectionPayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;
    get_json(&client, payload, "/_cat/shards?format=json").await
}

/// Get nodes info (GET /_nodes).
pub async fn get_nodes_info(payload: &ConnectionPayload) -> AppResult<serde_json::Value> {
    let client = Client::builder()
        .danger_accept_invalid_certs(payload.ssl)
        .build()
        .map_err(|e| AppError::Http(e.to_string()))?;
    get_json(&client, payload, "/_nodes").await
}