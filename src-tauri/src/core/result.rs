use crate::core::error::AppError;

pub type AppResult<T> = Result<T, AppError>;
