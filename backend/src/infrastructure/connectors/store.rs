//! Store connector for persisting connection metadata and passwords as a JSON file.
//!
//! Connection metadata is stored as a single JSON file in the app's data directory.
//! Passwords are persisted alongside metadata in this local store, with the OS keyring
//! used as an optional secondary store.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::{
    core::result::AppResult,
    domain::connection::{ConnectionMetadata, ConnectionType},
};

const STORE_FILENAME: &str = "pinnacle-connections.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredConnection {
    metadata: ConnectionMetadata,
    #[serde(default)]
    password: Option<String>,
}

fn store_path(app_data: &PathBuf) -> PathBuf {
    app_data.join(STORE_FILENAME)
}

fn load_all_stored(app_data: &PathBuf) -> AppResult<Vec<StoredConnection>> {
    let path = store_path(app_data);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path)?;

    // Try the new wrapped format first; fall back to the legacy flat format
    // so existing connection files keep working after the upgrade.
    if let Ok(stored) = serde_json::from_str::<Vec<StoredConnection>>(&content) {
        return Ok(stored);
    }

    let legacy: Vec<ConnectionMetadata> = serde_json::from_str(&content)?;
    Ok(legacy
        .into_iter()
        .map(|metadata| StoredConnection {
            metadata,
            password: None,
        })
        .collect())
}

fn save_all_stored(app_data: &PathBuf, connections: &[StoredConnection]) -> AppResult<()> {
    let path = store_path(app_data);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(connections)?;
    std::fs::write(&path, content)?;
    Ok(())
}

fn load_all(app_data: &PathBuf) -> AppResult<Vec<ConnectionMetadata>> {
    Ok(load_all_stored(app_data)?
        .into_iter()
        .map(|stored| stored.metadata)
        .collect())
}

/// Save connection metadata and an optional password to the store file.
///
/// When `password` is `None`, the existing stored password is preserved.
pub async fn save_connection(
    app_data: &PathBuf,
    metadata: &ConnectionMetadata,
    password: Option<&str>,
) -> AppResult<()> {
    let mut all = load_all_stored(app_data)?;
    match all.iter_mut().find(|c| c.metadata.id == metadata.id) {
        Some(existing) => {
            existing.metadata = metadata.clone();
            if let Some(p) = password {
                existing.password = Some(p.to_string());
            }
        }
        None => {
            all.push(StoredConnection {
                metadata: metadata.clone(),
                password: password.map(|p| p.to_string()),
            });
        }
    }
    save_all_stored(app_data, &all)?;
    Ok(())
}

/// Save connection metadata to the store file without changing the password.
pub async fn save_metadata(app_data: &PathBuf, metadata: &ConnectionMetadata) -> AppResult<()> {
    save_connection(app_data, metadata, None).await
}

/// Get a single connection metadata by ID.
pub async fn get_metadata(
    app_data: &PathBuf,
    connection_id: &str,
) -> AppResult<Option<ConnectionMetadata>> {
    let all = load_all(app_data)?;
    Ok(all.into_iter().find(|c| c.id == connection_id))
}

/// List all connection metadata.
pub async fn list_metadata(app_data: &PathBuf) -> AppResult<Vec<ConnectionMetadata>> {
    load_all(app_data)
}

/// Get the stored password for a connection, if present.
pub async fn get_password(app_data: &PathBuf, connection_id: &str) -> AppResult<Option<String>> {
    let all = load_all_stored(app_data)?;
    Ok(all
        .into_iter()
        .find(|c| c.metadata.id == connection_id)
        .and_then(|c| c.password))
}

/// Delete a connection metadata by ID.
pub async fn delete_metadata(app_data: &PathBuf, connection_id: &str) -> AppResult<()> {
    let mut all = load_all_stored(app_data)?;
    all.retain(|c| c.metadata.id != connection_id);
    save_all_stored(app_data, &all)?;
    Ok(())
}

/// Filter connections by various criteria.
///
/// # Arguments
/// * `connections` - The connections to filter
/// * `search` - Optional search string (matches name, host, type)
/// * `connection_type` - Optional type filter
/// * `tags` - Optional set of tags to filter by
/// * `favorites_only` - If true, only return favorite connections
pub fn filter_connections(
    connections: Vec<ConnectionMetadata>,
    search: Option<&str>,
    connection_type: Option<&ConnectionType>,
    tags: Option<&std::collections::HashSet<String>>,
    favorites_only: bool,
) -> Vec<ConnectionMetadata> {
    connections
        .into_iter()
        .filter(|conn| {
            // Search filter
            if let Some(search) = search {
                let search_lower = search.to_lowercase();
                let name_match = conn.name.to_lowercase().contains(&search_lower);
                let host_match = conn.host.to_lowercase().contains(&search_lower);
                let type_match = conn.r#type.to_string().to_lowercase().contains(&search_lower);

                if !(name_match || host_match || type_match) {
                    return false;
                }
            }

            // Type filter
            if let Some(ref filter_type) = connection_type {
                if conn.r#type != **filter_type {
                    return false;
                }
            }

            // Tags filter
            if let Some(ref filter_tags) = tags {
                if filter_tags.is_empty() {
                    return false;
                }
                let has_any_tag = conn.tags.iter().any(|tag| filter_tags.contains(tag));
                if !has_any_tag {
                    return false;
                }
            }

            // Favorites filter
            if favorites_only && !conn.favorite {
                return false;
            }

            true
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn test_data() -> PathBuf {
        PathBuf::from(std::env::temp_dir()).join("pinnacle-test-store")
    }

    fn clean_test_data() {
        let path = test_data();
        let _ = std::fs::remove_dir_all(&path);
    }

    #[tokio::test]
    async fn test_store_operations() {
        clean_test_data();
        let data = test_data();

        let metadata = ConnectionMetadata::new(
            "test-id-123".to_string(),
            "Test Connection".to_string(),
            ConnectionType::Postgresql,
            "localhost".to_string(),
            5432,
            "testuser".to_string(),
            "testdb".to_string(),
            false,
        );

        // Save without password
        save_connection(&data, &metadata, None).await.unwrap();

        // Get
        let retrieved = get_metadata(&data, "test-id-123").await.unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().name, "Test Connection");

        // Password should be absent initially
        assert!(get_password(&data, "test-id-123").await.unwrap().is_none());

        // Save with password
        save_connection(&data, &metadata, Some("secret")).await.unwrap();
        assert_eq!(
            get_password(&data, "test-id-123").await.unwrap().as_deref(),
            Some("secret")
        );

        // List
        let all = list_metadata(&data).await.unwrap();
        assert!(all.len() >= 1);

        // Delete
        delete_metadata(&data, "test-id-123").await.unwrap();

        // Should be gone
        let retrieved = get_metadata(&data, "test-id-123").await.unwrap();
        assert!(retrieved.is_none());

        clean_test_data();
    }
}
