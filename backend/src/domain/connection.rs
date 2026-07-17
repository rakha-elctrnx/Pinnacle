use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Connection type supported by Pinnacle
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionType {
    Postgresql,
    Mysql,
    Mongodb,
    Redis,
    Rabbitmq,
    Elasticsearch,
    Sqlite,
}
impl std::str::FromStr for ConnectionType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "postgresql" | "postgres" => Ok(ConnectionType::Postgresql),
            "mysql" => Ok(ConnectionType::Mysql),
            "mongodb" => Ok(ConnectionType::Mongodb),
            "redis" => Ok(ConnectionType::Redis),
            "rabbitmq" | "rabbit_mq" => Ok(ConnectionType::Rabbitmq),
            "elasticsearch" | "es" => Ok(ConnectionType::Elasticsearch),
            "sqlite" => Ok(ConnectionType::Sqlite),
            _ => Err(format!("Unknown connection type: {}", s)),
        }
    }
}

impl std::fmt::Display for ConnectionType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConnectionType::Postgresql => write!(f, "postgresql"),
            ConnectionType::Mysql => write!(f, "mysql"),
            ConnectionType::Mongodb => write!(f, "mongodb"),
            ConnectionType::Redis => write!(f, "redis"),
            ConnectionType::Rabbitmq => write!(f, "rabbitmq"),
            ConnectionType::Elasticsearch => write!(f, "elasticsearch"),
            ConnectionType::Sqlite => write!(f, "sqlite"),
        }
    }
}

/// SSH tunnel configuration for connecting through a bastion/jump host.
///
/// Stored as part of ConnectionMetadata (non-secret fields only). SSH password
/// and private-key passphrase are stored separately in the credential store,
/// mirroring how the DB password is handled.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SshConfig {
    /// Bastion/jump host hostname or IP.
    pub host: String,
    /// SSH port on the bastion (default 22).
    pub port: u16,
    /// SSH user on the bastion.
    pub username: String,
    /// Authentication method: "password" | "privateKey" | "agent".
    pub auth_method: String,
    /// Path to the private key file when auth_method == "privateKey".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub private_key_path: Option<String>,
}

impl SshConfig {
    pub fn auth_method(&self) -> SshAuthMethod {
        match self.auth_method.as_str() {
            "privateKey" => SshAuthMethod::PrivateKey,
            "agent" => SshAuthMethod::Agent,
            _ => SshAuthMethod::Password,
        }
    }
}

/// Discriminator for the SSH authentication strategy in use.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SshAuthMethod {
    Password,
    PrivateKey,
    Agent,
}

/// SSL/TLS configuration for SQL connections (PostgreSQL, MySQL).
///
/// Stores only file PATHS to certificates/keys (not their contents — the files
/// live on the user's disk, loaded by sqlx at connect time). The legacy
/// `ConnectionMetadata.ssl: bool` field stays for Redis/Elasticsearch; SQL
/// connectors consult `ssl_config` when present and fall back to `ssl == true`
/// => "require" for backward compatibility with pre-task-041 profiles.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SslConfig {
    /// "disable" | "prefer" | "require" | "verify-ca" | "verify-full"
    pub mode: String,
    /// Path to the CA root certificate (PEM) for verify-ca / verify-full.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ca_cert_path: Option<String>,
    /// Path to the client certificate (PEM) for mTLS.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_cert_path: Option<String>,
    /// Path to the client private key (PEM) matching `client_cert_path`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_key_path: Option<String>,
}

impl SslConfig {
    /// Resolve the effective mode, falling back to "require" when empty.
    pub fn effective_mode(&self) -> &str {
        if self.mode.is_empty() { "require" } else { self.mode.as_str() }
    }
}
/// Metadata for a connection profile (stored as JSON file via the store connector)
/// Does NOT contain secrets - those are stored separately in the OS keyring
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionMetadata {
    pub id: String,
    pub name: String,
    pub r#type: ConnectionType,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub database: String,
    pub ssl: bool,
    #[serde(default)]
    pub schema: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub favorite: bool,
    pub created_at: String,
    pub updated_at: String,
    /// Optional SSH tunnel. When present, the SQL connection is established
    /// through an SSH tunnel to this bastion host instead of directly.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssh: Option<SshConfig>,
    /// Optional SSL/TLS config for SQL connections. When absent, SQL connectors
    /// fall back to the legacy `ssl: bool` field (true => "require").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssl_config: Option<SslConfig>,
    /// Max connections in the pool. `None` => backend default (10).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pool_size: Option<u32>,
    /// Idle connection reaper timeout (seconds). `None` => 300s.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub idle_timeout_secs: Option<u64>,
}

impl ConnectionMetadata {
    pub fn new(
        id: String,
        name: String,
        r#type: ConnectionType,
        host: String,
        port: u16,
        username: String,
        database: String,
        ssl: bool,
    ) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id,
            name,
            r#type,
            host,
            port,
            username,
            database,
            ssl,
            schema: String::new(),
            tags: Vec::new(),
            favorite: false,
            created_at: now.clone(),
            updated_at: now,
            ssh: None,
            ssl_config: None,
            pool_size: None,
            idle_timeout_secs: None,
        }
    }

    /// Generate a keyring service name for this connection
    pub fn keyring_service(&self) -> String {
        format!("pinnacle-connection-{}", self.id)
    }

    /// Generate a keyring username (connection ID) for this connection
    pub fn keyring_username(&self) -> String {
        self.id.clone()
    }
}

/// Request to save a new or update an existing connection
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConnectionRequest {
    pub metadata: ConnectionMetadata,
    pub password: Option<String>,
    /// SSH password for tunnel auth (when ssh.auth_method == "password").
    /// Stored separately in the credential store, never serialized into metadata.
    #[serde(default)]
    pub ssh_password: Option<String>,
    /// Passphrase for an encrypted SSH private key (when ssh.auth_method == "privateKey").
    /// Stored separately in the credential store, never serialized into metadata.
    #[serde(default)]
    pub key_passphrase: Option<String>,
}

/// Response containing connection metadata (without password)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionResponse {
    pub metadata: ConnectionMetadata,
    /// Reference to the password in keyring (format: keyring://{connection_id})
    pub password_ref: String,
}

impl From<ConnectionMetadata> for ConnectionResponse {
    fn from(metadata: ConnectionMetadata) -> Self {
        let id = metadata.id.clone();
        Self {
            metadata,
            password_ref: format!("keyring://{}", id),
        }
    }
}

/// List of all connection responses
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionListResponse {
    pub connections: Vec<ConnectionResponse>,
}

/// Request to get a connection password
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetPasswordRequest {
    pub connection_id: String,
}

/// Response containing a connection password
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetPasswordResponse {
    pub connection_id: String,
    pub password: String,
}

/// Request to delete a connection
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteConnectionRequest {
    pub connection_id: String,
}

/// Filter options for listing connections
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionFilter {
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub connection_type: Option<ConnectionType>,
    #[serde(default)]
    pub tags: Option<HashSet<String>>,
    #[serde(default)]
    pub favorites_only: bool,
}

/// Full connection profile with password (used internally, not exposed to frontend)
#[derive(Debug, Clone)]
pub struct FullConnection {
    pub metadata: ConnectionMetadata,
    pub password: String,
}

impl FullConnection {
    pub fn new(metadata: ConnectionMetadata, password: String) -> Self {
        Self { metadata, password }
    }

    /// Convert to a response that can be safely sent to frontend (no password)
    pub fn to_response(&self) -> ConnectionResponse {
        ConnectionResponse {
            metadata: self.metadata.clone(),
            password_ref: format!("keyring://{}", self.metadata.id),
        }
    }
}
