use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::{
    git::{
        command::{GitOperationResult, run_git},
        operation_stream::run_git_with_events,
        status::{GitFileStatus, read_repository_status},
    },
    operation_error::OperationError,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ConflictOperation {
    None,
    Merge,
    Rebase,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictFile {
    pub path: String,
    pub index_status: GitFileStatus,
    pub worktree_status: GitFileStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictState {
    pub operation: ConflictOperation,
    pub files: Vec<ConflictFile>,
    pub can_abort_merge: bool,
    pub can_abort_rebase: bool,
    pub can_continue_rebase: bool,
    pub message: String,
}

/// Reads the current merge or rebase conflict state for a repository.
///
/// # Errors
///
/// Returns an operation error when Git metadata or porcelain status cannot be read.
pub fn read_conflict_state(repository_path: &Path) -> Result<ConflictState, OperationError> {
    let operation = detect_conflict_operation(repository_path)?;
    let status = read_repository_status(repository_path)?;
    let files = status
        .files
        .into_iter()
        .filter(|file| file.conflict)
        .map(|file| ConflictFile {
            path: file.path,
            index_status: file.index_status,
            worktree_status: file.worktree_status,
        })
        .collect::<Vec<_>>();

    Ok(conflict_state(operation, files))
}

/// Runs `git merge` with the selected source branch.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or the merge fails.
#[cfg_attr(not(test), allow(dead_code))]
pub fn run_merge(
    repository_path: &Path,
    source_branch: &str,
) -> Result<GitOperationResult, OperationError> {
    run_git(repository_path, &merge_args(source_branch))
}

/// Runs `git merge` with the selected source branch and emits operation events.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or the merge fails.
pub fn run_merge_with_events(
    app: tauri::AppHandle,
    repository_path: &Path,
    source_branch: &str,
    operation_id: &str,
) -> Result<GitOperationResult, OperationError> {
    run_git_with_events(
        app,
        repository_path,
        &merge_args(source_branch),
        operation_id,
    )
}

/// Runs `git rebase` with the selected target branch.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or the rebase fails.
#[cfg_attr(not(test), allow(dead_code))]
pub fn run_rebase(
    repository_path: &Path,
    target_branch: &str,
) -> Result<GitOperationResult, OperationError> {
    run_git(repository_path, &rebase_args(target_branch))
}

/// Runs `git rebase` with the selected target branch and emits operation events.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or the rebase fails.
pub fn run_rebase_with_events(
    app: tauri::AppHandle,
    repository_path: &Path,
    target_branch: &str,
    operation_id: &str,
) -> Result<GitOperationResult, OperationError> {
    run_git_with_events(
        app,
        repository_path,
        &rebase_args(target_branch),
        operation_id,
    )
}

/// Aborts the active merge.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or the merge abort fails.
#[cfg_attr(not(test), allow(dead_code))]
pub fn abort_merge(repository_path: &Path) -> Result<GitOperationResult, OperationError> {
    run_git(repository_path, &abort_merge_args())
}

/// Aborts the active merge and emits operation events.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or the merge abort fails.
pub fn abort_merge_with_events(
    app: tauri::AppHandle,
    repository_path: &Path,
    operation_id: &str,
) -> Result<GitOperationResult, OperationError> {
    run_git_with_events(app, repository_path, &abort_merge_args(), operation_id)
}

/// Aborts the active rebase.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or the rebase abort fails.
#[cfg_attr(not(test), allow(dead_code))]
pub fn abort_rebase(repository_path: &Path) -> Result<GitOperationResult, OperationError> {
    run_git(repository_path, &abort_rebase_args())
}

/// Aborts the active rebase and emits operation events.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or the rebase abort fails.
pub fn abort_rebase_with_events(
    app: tauri::AppHandle,
    repository_path: &Path,
    operation_id: &str,
) -> Result<GitOperationResult, OperationError> {
    run_git_with_events(app, repository_path, &abort_rebase_args(), operation_id)
}

/// Continues the active rebase with a no-op editor.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or the rebase continue fails.
#[cfg_attr(not(test), allow(dead_code))]
pub fn continue_rebase(repository_path: &Path) -> Result<GitOperationResult, OperationError> {
    run_git(repository_path, &continue_rebase_args())
}

/// Continues the active rebase with a no-op editor and emits operation events.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or the rebase continue fails.
pub fn continue_rebase_with_events(
    app: tauri::AppHandle,
    repository_path: &Path,
    operation_id: &str,
) -> Result<GitOperationResult, OperationError> {
    run_git_with_events(app, repository_path, &continue_rebase_args(), operation_id)
}

fn detect_conflict_operation(repository_path: &Path) -> Result<ConflictOperation, OperationError> {
    let git_dir = git_dir(repository_path)?;
    if git_dir.join("rebase-merge").exists() || git_dir.join("rebase-apply").exists() {
        return Ok(ConflictOperation::Rebase);
    }
    if git_dir.join("MERGE_HEAD").exists() {
        return Ok(ConflictOperation::Merge);
    }
    Ok(ConflictOperation::None)
}

fn git_dir(repository_path: &Path) -> Result<PathBuf, OperationError> {
    let output = run_git(
        repository_path,
        &[String::from("rev-parse"), String::from("--git-dir")],
    )?;
    let git_dir = PathBuf::from(output.stdout.trim());
    if git_dir.is_absolute() {
        Ok(git_dir)
    } else {
        Ok(repository_path.join(git_dir))
    }
}

fn conflict_state(operation: ConflictOperation, files: Vec<ConflictFile>) -> ConflictState {
    ConflictState {
        operation,
        files,
        can_abort_merge: operation == ConflictOperation::Merge,
        can_abort_rebase: operation == ConflictOperation::Rebase,
        can_continue_rebase: operation == ConflictOperation::Rebase,
        message: conflict_message(operation),
    }
}

fn conflict_message(operation: ConflictOperation) -> String {
    match operation {
        ConflictOperation::None => "No merge or rebase conflict in progress.",
        ConflictOperation::Merge => "Merge conflict in progress.",
        ConflictOperation::Rebase => "Rebase conflict in progress.",
    }
    .to_owned()
}

fn merge_args(source_branch: &str) -> Vec<String> {
    vec![String::from("merge"), source_branch.to_owned()]
}

fn rebase_args(target_branch: &str) -> Vec<String> {
    vec![String::from("rebase"), target_branch.to_owned()]
}

fn abort_merge_args() -> Vec<String> {
    vec![String::from("merge"), String::from("--abort")]
}

fn abort_rebase_args() -> Vec<String> {
    vec![String::from("rebase"), String::from("--abort")]
}

fn continue_rebase_args() -> Vec<String> {
    vec![
        String::from("-c"),
        String::from("core.editor=true"),
        String::from("rebase"),
        String::from("--continue"),
    ]
}

#[cfg(test)]
mod tests {
    use std::{error::Error, fs, path::Path, process::Command};

    use serde_json::json;

    use super::{
        ConflictFile, ConflictOperation, ConflictState, abort_merge, abort_merge_args,
        abort_rebase, abort_rebase_args, continue_rebase, continue_rebase_args, merge_args,
        read_conflict_state, rebase_args, run_merge, run_rebase,
    };
    use crate::git::{operation_stream::command_text, status::GitFileStatus};

    #[test]
    fn serializes_conflict_state_dtos_as_camel_case() -> Result<(), Box<dyn Error>> {
        let state = ConflictState {
            operation: ConflictOperation::Merge,
            files: vec![ConflictFile {
                path: String::from("src/main.rs"),
                index_status: GitFileStatus::Unmerged,
                worktree_status: GitFileStatus::Unmerged,
            }],
            can_abort_merge: true,
            can_abort_rebase: false,
            can_continue_rebase: false,
            message: String::from("Merge conflict in progress."),
        };

        assert_eq!(
            serde_json::to_value(state)?,
            json!({
                "operation": "merge",
                "files": [
                    {
                        "path": "src/main.rs",
                        "indexStatus": "unmerged",
                        "worktreeStatus": "unmerged"
                    }
                ],
                "canAbortMerge": true,
                "canAbortRebase": false,
                "canContinueRebase": false,
                "message": "Merge conflict in progress."
            })
        );

        Ok(())
    }

    #[test]
    fn builds_merge_and_rebase_command_args() {
        assert_eq!(
            merge_args("feature/conflict"),
            ["merge", "feature/conflict"]
        );
        assert_eq!(rebase_args("origin/main"), ["rebase", "origin/main"]);
    }

    #[test]
    fn builds_streamed_conflict_operation_command_text() {
        assert_eq!(
            command_text(&merge_args("feature/conflict")),
            "git merge feature/conflict"
        );
        assert_eq!(
            command_text(&rebase_args("origin/main")),
            "git rebase origin/main"
        );
        assert_eq!(command_text(&abort_merge_args()), "git merge --abort");
        assert_eq!(command_text(&abort_rebase_args()), "git rebase --abort");
        assert_eq!(
            command_text(&continue_rebase_args()),
            "git -c core.editor=true rebase --continue"
        );
    }

    #[test]
    fn runs_merge_and_abort_merge_in_real_repository() -> Result<(), Box<dyn Error>> {
        let repository_path = create_conflict_repository("merge-conflict")?;

        let result = run_merge(&repository_path, "feature/conflict");
        assert!(result.is_err());

        let state = read_conflict_state(&repository_path)?;
        assert_eq!(state.operation, ConflictOperation::Merge);
        assert!(state.can_abort_merge);
        assert!(!state.can_abort_rebase);
        assert!(!state.can_continue_rebase);
        assert_eq!(state.files.len(), 1);
        assert_eq!(state.files[0].path, "shared.txt");
        assert_eq!(state.files[0].index_status, GitFileStatus::Unmerged);
        assert_eq!(state.files[0].worktree_status, GitFileStatus::Unmerged);

        let abort_result = abort_merge(&repository_path)?;
        assert_eq!(abort_result.command, "git merge --abort");
        let clean_state = read_conflict_state(&repository_path)?;
        assert_eq!(clean_state.operation, ConflictOperation::None);
        assert!(clean_state.files.is_empty());

        fs::remove_dir_all(repository_path)?;

        Ok(())
    }

    #[test]
    fn includes_add_add_conflicts_in_conflict_state() -> Result<(), Box<dyn Error>> {
        let repository_path = create_add_add_conflict_repository("add-add-conflict")?;

        let result = run_merge(&repository_path, "feature/add-same-file");
        assert!(result.is_err());

        let state = read_conflict_state(&repository_path)?;
        assert_eq!(state.operation, ConflictOperation::Merge);
        assert_eq!(state.files.len(), 1);
        assert_eq!(state.files[0].path, "same.txt");
        assert_eq!(state.files[0].index_status, GitFileStatus::Added);
        assert_eq!(state.files[0].worktree_status, GitFileStatus::Added);

        abort_merge(&repository_path)?;
        fs::remove_dir_all(repository_path)?;

        Ok(())
    }

    #[test]
    fn runs_rebase_and_abort_rebase_in_real_repository() -> Result<(), Box<dyn Error>> {
        let repository_path = create_conflict_repository("rebase-conflict")?;
        run_git_command(&repository_path, ["checkout", "feature/conflict"])?;

        let result = run_rebase(&repository_path, "main");
        assert!(result.is_err());

        let state = read_conflict_state(&repository_path)?;
        assert_eq!(state.operation, ConflictOperation::Rebase);
        assert!(!state.can_abort_merge);
        assert!(state.can_abort_rebase);
        assert!(state.can_continue_rebase);
        assert_eq!(state.files.len(), 1);
        assert_eq!(state.files[0].path, "shared.txt");
        assert_eq!(state.files[0].index_status, GitFileStatus::Unmerged);
        assert_eq!(state.files[0].worktree_status, GitFileStatus::Unmerged);

        let abort_result = abort_rebase(&repository_path)?;
        assert_eq!(abort_result.command, "git rebase --abort");
        let clean_state = read_conflict_state(&repository_path)?;
        assert_eq!(clean_state.operation, ConflictOperation::None);
        assert!(clean_state.files.is_empty());

        fs::remove_dir_all(repository_path)?;

        Ok(())
    }

    #[test]
    fn builds_continue_rebase_command() -> Result<(), Box<dyn Error>> {
        let repository_path = create_conflict_repository("continue-rebase-command")?;
        run_git_command(&repository_path, ["checkout", "feature/conflict"])?;
        let rebase_result = run_rebase(&repository_path, "main");
        assert!(rebase_result.is_err());

        let continue_error = continue_rebase(&repository_path)
            .err()
            .map(|error| error.command);
        assert_eq!(
            continue_error,
            Some(Some(String::from(
                "git -c core.editor=true rebase --continue"
            )))
        );

        abort_rebase(&repository_path)?;
        fs::remove_dir_all(repository_path)?;

        Ok(())
    }

    fn create_conflict_repository(name: &str) -> Result<std::path::PathBuf, Box<dyn Error>> {
        let repository_path =
            std::env::temp_dir().join(format!("git-workbench-{name}-{}", std::process::id()));
        if repository_path.exists() {
            fs::remove_dir_all(&repository_path)?;
        }
        fs::create_dir_all(&repository_path)?;
        run_git_command(&repository_path, ["init", "--initial-branch=main"])?;
        run_git_command(
            &repository_path,
            ["config", "user.email", "qa@example.test"],
        )?;
        run_git_command(
            &repository_path,
            ["config", "user.name", "Git Workbench QA"],
        )?;

        fs::write(repository_path.join("shared.txt"), "base\n")?;
        run_git_command(&repository_path, ["add", "shared.txt"])?;
        run_git_command(&repository_path, ["commit", "-m", "Initial import"])?;

        run_git_command(&repository_path, ["checkout", "-b", "feature/conflict"])?;
        fs::write(repository_path.join("shared.txt"), "feature\n")?;
        run_git_command(&repository_path, ["add", "shared.txt"])?;
        run_git_command(&repository_path, ["commit", "-m", "Feature change"])?;

        run_git_command(&repository_path, ["checkout", "main"])?;
        fs::write(repository_path.join("shared.txt"), "main\n")?;
        run_git_command(&repository_path, ["add", "shared.txt"])?;
        run_git_command(&repository_path, ["commit", "-m", "Main change"])?;

        Ok(repository_path)
    }

    fn create_add_add_conflict_repository(
        name: &str,
    ) -> Result<std::path::PathBuf, Box<dyn Error>> {
        let repository_path =
            std::env::temp_dir().join(format!("git-workbench-{name}-{}", std::process::id()));
        if repository_path.exists() {
            fs::remove_dir_all(&repository_path)?;
        }
        fs::create_dir_all(&repository_path)?;
        run_git_command(&repository_path, ["init", "--initial-branch=main"])?;
        run_git_command(
            &repository_path,
            ["config", "user.email", "qa@example.test"],
        )?;
        run_git_command(
            &repository_path,
            ["config", "user.name", "Git Workbench QA"],
        )?;

        fs::write(repository_path.join("README.md"), "base\n")?;
        run_git_command(&repository_path, ["add", "README.md"])?;
        run_git_command(&repository_path, ["commit", "-m", "Initial import"])?;

        run_git_command(
            &repository_path,
            ["checkout", "-b", "feature/add-same-file"],
        )?;
        fs::write(repository_path.join("same.txt"), "feature\n")?;
        run_git_command(&repository_path, ["add", "same.txt"])?;
        run_git_command(
            &repository_path,
            ["commit", "-m", "Add same file on feature"],
        )?;

        run_git_command(&repository_path, ["checkout", "main"])?;
        fs::write(repository_path.join("same.txt"), "main\n")?;
        run_git_command(&repository_path, ["add", "same.txt"])?;
        run_git_command(&repository_path, ["commit", "-m", "Add same file on main"])?;

        Ok(repository_path)
    }

    fn run_git_command<const N: usize>(
        repository_path: &Path,
        args: [&str; N],
    ) -> Result<(), Box<dyn Error>> {
        let status = Command::new("git")
            .args(args)
            .current_dir(repository_path)
            .status()?;
        assert!(status.success());
        Ok(())
    }
}
