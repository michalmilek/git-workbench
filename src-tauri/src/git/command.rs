use std::{path::Path, process::Command};

use serde::Serialize;

use crate::operation_error::OperationError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitOperationResult {
    pub command: String,
    pub stdout: String,
    pub stderr: String,
}

pub fn run_git(
    repository_path: &Path,
    args: &[String],
) -> Result<GitOperationResult, OperationError> {
    let command = command_text(args);
    let output = Command::new("git")
        .args(args)
        .current_dir(repository_path)
        .output()
        .map_err(|error| {
            OperationError::command("failed to run git", command.clone(), error.to_string())
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

    if !output.status.success() {
        return Err(OperationError::command(
            "git command failed",
            command,
            stderr,
        ));
    }

    Ok(GitOperationResult {
        command,
        stdout,
        stderr,
    })
}

fn command_text(args: &[String]) -> String {
    let mut command = String::from("git");
    if !args.is_empty() {
        command.push(' ');
        command.push_str(&args.join(" "));
    }
    command
}
