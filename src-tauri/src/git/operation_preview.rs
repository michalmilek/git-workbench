use std::{collections::BTreeSet, path::Path};

use serde::Serialize;

use crate::{git::command::run_git, operation_error::OperationError};

const RECORD_SEPARATOR: char = '\x1e';
const PREVIEW_LOG_FORMAT: &str = "%H%x00%h%x00%s%x00%an%x00%ae%x00%aI%x1e";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationPreview {
    pub kind: OperationPreviewKind,
    pub source_branch: String,
    pub target_branch: String,
    pub command: String,
    pub message: String,
    pub commits: Vec<OperationPreviewCommit>,
    pub changed_files: Vec<String>,
    pub likely_conflict_files: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationPreviewCommit {
    pub oid: String,
    pub short_oid: String,
    pub subject: String,
    pub author_name: String,
    pub author_email: String,
    pub authored_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OperationPreviewKind {
    Merge,
    Rebase,
    Pull,
    Push,
}

/// Previews merging a source branch into the current branch without modifying the repository.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed, exits unsuccessfully, or returns
/// malformed preview commit output.
pub fn preview_merge(
    repository_path: &Path,
    source_branch: &str,
) -> Result<OperationPreview, OperationError> {
    let target_branch = current_branch(repository_path)?;
    let base_oid = merge_base(repository_path, &target_branch, source_branch)?;
    let changed_files = changed_files_since(repository_path, &base_oid, source_branch)?;
    let target_files = changed_files_since(repository_path, &base_oid, &target_branch)?;
    let commits = preview_commits(repository_path, &base_oid, source_branch)?;

    Ok(OperationPreview {
        kind: OperationPreviewKind::Merge,
        source_branch: source_branch.to_owned(),
        target_branch: target_branch.clone(),
        command: format!("git merge {source_branch}"),
        message: format!("Preview merge from {source_branch} into {target_branch}."),
        likely_conflict_files: intersect_file_lists(&changed_files, &target_files),
        commits,
        changed_files,
    })
}

/// Previews rebasing the current branch onto a target branch without modifying the repository.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed, exits unsuccessfully, or returns
/// malformed preview commit output.
pub fn preview_rebase(
    repository_path: &Path,
    target_branch: &str,
) -> Result<OperationPreview, OperationError> {
    let source_branch = current_branch(repository_path)?;
    let base_oid = merge_base(repository_path, &source_branch, target_branch)?;
    let changed_files = changed_files_since(repository_path, &base_oid, &source_branch)?;
    let target_files = changed_files_since(repository_path, &base_oid, target_branch)?;
    let commits = preview_commits(repository_path, &base_oid, &source_branch)?;

    Ok(OperationPreview {
        kind: OperationPreviewKind::Rebase,
        source_branch: source_branch.clone(),
        target_branch: target_branch.to_owned(),
        command: format!("git rebase {target_branch}"),
        message: format!("Preview rebase from {source_branch} onto {target_branch}."),
        likely_conflict_files: intersect_file_lists(&changed_files, &target_files),
        commits,
        changed_files,
    })
}

/// Previews pulling the configured upstream into the current branch without modifying the
/// repository.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed, exits unsuccessfully, or returns
/// malformed preview commit output.
pub fn preview_pull(repository_path: &Path) -> Result<OperationPreview, OperationError> {
    let target_branch = current_branch(repository_path)?;
    let source_branch = upstream_branch(repository_path)?;
    let base_oid = merge_base(repository_path, &target_branch, &source_branch)?;
    let changed_files = changed_files_since(repository_path, &base_oid, &source_branch)?;
    let target_files = changed_files_since(repository_path, &base_oid, &target_branch)?;
    let commits = preview_commits(repository_path, &base_oid, &source_branch)?;

    Ok(OperationPreview {
        kind: OperationPreviewKind::Pull,
        source_branch: source_branch.clone(),
        target_branch: target_branch.clone(),
        command: String::from("git pull"),
        message: format!("Preview pull from {source_branch} into {target_branch}."),
        likely_conflict_files: intersect_file_lists(&changed_files, &target_files),
        commits,
        changed_files,
    })
}

/// Previews pushing the current branch to its configured upstream without modifying the repository.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed, exits unsuccessfully, or returns
/// malformed preview commit output.
pub fn preview_push(repository_path: &Path) -> Result<OperationPreview, OperationError> {
    let source_branch = current_branch(repository_path)?;
    let target_branch = upstream_branch(repository_path)?;
    let base_oid = merge_base(repository_path, &source_branch, &target_branch)?;
    let changed_files = changed_files_since(repository_path, &base_oid, &source_branch)?;
    let commits = preview_commits(repository_path, &base_oid, &source_branch)?;

    Ok(OperationPreview {
        kind: OperationPreviewKind::Push,
        source_branch: source_branch.clone(),
        target_branch: target_branch.clone(),
        command: String::from("git push"),
        message: format!("Preview push from {source_branch} to {target_branch}."),
        likely_conflict_files: Vec::new(),
        commits,
        changed_files,
    })
}

fn current_branch(repository_path: &Path) -> Result<String, OperationError> {
    let args = vec![
        String::from("rev-parse"),
        String::from("--abbrev-ref"),
        String::from("HEAD"),
    ];
    let output = run_git(repository_path, &args)?;
    Ok(output.stdout.trim().to_owned())
}

fn upstream_branch(repository_path: &Path) -> Result<String, OperationError> {
    let args = vec![
        String::from("rev-parse"),
        String::from("--abbrev-ref"),
        String::from("--symbolic-full-name"),
        String::from("@{upstream}"),
    ];
    let output = run_git(repository_path, &args)?;
    Ok(output.stdout.trim().to_owned())
}

fn merge_base(
    repository_path: &Path,
    left_branch: &str,
    right_branch: &str,
) -> Result<String, OperationError> {
    let args = vec![
        String::from("merge-base"),
        left_branch.to_owned(),
        right_branch.to_owned(),
    ];
    let output = run_git(repository_path, &args)?;
    Ok(output.stdout.trim().to_owned())
}

fn preview_commits(
    repository_path: &Path,
    base_oid: &str,
    branch_name: &str,
) -> Result<Vec<OperationPreviewCommit>, OperationError> {
    let args = vec![
        String::from("log"),
        String::from("--date=iso-strict"),
        format!("--pretty=format:{PREVIEW_LOG_FORMAT}"),
        format!("{base_oid}..{branch_name}"),
    ];
    let output = run_git(repository_path, &args)?;
    parse_preview_log_output(&output.stdout)
}

fn changed_files_since(
    repository_path: &Path,
    base_oid: &str,
    branch_name: &str,
) -> Result<Vec<String>, OperationError> {
    let args = vec![
        String::from("diff"),
        String::from("--name-only"),
        base_oid.to_owned(),
        branch_name.to_owned(),
    ];
    let output = run_git(repository_path, &args)?;
    Ok(parse_file_list_output(&output.stdout))
}

fn parse_preview_log_output(output: &str) -> Result<Vec<OperationPreviewCommit>, OperationError> {
    output
        .split_terminator(RECORD_SEPARATOR)
        .map(|record| record.trim_start_matches('\n'))
        .filter(|record| !record.is_empty())
        .map(parse_preview_log_record)
        .collect()
}

fn parse_preview_log_record(record: &str) -> Result<OperationPreviewCommit, OperationError> {
    let fields = record.split('\0').collect::<Vec<_>>();
    let [
        oid,
        short_oid,
        subject,
        author_name,
        author_email,
        authored_at,
    ] = fields.as_slice()
    else {
        return Err(OperationError::parse(
            "invalid operation preview commit record",
        ));
    };

    Ok(OperationPreviewCommit {
        oid: (*oid).to_owned(),
        short_oid: (*short_oid).to_owned(),
        subject: (*subject).to_owned(),
        author_name: (*author_name).to_owned(),
        author_email: (*author_email).to_owned(),
        authored_at: (*authored_at).to_owned(),
    })
}

fn parse_file_list_output(output: &str) -> Vec<String> {
    output
        .lines()
        .filter(|path| !path.is_empty())
        .map(str::to_owned)
        .collect()
}

fn intersect_file_lists(left_files: &[String], right_files: &[String]) -> Vec<String> {
    let right_file_set = right_files.iter().collect::<BTreeSet<_>>();
    left_files
        .iter()
        .filter(|file| right_file_set.contains(file))
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use std::{error::Error, fs, path::Path, process::Command};

    use serde_json::json;

    use super::{
        OperationPreview, OperationPreviewCommit, OperationPreviewKind, parse_file_list_output,
        parse_preview_log_output, preview_merge, preview_pull, preview_push, preview_rebase,
    };

    #[test]
    fn serializes_preview_dtos_as_camel_case() -> Result<(), Box<dyn Error>> {
        let preview = OperationPreview {
            kind: OperationPreviewKind::Merge,
            source_branch: String::from("feature/preview"),
            target_branch: String::from("main"),
            command: String::from("git merge feature/preview"),
            message: String::from("Preview merge from feature/preview into main."),
            commits: vec![OperationPreviewCommit {
                oid: String::from("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
                short_oid: String::from("aaaaaaa"),
                subject: String::from("Add preview"),
                author_name: String::from("Ada Lovelace"),
                author_email: String::from("ada@example.test"),
                authored_at: String::from("2026-05-16T08:30:00+02:00"),
            }],
            changed_files: vec![String::from("src/main.rs")],
            likely_conflict_files: vec![String::from("README.md")],
        };

        assert_eq!(
            serde_json::to_value(preview)?,
            json!({
                "kind": "merge",
                "sourceBranch": "feature/preview",
                "targetBranch": "main",
                "command": "git merge feature/preview",
                "message": "Preview merge from feature/preview into main.",
                "commits": [
                    {
                        "oid": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                        "shortOid": "aaaaaaa",
                        "subject": "Add preview",
                        "authorName": "Ada Lovelace",
                        "authorEmail": "ada@example.test",
                        "authoredAt": "2026-05-16T08:30:00+02:00"
                    }
                ],
                "changedFiles": ["src/main.rs"],
                "likelyConflictFiles": ["README.md"]
            })
        );

        Ok(())
    }

    #[test]
    fn serializes_pull_and_push_preview_kinds() -> Result<(), Box<dyn Error>> {
        assert_eq!(
            serde_json::to_value(OperationPreviewKind::Pull)?,
            json!("pull")
        );
        assert_eq!(
            serde_json::to_value(OperationPreviewKind::Push)?,
            json!("push")
        );

        Ok(())
    }

    #[test]
    fn parses_preview_log_records() -> Result<(), Box<dyn Error>> {
        let output = "\
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\0aaaaaaa\0Add preview panel\0Ada Lovelace\0ada@example.test\x002026-05-16T08:30:00+02:00\x1e
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\0bbbbbbb\0Refine preview panel\0Grace Hopper\0grace@example.test\x002026-05-16T08:45:00+02:00\x1e";

        let commits = parse_preview_log_output(output)?;

        assert_eq!(
            commits,
            vec![
                OperationPreviewCommit {
                    oid: String::from("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
                    short_oid: String::from("aaaaaaa"),
                    subject: String::from("Add preview panel"),
                    author_name: String::from("Ada Lovelace"),
                    author_email: String::from("ada@example.test"),
                    authored_at: String::from("2026-05-16T08:30:00+02:00"),
                },
                OperationPreviewCommit {
                    oid: String::from("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
                    short_oid: String::from("bbbbbbb"),
                    subject: String::from("Refine preview panel"),
                    author_name: String::from("Grace Hopper"),
                    author_email: String::from("grace@example.test"),
                    authored_at: String::from("2026-05-16T08:45:00+02:00"),
                },
            ]
        );

        Ok(())
    }

    #[test]
    fn parses_changed_file_output() {
        assert_eq!(
            parse_file_list_output("src/main.rs\nREADME.md\n\n"),
            vec![String::from("src/main.rs"), String::from("README.md")]
        );
    }

    #[test]
    fn previews_merge_without_changing_repository() -> Result<(), Box<dyn Error>> {
        let repository_path = create_preview_repository("merge-preview")?;

        let preview = preview_merge(&repository_path, "feature/operation")?;

        assert_eq!(preview.kind, OperationPreviewKind::Merge);
        assert_eq!(preview.source_branch, "feature/operation");
        assert_eq!(preview.target_branch, "main");
        assert_eq!(preview.command, "git merge feature/operation");
        assert_eq!(
            preview.message,
            "Preview merge from feature/operation into main."
        );
        assert_eq!(preview.commits.len(), 1);
        assert_eq!(preview.commits[0].subject, "Add operation preview");
        assert_eq!(
            preview.changed_files,
            vec![String::from("feature.txt"), String::from("shared.txt")]
        );
        assert_eq!(
            preview.likely_conflict_files,
            vec![String::from("shared.txt")]
        );
        assert_eq!(
            git_output(&repository_path, ["rev-parse", "--abbrev-ref", "HEAD"])?.trim(),
            "main"
        );

        fs::remove_dir_all(repository_path)?;

        Ok(())
    }

    #[test]
    fn previews_rebase_without_changing_repository() -> Result<(), Box<dyn Error>> {
        let repository_path = create_preview_repository("rebase-preview")?;
        run_git_command(&repository_path, ["checkout", "feature/operation"])?;

        let preview = preview_rebase(&repository_path, "main")?;

        assert_eq!(preview.kind, OperationPreviewKind::Rebase);
        assert_eq!(preview.source_branch, "feature/operation");
        assert_eq!(preview.target_branch, "main");
        assert_eq!(preview.command, "git rebase main");
        assert_eq!(
            preview.message,
            "Preview rebase from feature/operation onto main."
        );
        assert_eq!(preview.commits.len(), 1);
        assert_eq!(preview.commits[0].subject, "Add operation preview");
        assert_eq!(
            preview.changed_files,
            vec![String::from("feature.txt"), String::from("shared.txt")]
        );
        assert_eq!(
            preview.likely_conflict_files,
            vec![String::from("shared.txt")]
        );
        assert_eq!(
            git_output(&repository_path, ["rev-parse", "--abbrev-ref", "HEAD"])?.trim(),
            "feature/operation"
        );

        fs::remove_dir_all(repository_path)?;

        Ok(())
    }

    #[test]
    fn previews_pull_from_upstream_without_changing_repository() -> Result<(), Box<dyn Error>> {
        let repository_path = create_pull_preview_repository("pull-preview")?;
        let starting_head = git_output(&repository_path, ["rev-parse", "HEAD"])?;

        let preview = preview_pull(&repository_path)?;

        assert_eq!(preview.kind, OperationPreviewKind::Pull);
        assert_eq!(preview.source_branch, "upstream/main");
        assert_eq!(preview.target_branch, "main");
        assert_eq!(preview.command, "git pull");
        assert_eq!(
            preview.message,
            "Preview pull from upstream/main into main."
        );
        assert_eq!(preview.commits.len(), 1);
        assert_eq!(preview.commits[0].subject, "Add upstream changes");
        assert_eq!(
            preview.changed_files,
            vec![String::from("incoming.txt"), String::from("shared.txt")]
        );
        assert_eq!(
            preview.likely_conflict_files,
            vec![String::from("shared.txt")]
        );
        assert_eq!(
            git_output(&repository_path, ["rev-parse", "--abbrev-ref", "HEAD"])?.trim(),
            "main"
        );
        assert_eq!(
            git_output(&repository_path, ["rev-parse", "HEAD"])?,
            starting_head
        );

        fs::remove_dir_all(repository_path)?;

        Ok(())
    }

    #[test]
    fn previews_push_to_upstream_without_changing_repository() -> Result<(), Box<dyn Error>> {
        let repository_path = create_push_preview_repository("push-preview")?;
        let starting_head = git_output(&repository_path, ["rev-parse", "HEAD"])?;

        let preview = preview_push(&repository_path)?;

        assert_eq!(preview.kind, OperationPreviewKind::Push);
        assert_eq!(preview.source_branch, "main");
        assert_eq!(preview.target_branch, "upstream/main");
        assert_eq!(preview.command, "git push");
        assert_eq!(preview.message, "Preview push from main to upstream/main.");
        assert_eq!(preview.commits.len(), 1);
        assert_eq!(preview.commits[0].subject, "Add local changes");
        assert_eq!(
            preview.changed_files,
            vec![String::from("outgoing.txt"), String::from("shared.txt")]
        );
        assert!(preview.likely_conflict_files.is_empty());
        assert_eq!(
            git_output(&repository_path, ["rev-parse", "--abbrev-ref", "HEAD"])?.trim(),
            "main"
        );
        assert_eq!(
            git_output(&repository_path, ["rev-parse", "HEAD"])?,
            starting_head
        );

        fs::remove_dir_all(repository_path)?;

        Ok(())
    }

    #[test]
    fn previews_push_to_remote_tracking_upstream() -> Result<(), Box<dyn Error>> {
        let repository_path =
            create_remote_tracking_push_preview_repository("remote-push-preview")?;

        let preview = preview_push(&repository_path)?;

        assert_eq!(preview.kind, OperationPreviewKind::Push);
        assert_eq!(preview.source_branch, "main");
        assert_eq!(preview.target_branch, "origin/main");
        assert_eq!(preview.command, "git push");
        assert_eq!(preview.message, "Preview push from main to origin/main.");
        assert_eq!(preview.commits.len(), 1);
        assert_eq!(preview.commits[0].subject, "Add local remote changes");
        assert_eq!(
            preview.changed_files,
            vec![String::from("remote-local.txt")]
        );
        assert!(preview.likely_conflict_files.is_empty());

        fs::remove_dir_all(repository_path)?;

        Ok(())
    }

    fn create_preview_repository(name: &str) -> Result<std::path::PathBuf, Box<dyn Error>> {
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
        fs::write(repository_path.join("shared.txt"), "base\n")?;
        run_git_command(&repository_path, ["add", "README.md", "shared.txt"])?;
        run_git_command(&repository_path, ["commit", "-m", "Initial import"])?;

        run_git_command(&repository_path, ["checkout", "-b", "feature/operation"])?;
        fs::write(repository_path.join("feature.txt"), "feature\n")?;
        fs::write(repository_path.join("shared.txt"), "feature\n")?;
        run_git_command(&repository_path, ["add", "feature.txt", "shared.txt"])?;
        run_git_command(&repository_path, ["commit", "-m", "Add operation preview"])?;

        run_git_command(&repository_path, ["checkout", "main"])?;
        fs::write(repository_path.join("main.txt"), "main\n")?;
        fs::write(repository_path.join("shared.txt"), "main\n")?;
        run_git_command(&repository_path, ["add", "main.txt", "shared.txt"])?;
        run_git_command(&repository_path, ["commit", "-m", "Update main branch"])?;

        Ok(repository_path)
    }

    fn create_pull_preview_repository(name: &str) -> Result<std::path::PathBuf, Box<dyn Error>> {
        let repository_path = create_repository_with_base_commit(name)?;

        run_git_command(&repository_path, ["checkout", "-b", "upstream/main"])?;
        fs::write(repository_path.join("incoming.txt"), "incoming\n")?;
        fs::write(repository_path.join("shared.txt"), "incoming\n")?;
        run_git_command(&repository_path, ["add", "incoming.txt", "shared.txt"])?;
        run_git_command(&repository_path, ["commit", "-m", "Add upstream changes"])?;

        run_git_command(&repository_path, ["checkout", "main"])?;
        run_git_command(
            &repository_path,
            ["branch", "--set-upstream-to=upstream/main", "main"],
        )?;
        fs::write(repository_path.join("local.txt"), "local\n")?;
        fs::write(repository_path.join("shared.txt"), "local\n")?;
        run_git_command(&repository_path, ["add", "local.txt", "shared.txt"])?;
        run_git_command(&repository_path, ["commit", "-m", "Add local changes"])?;

        Ok(repository_path)
    }

    fn create_push_preview_repository(name: &str) -> Result<std::path::PathBuf, Box<dyn Error>> {
        let repository_path = create_repository_with_base_commit(name)?;

        run_git_command(&repository_path, ["branch", "upstream/main"])?;
        run_git_command(
            &repository_path,
            ["branch", "--set-upstream-to=upstream/main", "main"],
        )?;
        fs::write(repository_path.join("outgoing.txt"), "outgoing\n")?;
        fs::write(repository_path.join("shared.txt"), "outgoing\n")?;
        run_git_command(&repository_path, ["add", "outgoing.txt", "shared.txt"])?;
        run_git_command(&repository_path, ["commit", "-m", "Add local changes"])?;

        Ok(repository_path)
    }

    fn create_remote_tracking_push_preview_repository(
        name: &str,
    ) -> Result<std::path::PathBuf, Box<dyn Error>> {
        let repository_path = create_repository_with_base_commit(name)?;
        let remote_path = std::env::temp_dir().join(format!(
            "git-workbench-{name}-remote-{}",
            std::process::id()
        ));
        if remote_path.exists() {
            fs::remove_dir_all(&remote_path)?;
        }
        let remote_path_text = remote_path.to_string_lossy().into_owned();
        run_git_command(
            &repository_path,
            ["clone", "--bare", ".", remote_path_text.as_str()],
        )?;
        run_git_command(
            &repository_path,
            ["remote", "add", "origin", remote_path_text.as_str()],
        )?;
        run_git_command(&repository_path, ["fetch", "origin"])?;
        run_git_command(
            &repository_path,
            ["branch", "--set-upstream-to=origin/main", "main"],
        )?;
        fs::write(repository_path.join("remote-local.txt"), "local\n")?;
        run_git_command(&repository_path, ["add", "remote-local.txt"])?;
        run_git_command(
            &repository_path,
            ["commit", "-m", "Add local remote changes"],
        )?;

        Ok(repository_path)
    }

    fn create_repository_with_base_commit(
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
        fs::write(repository_path.join("shared.txt"), "base\n")?;
        run_git_command(&repository_path, ["add", "README.md", "shared.txt"])?;
        run_git_command(&repository_path, ["commit", "-m", "Initial import"])?;

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

    fn git_output<const N: usize>(
        repository_path: &Path,
        args: [&str; N],
    ) -> Result<String, Box<dyn Error>> {
        let output = Command::new("git")
            .args(args)
            .current_dir(repository_path)
            .output()?;
        assert!(output.status.success());
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    }
}
