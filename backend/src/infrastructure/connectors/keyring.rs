//! Keyring connector for storing and retrieving connection passwords from OS credential managers.
//!
//! Uses the `keyring` crate which provides native OS credential storage:
//! - macOS: Keychain
//! - Windows: Credential Manager (DPAPI)
//! - Linux: Secret Service API (GNOME Keyring, KWallet)

use keyring::{Entry, Error as KeyringError};

use crate::core::result::AppResult;

/// Keyring service prefix for Pinnacle connections
const KEYRING_SERVICE_PREFIX: &str = "pinnacle-connection";

/// Save a password to the OS keyring for a connection
/// 
/// # Arguments
/// * `connection_id` - Unique identifier for the connection
/// * `password` - The password to store
/// 
/// # Returns
/// `Ok(())` on success, or an error if the password could not be stored
pub async fn save_password(connection_id: &str, password: &str) -> AppResult<()> {
    let service = format!("{}={}", KEYRING_SERVICE_PREFIX, connection_id);
    let username = connection_id;

    let entry = Entry::new(&service, username)
        .map_err(|e| crate::core::error::AppError::Io(e.to_string()))?;
    entry
        .set_password(password)
        .map_err(|e| crate::core::error::AppError::Io(e.to_string()))?;

    Ok(())
}

/// Retrieve a password from the OS keyring for a connection
/// 
/// # Arguments
/// * `connection_id` - Unique identifier for the connection
/// 
/// # Returns
/// `Some(password)` if found, or `None` if not found
pub async fn get_password(connection_id: &str) -> AppResult<Option<String>> {
    let service = format!("{}={}", KEYRING_SERVICE_PREFIX, connection_id);
    let username = connection_id;

    let entry = Entry::new(&service, username)
        .map_err(|e| crate::core::error::AppError::Io(e.to_string()))?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(crate::core::error::AppError::Io(e.to_string())),
    }
}

/// Delete a password from the OS keyring for a connection
/// 
/// # Arguments
/// * `connection_id` - Unique identifier for the connection
/// 
/// # Returns
/// `Ok(())` on success, or an error if the password could not be deleted
pub async fn delete_password(connection_id: &str) -> AppResult<()> {
    let service = format!("{}={}", KEYRING_SERVICE_PREFIX, connection_id);
    let username = connection_id;

    let entry = Entry::new(&service, username)
        .map_err(|e| crate::core::error::AppError::Io(e.to_string()))?;
    entry
        .delete_credential()
        .map_err(|e| crate::core::error::AppError::Io(e.to_string()))?;

    Ok(())
}

/// Check if a password exists in the keyring for a connection
/// 
/// # Arguments
/// * `connection_id` - Unique identifier for the connection
/// 
/// # Returns
/// `true` if the password exists, `false` otherwise
pub async fn has_password(connection_id: &str) -> AppResult<bool> {
    Ok(get_password(connection_id).await?.is_some())
}
