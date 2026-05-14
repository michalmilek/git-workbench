#![deny(unsafe_code)]
#![deny(warnings)]
#![deny(clippy::all)]
#![deny(clippy::pedantic)]
#![deny(clippy::nursery)]
#![deny(clippy::unwrap_used)]
#![deny(clippy::expect_used)]
#![deny(clippy::panic)]
#![deny(clippy::todo)]
#![deny(clippy::unimplemented)]
#![deny(clippy::dbg_macro)]
#![deny(clippy::print_stdout)]
#![deny(clippy::print_stderr)]

mod git;
mod operation_error;

use git::GitOperationResult;
use git::operations::FileDiff;
use git::status::RepositoryStatus;
use operation_error::OperationError;

#[tauri::command]
fn get_repository_status(repository_path: &str) -> Result<RepositoryStatus, OperationError> {
    git::status::read_repository_status(std::path::Path::new(repository_path))
}

#[tauri::command]
fn get_file_diff(
    repository_path: &str,
    file_path: &str,
    staged: bool,
) -> Result<FileDiff, OperationError> {
    git::operations::get_file_diff(std::path::Path::new(repository_path), file_path, staged)
}

#[tauri::command]
fn stage_file(
    repository_path: &str,
    file_path: &str,
) -> Result<GitOperationResult, OperationError> {
    git::operations::stage_file(std::path::Path::new(repository_path), file_path)
}

#[tauri::command]
fn unstage_file(
    repository_path: &str,
    file_path: &str,
) -> Result<GitOperationResult, OperationError> {
    git::operations::unstage_file(std::path::Path::new(repository_path), file_path)
}

#[tauri::command]
fn commit_changes(
    repository_path: &str,
    summary: &str,
    body: Option<String>,
    amend: bool,
) -> Result<GitOperationResult, OperationError> {
    git::operations::commit_changes(std::path::Path::new(repository_path), summary, body, amend)
}

#[tauri::command]
fn fetch_repository(repository_path: &str) -> Result<GitOperationResult, OperationError> {
    git::operations::fetch_repository(std::path::Path::new(repository_path))
}

#[tauri::command]
fn pull_repository(repository_path: &str) -> Result<GitOperationResult, OperationError> {
    git::operations::pull_repository(std::path::Path::new(repository_path))
}

#[tauri::command]
fn push_repository(repository_path: &str) -> Result<GitOperationResult, OperationError> {
    git::operations::push_repository(std::path::Path::new(repository_path))
}

/// Runs the native Tauri application.
///
/// # Errors
///
/// Returns a Tauri error when application initialization or the native event loop fails.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() -> tauri::Result<()> {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_repository_status,
            get_file_diff,
            stage_file,
            unstage_file,
            commit_changes,
            fetch_repository,
            pull_repository,
            push_repository
        ])
        .run(tauri::generate_context!())
}
