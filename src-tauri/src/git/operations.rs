use std::{fs, path::Path};

use serde::Serialize;

use crate::{
    git::{
        command::{GitOperationResult, run_git},
        operation_stream::run_git_with_events,
    },
    operation_error::OperationError,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub text: String,
    pub is_binary: bool,
}

/// Reads the unstaged or staged diff for one file.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
pub fn get_file_diff(
    repository_path: &Path,
    file_path: &str,
    staged: bool,
) -> Result<FileDiff, OperationError> {
    let args = diff_args(file_path, staged);
    let result = run_git(repository_path, &args)?;
    if result.stdout.is_empty() && !staged && is_untracked_file(repository_path, file_path)? {
        return render_untracked_diff(repository_path, file_path);
    }

    let is_binary = is_binary_diff(&result.stdout);

    Ok(FileDiff {
        path: file_path.to_owned(),
        text: result.stdout,
        is_binary,
    })
}

/// Stages a single file path.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
pub fn stage_file(
    repository_path: &Path,
    file_path: &str,
) -> Result<GitOperationResult, OperationError> {
    let args = stage_args(file_path);
    run_git(repository_path, &args)
}

/// Unstages a single file path.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
pub fn unstage_file(
    repository_path: &Path,
    file_path: &str,
) -> Result<GitOperationResult, OperationError> {
    let args = unstage_args(file_path);
    run_git(repository_path, &args)
}

/// Commits staged changes with the supplied message.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
pub fn commit_changes(
    repository_path: &Path,
    summary: &str,
    body: Option<String>,
    amend: bool,
) -> Result<GitOperationResult, OperationError> {
    let args = commit_args(summary, body, amend);
    run_git(repository_path, &args)
}

/// Fetches from the repository's configured remotes.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
#[allow(dead_code)]
pub fn fetch_repository(repository_path: &Path) -> Result<GitOperationResult, OperationError> {
    let args = fetch_repository_args();
    run_git(repository_path, &args)
}

/// Fetches from the repository's configured remotes and emits operation events.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
pub fn fetch_repository_with_events(
    app: tauri::AppHandle,
    repository_path: &Path,
    operation_id: &str,
) -> Result<GitOperationResult, OperationError> {
    let args = fetch_repository_args();
    run_git_with_events(app, repository_path, &args, operation_id)
}

/// Pulls from the current branch's configured upstream.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
#[allow(dead_code)]
pub fn pull_repository(repository_path: &Path) -> Result<GitOperationResult, OperationError> {
    let args = pull_repository_args();
    run_git(repository_path, &args)
}

/// Pulls from the current branch's configured upstream and emits operation events.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
pub fn pull_repository_with_events(
    app: tauri::AppHandle,
    repository_path: &Path,
    operation_id: &str,
) -> Result<GitOperationResult, OperationError> {
    let args = pull_repository_args();
    run_git_with_events(app, repository_path, &args, operation_id)
}

/// Pushes the current branch to its configured upstream.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
#[allow(dead_code)]
pub fn push_repository(repository_path: &Path) -> Result<GitOperationResult, OperationError> {
    let args = push_repository_args();
    run_git(repository_path, &args)
}

/// Pushes the current branch to its configured upstream and emits operation events.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
pub fn push_repository_with_events(
    app: tauri::AppHandle,
    repository_path: &Path,
    operation_id: &str,
) -> Result<GitOperationResult, OperationError> {
    let args = push_repository_args();
    run_git_with_events(app, repository_path, &args, operation_id)
}

fn diff_args(file_path: &str, staged: bool) -> Vec<String> {
    let mut args = vec![String::from("diff")];
    if staged {
        args.push(String::from("--cached"));
    }
    args.push(String::from("--no-ext-diff"));
    args.push(String::from("--"));
    args.push(file_path.to_owned());
    args
}

fn stage_args(file_path: &str) -> Vec<String> {
    vec![
        String::from("add"),
        String::from("--"),
        file_path.to_owned(),
    ]
}

fn unstage_args(file_path: &str) -> Vec<String> {
    vec![
        String::from("reset"),
        String::from("--"),
        file_path.to_owned(),
    ]
}

fn commit_args(summary: &str, body: Option<String>, amend: bool) -> Vec<String> {
    let mut args = vec![String::from("commit")];
    if amend {
        args.push(String::from("--amend"));
    }
    args.push(String::from("-m"));
    args.push(summary.to_owned());
    if let Some(body_text) = body.filter(|body_text| !body_text.is_empty()) {
        args.push(String::from("-m"));
        args.push(body_text);
    }
    args
}

fn fetch_repository_args() -> Vec<String> {
    vec![String::from("fetch")]
}

fn pull_repository_args() -> Vec<String> {
    vec![String::from("pull")]
}

fn push_repository_args() -> Vec<String> {
    vec![String::from("push")]
}

fn is_binary_diff(text: &str) -> bool {
    text.contains("Binary files") || text.contains("GIT binary patch")
}

fn is_untracked_file(repository_path: &Path, file_path: &str) -> Result<bool, OperationError> {
    let args = vec![
        String::from("ls-files"),
        String::from("--others"),
        String::from("--exclude-standard"),
        String::from("--"),
        file_path.to_owned(),
    ];
    let result = run_git(repository_path, &args)?;
    Ok(result.stdout.lines().any(|line| line == file_path))
}

fn render_untracked_diff(
    repository_path: &Path,
    file_path: &str,
) -> Result<FileDiff, OperationError> {
    let file_path_on_disk = repository_path.join(file_path);
    let bytes = fs::read(&file_path_on_disk).map_err(|error| {
        OperationError::command(
            "failed to read untracked file",
            format!("git diff -- {file_path}"),
            error.to_string(),
        )
    })?;
    let Ok(contents) = String::from_utf8(bytes) else {
        return Ok(FileDiff {
            path: file_path.to_owned(),
            text: String::new(),
            is_binary: true,
        });
    };

    Ok(FileDiff {
        path: file_path.to_owned(),
        text: render_untracked_text_diff(file_path, &contents),
        is_binary: false,
    })
}

fn render_untracked_text_diff(file_path: &str, contents: &str) -> String {
    let lines = contents.lines().collect::<Vec<_>>();
    let mut diff = format!(
        "diff --git a/{file_path} b/{file_path}\nnew file mode 100644\n--- /dev/null\n+++ b/{file_path}\n@@ -0,0 +1,{} @@\n",
        lines.len()
    );

    for line in lines {
        diff.push('+');
        diff.push_str(line);
        diff.push('\n');
    }

    diff
}

#[cfg(test)]
mod tests {
    use std::{error::Error, fs, path::Path, process::Command};

    use super::{
        commit_args, commit_changes, diff_args, fetch_repository_args, get_file_diff,
        is_binary_diff, pull_repository_args, push_repository_args, render_untracked_text_diff,
        stage_file, unstage_file,
    };
    use crate::git::{
        operation_stream::command_text,
        status::{GitFileStatus, read_repository_status},
    };

    #[test]
    fn builds_unstaged_diff_args() {
        assert_eq!(
            diff_args("src/main.rs", false),
            ["diff", "--no-ext-diff", "--", "src/main.rs"]
        );
    }

    #[test]
    fn builds_staged_diff_args() {
        assert_eq!(
            diff_args("src/main.rs", true),
            ["diff", "--cached", "--no-ext-diff", "--", "src/main.rs"]
        );
    }

    #[test]
    fn builds_commit_args_with_body_and_amend() {
        assert_eq!(
            commit_args(
                "Update local Git core",
                Some(String::from("Body text")),
                true
            ),
            [
                "commit",
                "--amend",
                "-m",
                "Update local Git core",
                "-m",
                "Body text"
            ]
        );
    }

    #[test]
    fn skips_empty_commit_body() {
        assert_eq!(
            commit_args("Update local Git core", Some(String::new()), false),
            ["commit", "-m", "Update local Git core"]
        );
    }

    #[test]
    fn builds_streamed_repository_operation_command_text() {
        assert_eq!(command_text(&fetch_repository_args()), "git fetch");
        assert_eq!(command_text(&pull_repository_args()), "git pull");
        assert_eq!(command_text(&push_repository_args()), "git push");
    }

    #[test]
    fn detects_binary_diff_markers() {
        assert!(is_binary_diff(
            "Binary files a/icon.png and b/icon.png differ"
        ));
        assert!(is_binary_diff(
            "diff --git a/file.bin b/file.bin\nGIT binary patch"
        ));
        assert!(!is_binary_diff("diff --git a/file.txt b/file.txt\n+text"));
    }

    #[test]
    fn renders_untracked_file_preview_as_diff() {
        assert_eq!(
            render_untracked_text_diff("notes/new file.txt", "first\nsecond\n"),
            "\
diff --git a/notes/new file.txt b/notes/new file.txt
new file mode 100644
--- /dev/null
+++ b/notes/new file.txt
@@ -0,0 +1,2 @@
+first
+second
"
        );
    }

    #[test]
    fn runs_stage_unstage_diff_and_commit_in_real_repository() -> Result<(), Box<dyn Error>> {
        let repository_path = create_test_repository("local-core-flow")?;
        fs::write(repository_path.join("notes file.txt"), "first\nsecond\n")?;

        let diff = get_file_diff(&repository_path, "notes file.txt", false)?;

        assert!(!diff.is_binary);
        assert!(diff.text.contains("+++ b/notes file.txt"));
        assert!(diff.text.contains("+first"));

        stage_file(&repository_path, "notes file.txt")?;
        let staged_status = read_repository_status(&repository_path)?;
        assert_eq!(staged_status.files.len(), 1);
        assert_eq!(staged_status.files[0].index_status, GitFileStatus::Added);

        unstage_file(&repository_path, "notes file.txt")?;
        let unstaged_status = read_repository_status(&repository_path)?;
        assert_eq!(unstaged_status.files.len(), 1);
        assert_eq!(
            unstaged_status.files[0].index_status,
            GitFileStatus::Untracked
        );

        stage_file(&repository_path, "notes file.txt")?;
        let result = commit_changes(&repository_path, "add notes", None, false)?;

        assert_eq!(result.command, "git commit -m add notes");
        assert!(read_repository_status(&repository_path)?.files.is_empty());

        fs::remove_dir_all(repository_path)?;

        Ok(())
    }

    fn create_test_repository(name: &str) -> Result<std::path::PathBuf, Box<dyn Error>> {
        let repository_path =
            std::env::temp_dir().join(format!("git-workbench-{name}-{}", std::process::id()));
        if repository_path.exists() {
            fs::remove_dir_all(&repository_path)?;
        }
        fs::create_dir_all(&repository_path)?;
        run_git_command(&repository_path, ["init"])?;
        run_git_command(
            &repository_path,
            ["config", "user.email", "qa@example.test"],
        )?;
        run_git_command(
            &repository_path,
            ["config", "user.name", "Git Workbench QA"],
        )?;
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
