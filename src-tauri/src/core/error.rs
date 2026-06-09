use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("unsupported driver: {0}")]
    UnsupportedDriver(String),
    #[error("database error: {0}")]
    Database(String),
}

impl From<sqlx::Error> for AppError {
    fn from(value: sqlx::Error) -> Self {
        Self::Database(value.to_string())
    }
}
