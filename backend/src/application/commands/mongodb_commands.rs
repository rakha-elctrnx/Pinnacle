use crate::{
    domain::mongodb::*,
    domain::query::ConnectionPayload,
    infrastructure::connectors::mongodb,
};

#[tauri::command]
pub async fn mongo_parse_uri(uri: String) -> Result<MongoParsedUri, String> {
    mongodb::parse_uri_sync(&uri).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_test_connection(
    payload: ConnectionPayload,
) -> Result<MongoTestConnectionResult, String> {
    mongodb::test_connection(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_list_databases(
    payload: ConnectionPayload,
) -> Result<Vec<MongoDatabaseInfo>, String> {
    mongodb::list_databases(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_create_database(
    _payload: MongoDatabasePayload,
) -> Result<(), String> {
    // In MongoDB databases are created lazily upon inserting a document/collection.
    Ok(())
}

#[tauri::command]
pub async fn mongo_drop_database(payload: MongoDatabasePayload) -> Result<(), String> {
    mongodb::drop_collection(
        &MongoDropCollectionPayload {
            connection: payload.connection,
            database: payload.database,
            collection: "__pinnacle_dummy__".to_string(),
        },
        None,
        None,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_list_collections(
    payload: MongoDatabasePayload,
) -> Result<Vec<MongoCollectionInfo>, String> {
    mongodb::list_collections(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_create_collection(
    payload: MongoCreateCollectionPayload,
) -> Result<(), String> {
    mongodb::create_collection(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_rename_collection(
    payload: MongoRenameCollectionPayload,
) -> Result<(), String> {
    mongodb::rename_collection(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_drop_collection(payload: MongoDropCollectionPayload) -> Result<(), String> {
    mongodb::drop_collection(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_find_documents(
    payload: MongoFindPayload,
) -> Result<MongoFindResult, String> {
    mongodb::find_documents(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_insert_document(
    payload: MongoInsertPayload,
) -> Result<MongoMutationResult, String> {
    mongodb::insert_document(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_update_document(
    payload: MongoReplacePayload,
) -> Result<MongoMutationResult, String> {
    mongodb::replace_document(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_delete_document(
    payload: MongoDeletePayload,
) -> Result<MongoMutationResult, String> {
    mongodb::delete_document(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_aggregate(
    payload: MongoAggregatePayload,
) -> Result<MongoDocumentListResult, String> {
    mongodb::aggregate_documents(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_explain(
    payload: MongoExplainPayload,
) -> Result<MongoExplainResult, String> {
    mongodb::explain(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_get_collection_stats(
    payload: MongoNamespacePayload,
) -> Result<MongoCollectionStats, String> {
    mongodb::get_collection_stats(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_analyze_schema(
    payload: MongoSampleSchemaPayload,
) -> Result<MongoSampleSchemaResult, String> {
    mongodb::sample_schema(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_list_indexes(
    payload: MongoNamespacePayload,
) -> Result<Vec<MongoIndexInfo>, String> {
    mongodb::list_indexes(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_create_index(
    payload: MongoCreateIndexPayload,
) -> Result<MongoCreatedName, String> {
    mongodb::create_index(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_drop_index(
    payload: MongoDropIndexPayload,
) -> Result<(), String> {
    mongodb::drop_index(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_set_index_hidden(
    payload: MongoSetIndexHiddenPayload,
) -> Result<(), String> {
    mongodb::set_index_hidden(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_get_validation(
    payload: MongoNamespacePayload,
) -> Result<MongoValidationSettings, String> {
    mongodb::get_validation(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_set_validation(
    payload: MongoSetValidationPayload,
) -> Result<(), String> {
    mongodb::set_validation(&payload, None, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mongo_export(
    payload: MongoExportPayload,
) -> Result<MongoExportResult, String> {
    mongodb::execute_export(&payload, None, None, None::<fn(MongoExportProgress)>)
        .await
        .map_err(|e| e.to_string())
}
