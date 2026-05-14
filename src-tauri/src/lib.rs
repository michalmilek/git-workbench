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

use git::status::RepositoryStatus;
use operation_error::OperationError;

#[tauri::command]
fn get_repository_status(repository_path: &str) -> Result<RepositoryStatus, OperationError> {
    git::status::read_repository_status(std::path::Path::new(&repository_path))
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
        .invoke_handler(tauri::generate_handler![get_repository_status])
        .run(tauri::generate_context!())
}
