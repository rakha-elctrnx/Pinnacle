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
        }
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
