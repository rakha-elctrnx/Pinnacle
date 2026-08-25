//! Domain wire types for the MongoDB explorer feature.
//!
//! Every struct here is mirrored 1:1 by
//! `frontend/features/mongodb/types/mongodb.ts` (serde camelCase on the Rust
//! side). Documents cross the Tauri boundary as `serde_json::Value` holding
//! Extended JSON v2 (Relaxed for reads, Canonical for edits/exports); the
//! conversion helpers live in the connector, not here.

use serde::{Deserialize, Serialize};

use crate::domain::query::ConnectionPayload;

/// Fixed `appName` reported to servers so admins can attribute connections.
pub const MONGO_APP_NAME: &str = "Pinnacle";

fn default_app_name() -> String {
    MONGO_APP_NAME.to_string()
}

/// ── Connection options (`mongoConfig`) ─────────────────────────────

/// URI scheme. `Srv` implies TLS and DNS-based host discovery.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MongoScheme {
    #[serde(rename = "mongodb")]
    Standard,
    #[serde(rename = "mongodb+srv")]
    Srv,
}

impl Default for MongoScheme {
    fn default() -> Self {
        Self::Standard
    }
}

impl MongoScheme {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Standard => "mongodb",
            Self::Srv => "mongodb+srv",
        }
    }
}

/// Read preference passed through to the driver.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MongoReadPreference {
    #[default]
    Primary,
    PrimaryPreferred,
    Secondary,
    SecondaryPreferred,
    Nearest,
}

impl MongoReadPreference {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Primary => "primary",
            Self::PrimaryPreferred => "primaryPreferred",
            Self::Secondary => "secondary",
            Self::SecondaryPreferred => "secondaryPreferred",
            Self::Nearest => "nearest",
        }
    }

    /// Parse from the URI `readPreference` option / form control.
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "primary" => Some(Self::Primary),
            "primaryPreferred" | "primary-preferred" => Some(Self::PrimaryPreferred),
            "secondary" => Some(Self::Secondary),
            "secondaryPreferred" | "secondary-preferred" => Some(Self::SecondaryPreferred),
            "nearest" => Some(Self::Nearest),
            _ => None,
        }
    }
}

/// Non-secret MongoDB connection options persisted inside
/// [`crate::domain::connection::ConnectionMetadata`] and echoed in runtime
/// payloads. Secrets (password) are never stored here.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoConnectionOptions {
    pub scheme: MongoScheme,
    /// Standard entries are `host:port`; SRV holds exactly one bare hostname.
    pub hosts: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub replica_set: Option<String>,
    #[serde(default)]
    pub read_preference: MongoReadPreference,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub direct_connection: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tls: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tls_ca_file: Option<String>,
    #[serde(default = "default_app_name")]
    pub app_name: String,
}

/// Sanitized result of parsing a `mongodb://` / `mongodb+srv://` URI.
/// Never carries the password itself — only whether one was present.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoParsedUri {
    pub mongo_config: MongoConnectionOptions,
    /// Display host: first configured host without its port (SRV: the seed host).
    pub host: String,
    /// Display port: explicit port, else 27017 (SRV: driver-resolved, unknown here).
    pub port: u16,
    /// Database from the URI path ('' when absent).
    pub database: String,
    /// Username from userinfo ('' when absent).
    pub username: String,
    pub has_uri_password: bool,
    /// Non-fatal notes (e.g. legacy profile fallbacks) shown in the UI.
    #[serde(default)]
    pub warnings: Vec<String>,
}

/// Result of `mongo_test_connection`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoTestConnectionResult {
    pub ok: bool,
    pub message: String,
    /// `buildInfo.version` when the ping succeeded.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_version: Option<String>,
    /// Human topology summary (Single / ReplicaSet(3) / Sharded).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub topology: Option<String>,
}

/// ── Namespaces, databases, collections ────────────────────────────

/// Payload for operations scoped to a database.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoDatabasePayload {
    pub connection: ConnectionPayload,
    pub database: String,
}

/// Payload for operations scoped to a namespace (database + collection).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoNamespacePayload {
    pub connection: ConnectionPayload,
    pub database: String,
    pub collection: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoDatabaseInfo {
    pub name: String,
    /// Present only when the server reports it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_on_disk_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub empty: Option<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MongoCollectionType {
    Collection,
    View,
    Timeseries,
}

/// One entry from `listCollections`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoCollectionInfo {
    pub name: String,
    pub collection_type: MongoCollectionType,
    /// True for views and `readOnly: true` system views.
    pub read_only: bool,
    /// Raw creation options as Relaxed Extended JSON (validator included).
    pub options: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoTimeSeriesOptions {
    pub time_field: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta_field: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub granularity: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoCreateCollectionOptions {
    #[serde(default)]
    pub capped: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_documents: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time_series: Option<MongoTimeSeriesOptions>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoCreateCollectionPayload {
    pub connection: ConnectionPayload,
    pub database: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<MongoCreateCollectionOptions>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoRenameCollectionPayload {
    pub connection: ConnectionPayload,
    pub database: String,
    pub collection: String,
    pub new_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoDropCollectionPayload {
    pub connection: ConnectionPayload,
    pub database: String,
    pub collection: String,
}

/// ── Find / aggregate / explain ─────────────────────────────────────

/// Page sizes offered by the UI; anything outside is rejected.
pub const MONGO_PAGE_SIZES: &[u32] = &[25, 50, 75, 100];
fn default_page_size() -> u32 {
    50
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoFindPayload {
    pub connection: ConnectionPayload,
    pub database: String,
    pub collection: String,
    /// Extended JSON v2 filter (`{}` = all documents).
    #[serde(default)]
    pub filter: Option<serde_json::Value>,
    #[serde(default)]
    pub project: Option<serde_json::Value>,
    #[serde(default)]
    pub sort: Option<serde_json::Value>,
    #[serde(default)]
    pub collation: Option<serde_json::Value>,
    #[serde(default)]
    pub offset: u64,
    #[serde(default = "default_page_size")]
    pub page_size: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_time_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoFindResult {
    /// Relaxed Extended JSON for display.
    pub documents: Vec<serde_json::Value>,
    /// Canonical Extended JSON for stable row identity and editing.
    pub canonical_documents: Vec<serde_json::Value>,
    pub offset: u64,
    pub has_previous: bool,
    pub has_next: bool,
    pub elapsed_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoAggregatePayload {
    pub connection: ConnectionPayload,
    pub database: String,
    pub collection: String,
    /// Ordered pipeline stages as Extended JSON v2 values.
    pub pipeline: Vec<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_disk_use: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_time_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview_limit: Option<u64>,
    /// Pinnacle safety gate: `$out` / `$merge` require this to be true.
    #[serde(default)]
    pub allow_writes: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoDocumentListResult {
    /// Relaxed Extended JSON for display.
    pub documents: Vec<serde_json::Value>,
    /// Canonical Extended JSON.
    pub canonical_documents: Vec<serde_json::Value>,
    pub elapsed_ms: u128,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MongoExplainOperation {
    Find,
    Aggregate,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MongoVerbosity {
    QueryPlanner,
    #[default]
    ExecutionStats,
    AllPlansExecution,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoExplainPayload {
    pub connection: ConnectionPayload,
    pub database: String,
    pub collection: String,
    pub operation: MongoExplainOperation,
    /// find options (filter/sort/projection/collation/limit/skip) for Find.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub find_options: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub pipeline: Vec<serde_json::Value>,
    #[serde(default)]
    pub verbosity: MongoVerbosity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoExplainResult {
    /// Full server explain output as Canonical Extended JSON.
    pub raw_plan: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub winning_stage: Option<String>,
    #[serde(default)]
    pub index_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_keys_examined: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_docs_examined: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub n_returned: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub execution_time_millis: Option<i64>,
}

/// ── Document mutations ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoInsertPayload {
    pub connection: ConnectionPayload,
    pub database: String,
    pub collection: String,
    /// Canonical Extended JSON document.
    pub document: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoReplacePayload {
    pub connection: ConnectionPayload,
    pub database: String,
    pub collection: String,
    /// Identity predicate (usually `{ _id: ... }` in Extended JSON).
    pub identity_filter: serde_json::Value,
    /// Complete original document (Canonical) — combined atomically with the
    /// identity filter into the replaceOne predicate.
    pub original_canonical: serde_json::Value,
    /// Replacement document (Canonical).
    pub replacement_canonical: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoDeletePayload {
    pub connection: ConnectionPayload,
    pub database: String,
    pub collection: String,
    pub identity_filter: serde_json::Value,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoMutationResult {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inserted_id: Option<serde_json::Value>,
    #[serde(default)]
    pub matched_count: u64,
    #[serde(default)]
    pub modified_count: u64,
    #[serde(default)]
    pub deleted_count: u64,
}

/// ── Stats & schema sampling ────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoCollectionStats {
    pub count: u64,
    pub size_bytes: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avg_obj_size_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub storage_size_bytes: Option<u64>,
    pub index_count: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub index_size_bytes: Option<u64>,
    #[serde(default)]
    pub capped: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoSampleSchemaPayload {
    pub connection: ConnectionPayload,
    pub database: String,
    pub collection: String,
    #[serde(default)]
    pub filter: Option<serde_json::Value>,
    /// UI choices: 100 | 500 | 1000.
    pub sample_size: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoSchemaTypeStat {
    pub bson_type: String,
    pub count: u64,
    /// Percentage of occurrences of this field (not of the sample).
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoSchemaFieldNode {
    /// Dotted path, e.g. `address.city`, `tags`.
    pub path: String,
    /// Share of sampled documents containing this path (0–100).
    pub presence_percentage: f64,
    pub types: Vec<MongoSchemaTypeStat>,
    /// Rough distinct-value estimate within the sample.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub distinct_estimate: Option<u64>,
    /// Representative scalar values (Relaxed Extended JSON), capped.
    #[serde(default)]
    pub representative_values: Vec<serde_json::Value>,
    /// Numeric/date/ObjectId min when computable.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub array_min_length: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub array_max_length: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub array_avg_length: Option<f64>,
    /// Nested object fields.
    #[serde(default)]
    pub children: Vec<MongoSchemaFieldNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoSampleSchemaResult {
    /// Documents actually examined.
    pub sampled_documents: u64,
    pub fields: Vec<MongoSchemaFieldNode>,
    pub stats: MongoCollectionStats,
    pub elapsed_ms: u128,
}

/// ── Indexes ────────────────────────────────────────────────────────

/// One ordered key of an index. `direction` is `1`, `-1`,
/// `"2dsphere"`, `"text"` or `"hashed"` (as JSON number/string exactly like
/// the server reports it).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoIndexKey {
    pub field: String,
    pub direction: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoIndexInfo {
    pub name: String,
    pub keys: Vec<MongoIndexKey>,
    #[serde(default)]
    pub unique: bool,
    #[serde(default)]
    pub sparse: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hidden: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expire_after_seconds: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub partial_filter_expression: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wildcard_projection: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collation: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    /// `accesses.ops` since server restart, when `$indexStats` reports it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage_since_restart: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoCreateIndexPayload {
    pub connection: ConnectionPayload,
    pub database: String,
    pub collection: String,
    pub keys: Vec<MongoIndexKey>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default)]
    pub unique: bool,
    #[serde(default)]
    pub sparse: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expire_after_seconds: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub partial_filter_expression: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wildcard_projection: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collation: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoSetIndexHiddenPayload {
    pub connection: ConnectionPayload,
    pub database: String,
    pub collection: String,
    pub index_name: String,
    pub hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoDropIndexPayload {
    pub connection: ConnectionPayload,
    pub database: String,
    pub collection: String,
    pub index_name: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MongoJsonMode {
    #[default]
    Canonical,
    Relaxed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoCreatedName {
    pub name: String,
}

/// ── Validation ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MongoValidationLevel {
    Off,
    Strict,
    Moderate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MongoValidationAction {
    Error,
    Warn,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoValidationSettings {
    /// `$jsonSchema` or query-expression validator; None/absent = none set.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub validator: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub validation_level: Option<MongoValidationLevel>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub validation_action: Option<MongoValidationAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoSetValidationPayload {
    pub connection: ConnectionPayload,
    pub database: String,
    pub collection: String,
    #[serde(flatten)]
    pub settings: MongoValidationSettings,
}

/// ── Export ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MongoExportFormat {
    Json,
    Csv,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoExportPayload {
    pub connection: ConnectionPayload,
    pub database: String,
    pub collection: String,
    /// Current query context; cleared explicitly by "export collection".
    #[serde(default)]
    pub filter: Option<serde_json::Value>,
    #[serde(default)]
    pub project: Option<serde_json::Value>,
    #[serde(default)]
    pub sort: Option<serde_json::Value>,
    #[serde(default)]
    pub collation: Option<serde_json::Value>,
    pub format: MongoExportFormat,
    #[serde(default)]
    pub json_mode: MongoJsonMode,
    /// Absolute output path from the native save dialog.
    pub save_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoExportProgress {
    pub documents_exported: u64,
    pub done: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoExportResult {
    pub success: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    pub document_count: u64,
    pub elapsed_ms: u128,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoEstimateExportPayload {
    pub connection: ConnectionPayload,
    pub database: String,
    pub collection: String,
    #[serde(default)]
    pub filter: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoExportEstimate {
    pub document_count: u64,
    pub estimated_size_bytes: u64,
    pub is_large: bool,
}
