use serde::{Deserialize, Serialize};

// ── Commit Table Changes (task-011c) ────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitTableChangesPayload {
    pub connection: ConnectionPayload,
    pub table_name: String,
    pub inserts: Vec<serde_json::Map<String, serde_json::Value>>,
    pub updates: Vec<RowUpdate>,
    pub deletes: Vec<String>,
    pub primary_key_column: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowUpdate {
    pub row_id: String,
    pub changes: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitTableChangesResult {
    pub inserted_rows: u64,
    pub updated_rows: u64,
    pub deleted_rows: u64,
}

// ── Original types ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionPayload {
    pub r#type: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    #[serde(default)]
    pub password: String,
    pub database: String,
    pub ssl: bool,
    #[serde(default)]
    pub schema: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssh: Option<SshConfig>,
    /// ID of the saved connection this payload originates from, used to look up
    /// SSH-layer secrets (ssh password / key passphrase) from the credential store.
    /// Absent for the test-connection-before-save flow, where secrets are passed inline.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub connection_id: Option<String>,
    /// Optional SSL/TLS config for SQL connections (PostgreSQL, MySQL).
    /// When absent, connectors fall back to the legacy `ssl: bool` field.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssl_config: Option<SslConfig>,
    /// Max connections in the pool. `None` => backend default (10).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pool_size: Option<u32>,
    /// Idle connection reaper timeout (seconds). `None` => 300s.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub idle_timeout_secs: Option<u64>,
}

/// SSL/TLS configuration for SQL connections (mirrors
/// domain::connection::SslConfig). Stores file PATHS only, never cert content.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SslConfig {
    /// "disable" | "prefer" | "require" | "verify-ca" | "verify-full"
    pub mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ca_cert_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_cert_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_key_path: Option<String>,
}

#[allow(dead_code)]
impl SslConfig {
    /// Resolve the effective mode, falling back to "require" when empty.
    pub fn effective_mode(&self) -> &str {
        if self.mode.is_empty() { "require" } else { &self.mode }
    }
}

/// SSH tunnel configuration (mirrors domain::connection::SshConfig but lives

/// SSH tunnel configuration (mirrors domain::connection::SshConfig but lives
/// in the query payload so connectors can branch on it without a circular import).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SshConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    /// "password" | "privateKey" | "agent"
    pub auth_method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub private_key_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlQueryPayload {
    pub connection: ConnectionPayload,
    pub sql: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub rows_affected: u64,
    pub elapsed_ms: u128,
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Map<String, serde_json::Value>>,
}

// ── Transaction Mode Types ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionHandle {
    pub transaction_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionStepResult {
    pub statement_index: u32,
    pub success: bool,
    pub error: Option<String>,
    pub elapsed_ms: u64,
    pub query_result: Option<QueryResult>,
    pub rows_affected: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionCommitResult {
    pub committed: bool,
    pub elapsed_ms: u64,
}

// ── Table Schema Introspection Types ──────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableSchemaInfo {
    pub table_name: String,
    pub schema: String,
    pub columns: Vec<TableColumn>,
    pub primary_key: Option<PrimaryKeyConstraint>,
    pub unique_constraints: Vec<UniqueConstraint>,
    pub foreign_keys: Vec<ForeignKeyConstraint>,
    pub indexes: Vec<IndexDefinition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableColumn {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub default_value: Option<String>,
    pub is_auto_increment: bool,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrimaryKeyConstraint {
    pub name: String,
    pub columns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UniqueConstraint {
    pub name: String,
    pub columns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKeyConstraint {
    pub name: String,
    pub columns: Vec<String>,
    pub referenced_table: String,
    pub referenced_schema: String,
    pub referenced_columns: Vec<String>,
    pub on_update: String,
    pub on_delete: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexDefinition {
    pub name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
    pub index_type: String,
}

/// Schema-level column info for bulk column fetch (ER diagram nodes).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaColumn {
    pub table_name: String,
    pub column_name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub default_value: Option<String>,
    pub data_type_name: String,
}

/// Schema-level foreign key info including source table name (used for bulk FK fetch).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaForeignKey {
    pub source_table: String,
    pub constraint_name: String,
    pub columns: Vec<String>,
    pub referenced_table: String,
    pub referenced_schema: String,
    pub referenced_columns: Vec<String>,
}

// ── DDL Generation Types ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlPlan {
    pub statements: Vec<DdlStatement>,
    pub is_destructive: bool,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlStatement {
    pub order: u32,
    pub sql: String,
    pub description: String,
    pub is_destructive: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlExecutionResult {
    pub success: bool,
    pub executed_count: u32,
    pub statements: Vec<DdlStatementResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlStatementResult {
    pub order: u32,
    pub sql: String,
    pub success: bool,
    pub error: Option<String>,
    pub elapsed_ms: u128,
}

// ── Drop Table Types ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DropTablePayload {
    pub connection: ConnectionPayload,
    pub schema: String,
    pub table_name: String,
    pub cascade: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DropTableResult {
    pub success: bool,
    pub sql: String,
    pub elapsed_ms: u128,
    pub error: Option<String>,
}
