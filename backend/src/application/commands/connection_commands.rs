//! Tauri command handlers for connection management.
//!
//! These commands handle:
//! - Saving connection metadata and passwords
//! - Retrieving connection lists
//! - Getting connection passwords (for use by other connectors)
//! - Deleting connections

use std::collections::HashSet;
use std::path::PathBuf;

use tauri::Manager;

use crate::{
    core::error::AppError,
    core::result::AppResult,
    domain::connection::{
        ConnectionListResponse, ConnectionMetadata, ConnectionResponse, ConnectionType,
        DeleteConnectionRequest, GetPasswordRequest, GetPasswordResponse, SaveConnectionRequest,
    },
    infrastructure::connectors::{keyring, store},
};

fn app_data(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    app.path()
        .app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))
}

/// Save a connection (metadata + password)
///
/// Passwords are persisted in the local store first. Saving to the OS keyring is
/// attempted as a secondary store so existing keyring-backed connections keep working,
/// but a keyring failure no longer prevents the connection from being saved.
#[tauri::command]
pub async fn save_connection(
    app: tauri::AppHandle,
    request: SaveConnectionRequest,
) -> AppResult<ConnectionResponse> {
    let data = app_data(&app)?;
    store::save_connection_with_secrets(
        &data,
        &request.metadata,
        request.password.as_deref(),
        request.ssh_password.as_deref(),
        request.key_passphrase.as_deref(),
    )
    .await?;

    // Keep keyring as secondary store for migrated entries; ignore errors.
    if let Some(password) = &request.password {
        let _ = keyring::save_password(&request.metadata.id, password).await;
    }
    if let Some(ssh_password) = &request.ssh_password {
        let _ = keyring::save_ssh_password(&request.metadata.id, ssh_password).await;
    }
    if let Some(key_passphrase) = &request.key_passphrase {
        let _ = keyring::save_key_passphrase(&request.metadata.id, key_passphrase).await;
    }

    Ok(request.metadata.into())
}

/// List all connections
#[tauri::command]
pub async fn list_connections(
    app: tauri::AppHandle,
    search: Option<String>,
    connection_type: Option<String>,
    tags: Option<Vec<String>>,
    favorites_only: Option<bool>,
) -> AppResult<ConnectionListResponse> {
    let data = app_data(&app)?;
    let all_metadata = store::list_metadata(&data).await?;

    let connection_type_filter: Option<ConnectionType> = connection_type
        .as_ref()
        .and_then(|t| t.parse().ok());

    let tags_filter: Option<HashSet<String>> = tags.map(|t| t.into_iter().collect());

    let filtered = store::filter_connections(
        all_metadata,
        search.as_deref(),
        connection_type_filter.as_ref(),
        tags_filter.as_ref(),
        favorites_only.unwrap_or(false),
    );

    let mut connections: Vec<ConnectionResponse> = Vec::with_capacity(filtered.len());
    for metadata in filtered {
        let mut response: ConnectionResponse = metadata.into();
        let has_password_in_store = store::get_password(&data, &response.metadata.id)
            .await?
            .is_some();
        let has_password_in_keyring = keyring::has_password(&response.metadata.id)
            .await
            .unwrap_or(false);
        if has_password_in_store || has_password_in_keyring {
            response.password_ref = format!("keyring://{}", response.metadata.id);
        }
        connections.push(response);
    }

    Ok(ConnectionListResponse { connections })
}

/// Get a connection password from the store or keyring.
#[tauri::command]
pub async fn get_connection_password(
    app: tauri::AppHandle,
    request: GetPasswordRequest,
) -> AppResult<GetPasswordResponse> {
    let data = app_data(&app)?;

    // Prefer the local store; fall back to the keyring.
    let password = match store::get_password(&data, &request.connection_id).await? {
        Some(p) => p,
        None => keyring::get_password(&request.connection_id)
            .await?
            .unwrap_or_default(),
    };

    Ok(GetPasswordResponse {
        connection_id: request.connection_id,
        password,
    })
}

/// Get the SSH password for a connection from the store or keyring.
#[tauri::command]
pub async fn get_ssh_password(
    app: tauri::AppHandle,
    request: GetPasswordRequest,
) -> AppResult<GetPasswordResponse> {
    let data = app_data(&app)?;
    let password = match store::get_ssh_password(&data, &request.connection_id).await? {
        Some(p) => p,
        None => keyring::get_ssh_password(&request.connection_id)
            .await?
            .unwrap_or_default(),
    };
    Ok(GetPasswordResponse {
        connection_id: request.connection_id,
        password,
    })
}

/// Get the private-key passphrase for a connection from the store or keyring.
#[tauri::command]
pub async fn get_key_passphrase(
    app: tauri::AppHandle,
    request: GetPasswordRequest,
) -> AppResult<GetPasswordResponse> {
    let data = app_data(&app)?;
    let password = match store::get_key_passphrase(&data, &request.connection_id).await? {
        Some(p) => p,
        None => keyring::get_key_passphrase(&request.connection_id)
            .await?
            .unwrap_or_default(),
    };
    Ok(GetPasswordResponse {
        connection_id: request.connection_id,
        password,
    })
}

/// Delete a connection (metadata + password).
#[tauri::command]
pub async fn delete_connection(
    app: tauri::AppHandle,
    request: DeleteConnectionRequest,
) -> AppResult<()> {
    let data = app_data(&app)?;
    let _ = keyring::delete_password(&request.connection_id).await;
    let _ = keyring::delete_ssh_password(&request.connection_id).await;
    let _ = keyring::delete_key_passphrase(&request.connection_id).await;
    store::delete_metadata(&data, &request.connection_id).await?;
    Ok(())
}

/// Check if a connection has a password stored.
#[tauri::command]
pub async fn has_connection_password(
    app: tauri::AppHandle,
    connection_id: String,
) -> AppResult<bool> {
    let data = app_data(&app)?;
    if store::get_password(&data, &connection_id).await?.is_some() {
        return Ok(true);
    }
    keyring::has_password(&connection_id).await
}

/// Update connection metadata (without changing password).
#[tauri::command]
pub async fn update_connection(
    app: tauri::AppHandle,
    metadata: ConnectionMetadata,
) -> AppResult<ConnectionResponse> {
    let data = app_data(&app)?;
    store::save_metadata(&data, &metadata).await?;
    Ok(metadata.into())
}

/// Get a single connection by ID.
#[tauri::command]
pub async fn get_connection(
    app: tauri::AppHandle,
    connection_id: String,
) -> AppResult<Option<ConnectionResponse>> {
    let data = app_data(&app)?;
    let metadata = store::get_metadata(&data, &connection_id).await?;

    match metadata {
        Some(m) => {
            let mut response: ConnectionResponse = m.into();
            let has_password_in_store = store::get_password(&data, &response.metadata.id)
                .await?
                .is_some();
            let has_password_in_keyring = keyring::has_password(&response.metadata.id)
                .await
                .unwrap_or(false);
            if has_password_in_store || has_password_in_keyring {
                response.password_ref = format!("keyring://{}", response.metadata.id);
            }
            Ok(Some(response))
        }
        None => Ok(None),
    }
}
