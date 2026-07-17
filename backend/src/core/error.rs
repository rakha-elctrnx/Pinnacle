use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
pub enum AppError {
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("unsupported driver: {0}")]
    UnsupportedDriver(String),
    #[error("database error: {0}")]
    Database(String),
    #[error("http error: {0}")]
    Http(String),
    #[error("export error: {0}")]
    Export(String),
    #[error("io error: {0}")]
    Io(String),
    #[error("ssh error: {0}")]
    Ssh(String),
}

impl From<sqlx::Error> for AppError {
    fn from(value: sqlx::Error) -> Self {
        Self::Database(value.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(value: serde_json::Error) -> Self {
        Self::Io(value.to_string())
    }
}

impl From<russh::Error> for AppError {
    fn from(value: russh::Error) -> Self {
        Self::Ssh(value.to_string())
    }
}

impl From<russh::keys::Error> for AppError {
    fn from(value: russh::keys::Error) -> Self {
        Self::Ssh(value.to_string())
    }
}
