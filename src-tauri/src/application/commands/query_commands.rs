use crate::{
    domain::query::{ConnectionTestResult, QueryResult, SqlQueryPayload},
    infrastructure::connectors::sql,
};

#[tauri::command]
pub async fn test_connection(
    payload: crate::domain::query::ConnectionPayload,
) -> Result<ConnectionTestResult, String> {
    sql::test_connection(&payload)
        .await
        .map(|_| ConnectionTestResult {
            ok: true,
            message: "Connection successful".to_string(),
        })
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn execute_sql(payload: SqlQueryPayload) -> Result<QueryResult, String> {
    sql::execute_sql(&payload.connection, payload.sql.as_str())
        .await
        .map_err(|err| err.to_string())
}
