use crate::{
    domain::query::ConnectionPayload,
    infrastructure::connectors::elastic::{
        self, DocumentDeletePayload, DocumentPayload, DocumentSearchPayload,
        DocumentSearchResult, ElasticQueryPayload, ElasticQueryResult, IndexActionPayload,
        IndexCreatePayload,
    },
};

#[tauri::command]
pub async fn elastic_test_connection(payload: ConnectionPayload) -> Result<(), String> {
    elastic::test_connection(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_execute_query(payload: ElasticQueryPayload) -> Result<ElasticQueryResult, String> {
    elastic::execute_query(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_get_cluster_info(payload: ConnectionPayload) -> Result<serde_json::Value, String> {
    elastic::get_cluster_info(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_get_cluster_health(payload: ConnectionPayload) -> Result<serde_json::Value, String> {
    elastic::get_cluster_health(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_get_cluster_stats(payload: ConnectionPayload) -> Result<serde_json::Value, String> {
    elastic::get_cluster_stats(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_get_node_stats(payload: ConnectionPayload) -> Result<serde_json::Value, String> {
    elastic::get_node_stats(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_list_indices(payload: ConnectionPayload) -> Result<serde_json::Value, String> {
    elastic::list_indices(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_create_index(payload: IndexCreatePayload) -> Result<serde_json::Value, String> {
    elastic::create_index(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_delete_index(payload: IndexActionPayload) -> Result<serde_json::Value, String> {
    elastic::delete_index(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_get_index_mapping(payload: IndexActionPayload) -> Result<serde_json::Value, String> {
    elastic::get_index_mapping(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_get_index_settings(payload: IndexActionPayload) -> Result<serde_json::Value, String> {
    elastic::get_index_settings(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_search_documents(payload: DocumentSearchPayload) -> Result<DocumentSearchResult, String> {
    elastic::search_documents(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_index_document(payload: DocumentPayload) -> Result<serde_json::Value, String> {
    elastic::index_document(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_delete_document(payload: DocumentDeletePayload) -> Result<serde_json::Value, String> {
    elastic::delete_document(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_list_templates(payload: ConnectionPayload) -> Result<serde_json::Value, String> {
    elastic::list_templates(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_list_pipelines(payload: ConnectionPayload) -> Result<serde_json::Value, String> {
    elastic::list_pipelines(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_list_aliases(payload: ConnectionPayload) -> Result<serde_json::Value, String> {
    elastic::list_aliases(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_list_shards(payload: ConnectionPayload) -> Result<serde_json::Value, String> {
    elastic::list_shards(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_get_nodes_info(payload: ConnectionPayload) -> Result<serde_json::Value, String> {
    elastic::get_nodes_info(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_open_index(payload: IndexActionPayload) -> Result<serde_json::Value, String> {
    elastic::open_index(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_close_index(payload: IndexActionPayload) -> Result<serde_json::Value, String> {
    elastic::close_index(&payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn elastic_refresh_index(payload: IndexActionPayload) -> Result<serde_json::Value, String> {
    elastic::refresh_index(&payload)
        .await
        .map_err(|e| e.to_string())
}