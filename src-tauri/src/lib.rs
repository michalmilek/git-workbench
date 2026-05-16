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
mod provider_accounts;
mod provider_work_items;

use git::GitOperationResult;
use git::branch::BranchList;
use git::conflict::ConflictState;
use git::history::{CommitDetails, CommitSummary};
use git::operation_preview::OperationPreview;
use git::operations::FileDiff;
use git::provider::ProviderRemoteList;
use git::stash::StashEntry;
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
fn fetch_repository(
    app: tauri::AppHandle,
    repository_path: &str,
    operation_id: &str,
) -> Result<GitOperationResult, OperationError> {
    git::operations::fetch_repository_with_events(
        app,
        std::path::Path::new(repository_path),
        operation_id,
    )
}

#[tauri::command]
fn pull_repository(
    app: tauri::AppHandle,
    repository_path: &str,
    operation_id: &str,
) -> Result<GitOperationResult, OperationError> {
    git::operations::pull_repository_with_events(
        app,
        std::path::Path::new(repository_path),
        operation_id,
    )
}

#[tauri::command]
fn push_repository(
    app: tauri::AppHandle,
    repository_path: &str,
    operation_id: &str,
) -> Result<GitOperationResult, OperationError> {
    git::operations::push_repository_with_events(
        app,
        std::path::Path::new(repository_path),
        operation_id,
    )
}

#[tauri::command]
fn list_branches(repository_path: &str) -> Result<BranchList, OperationError> {
    git::branch::list_branches(std::path::Path::new(repository_path))
}

#[tauri::command]
fn list_commit_history(
    repository_path: &str,
    query: Option<String>,
) -> Result<Vec<CommitSummary>, OperationError> {
    git::history::list_commit_history(std::path::Path::new(repository_path), query)
}

#[tauri::command]
fn list_provider_remotes(repository_path: &str) -> Result<ProviderRemoteList, OperationError> {
    git::provider::list_provider_remotes(std::path::Path::new(repository_path))
}

#[tauri::command]
fn preview_merge(
    repository_path: &str,
    source_branch: &str,
) -> Result<OperationPreview, OperationError> {
    git::operation_preview::preview_merge(std::path::Path::new(repository_path), source_branch)
}

#[tauri::command]
fn preview_rebase(
    repository_path: &str,
    target_branch: &str,
) -> Result<OperationPreview, OperationError> {
    git::operation_preview::preview_rebase(std::path::Path::new(repository_path), target_branch)
}

#[tauri::command]
fn preview_pull(repository_path: &str) -> Result<OperationPreview, OperationError> {
    git::operation_preview::preview_pull(std::path::Path::new(repository_path))
}

#[tauri::command]
fn preview_push(repository_path: &str) -> Result<OperationPreview, OperationError> {
    git::operation_preview::preview_push(std::path::Path::new(repository_path))
}

#[tauri::command]
fn get_conflict_state(repository_path: &str) -> Result<ConflictState, OperationError> {
    git::conflict::read_conflict_state(std::path::Path::new(repository_path))
}

#[tauri::command]
fn run_merge(
    app: tauri::AppHandle,
    repository_path: &str,
    source_branch: &str,
    operation_id: &str,
) -> Result<GitOperationResult, OperationError> {
    git::conflict::run_merge_with_events(
        app,
        std::path::Path::new(repository_path),
        source_branch,
        operation_id,
    )
}

#[tauri::command]
fn run_rebase(
    app: tauri::AppHandle,
    repository_path: &str,
    target_branch: &str,
    operation_id: &str,
) -> Result<GitOperationResult, OperationError> {
    git::conflict::run_rebase_with_events(
        app,
        std::path::Path::new(repository_path),
        target_branch,
        operation_id,
    )
}

#[tauri::command]
fn abort_merge(
    app: tauri::AppHandle,
    repository_path: &str,
    operation_id: &str,
) -> Result<GitOperationResult, OperationError> {
    git::conflict::abort_merge_with_events(app, std::path::Path::new(repository_path), operation_id)
}

#[tauri::command]
fn abort_rebase(
    app: tauri::AppHandle,
    repository_path: &str,
    operation_id: &str,
) -> Result<GitOperationResult, OperationError> {
    git::conflict::abort_rebase_with_events(
        app,
        std::path::Path::new(repository_path),
        operation_id,
    )
}

#[tauri::command]
fn continue_rebase(
    app: tauri::AppHandle,
    repository_path: &str,
    operation_id: &str,
) -> Result<GitOperationResult, OperationError> {
    git::conflict::continue_rebase_with_events(
        app,
        std::path::Path::new(repository_path),
        operation_id,
    )
}

#[tauri::command]
fn get_commit_details(
    repository_path: &str,
    commit_oid: &str,
) -> Result<CommitDetails, OperationError> {
    git::history::get_commit_details(std::path::Path::new(repository_path), commit_oid)
}

#[tauri::command]
fn checkout_branch(
    repository_path: &str,
    branch_name: &str,
) -> Result<GitOperationResult, OperationError> {
    git::branch::checkout_branch(std::path::Path::new(repository_path), branch_name)
}

#[tauri::command]
fn create_branch(
    repository_path: &str,
    branch_name: &str,
) -> Result<GitOperationResult, OperationError> {
    git::branch::create_branch(std::path::Path::new(repository_path), branch_name)
}

#[tauri::command]
fn delete_branch(
    repository_path: &str,
    branch_name: &str,
) -> Result<GitOperationResult, OperationError> {
    git::branch::delete_branch(std::path::Path::new(repository_path), branch_name)
}

#[tauri::command]
fn list_stashes(repository_path: &str) -> Result<Vec<StashEntry>, OperationError> {
    git::stash::list_stashes(std::path::Path::new(repository_path))
}

#[tauri::command]
fn create_stash(
    repository_path: &str,
    message: &str,
) -> Result<GitOperationResult, OperationError> {
    git::stash::create_stash(std::path::Path::new(repository_path), message)
}

#[tauri::command]
fn apply_stash(
    repository_path: &str,
    stash_ref: &str,
) -> Result<GitOperationResult, OperationError> {
    git::stash::apply_stash(std::path::Path::new(repository_path), stash_ref)
}

#[tauri::command]
fn pop_stash(repository_path: &str, stash_ref: &str) -> Result<GitOperationResult, OperationError> {
    git::stash::pop_stash(std::path::Path::new(repository_path), stash_ref)
}

#[tauri::command]
fn drop_stash(
    repository_path: &str,
    stash_ref: &str,
) -> Result<GitOperationResult, OperationError> {
    git::stash::drop_stash(std::path::Path::new(repository_path), stash_ref)
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
            push_repository,
            list_branches,
            list_commit_history,
            list_provider_remotes,
            preview_merge,
            preview_rebase,
            preview_pull,
            preview_push,
            get_conflict_state,
            run_merge,
            run_rebase,
            abort_merge,
            abort_rebase,
            continue_rebase,
            get_commit_details,
            checkout_branch,
            create_branch,
            delete_branch,
            list_stashes,
            create_stash,
            apply_stash,
            pop_stash,
            drop_stash,
            provider_accounts::list_provider_accounts,
            provider_accounts::save_provider_account,
            provider_accounts::delete_provider_account,
            provider_accounts::test_provider_connection,
            provider_work_items::list_provider_work_items
        ])
        .run(tauri::generate_context!())
}
