use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[error("{message}")]
pub struct OperationError {
    pub message: String,
    pub command: Option<String>,
    pub stderr: Option<String>,
}

impl OperationError {
    #[must_use]
    pub fn parse(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            command: None,
            stderr: None,
        }
    }

    #[must_use]
    pub fn command(message: impl Into<String>, command: impl Into<String>, stderr: String) -> Self {
        Self {
            message: message.into(),
            command: Some(command.into()),
            stderr: Some(stderr),
        }
    }
}
