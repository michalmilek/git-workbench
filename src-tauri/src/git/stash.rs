use std::path::Path;

use serde::Serialize;

use crate::{
    git::command::{GitOperationResult, run_git},
    operation_error::OperationError,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StashEntry {
    pub selector: String,
    pub index: u32,
    pub message: String,
}

fn parse_stash_list_output(output: &str) -> Vec<StashEntry> {
    output.lines().filter_map(parse_stash_record).collect()
}

fn parse_stash_record(record: &str) -> Option<StashEntry> {
    let (selector, message) = record.split_once('\0')?;
    let index = parse_stash_index(selector)?;

    Some(StashEntry {
        selector: selector.to_owned(),
        index,
        message: message.to_owned(),
    })
}

fn parse_stash_index(selector: &str) -> Option<u32> {
    selector
        .strip_prefix("stash@{")?
        .strip_suffix('}')?
        .parse::<u32>()
        .ok()
}

/// Lists stash entries for a repository.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
pub fn list_stashes(repository_path: &Path) -> Result<Vec<StashEntry>, OperationError> {
    let args = vec![
        String::from("stash"),
        String::from("list"),
        String::from("--format=%gd%x00%gs"),
    ];
    let output = run_git(repository_path, &args)?;
    Ok(parse_stash_list_output(&output.stdout))
}

/// Creates a stash with an optional message.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
pub fn create_stash(
    repository_path: &Path,
    message: &str,
) -> Result<GitOperationResult, OperationError> {
    let mut args = vec![String::from("stash"), String::from("push")];
    if !message.trim().is_empty() {
        args.push(String::from("-m"));
        args.push(message.to_owned());
    }
    run_git(repository_path, &args)
}

/// Applies a stash by selector.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
pub fn apply_stash(
    repository_path: &Path,
    stash_ref: &str,
) -> Result<GitOperationResult, OperationError> {
    let args = vec![
        String::from("stash"),
        String::from("apply"),
        stash_ref.to_owned(),
    ];
    run_git(repository_path, &args)
}

/// Pops a stash by selector.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
pub fn pop_stash(
    repository_path: &Path,
    stash_ref: &str,
) -> Result<GitOperationResult, OperationError> {
    let args = vec![
        String::from("stash"),
        String::from("pop"),
        stash_ref.to_owned(),
    ];
    run_git(repository_path, &args)
}

/// Drops a stash by selector.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
pub fn drop_stash(
    repository_path: &Path,
    stash_ref: &str,
) -> Result<GitOperationResult, OperationError> {
    let args = vec![
        String::from("stash"),
        String::from("drop"),
        stash_ref.to_owned(),
    ];
    run_git(repository_path, &args)
}

#[cfg(test)]
mod tests {
    use std::{error::Error, fs, path::Path, process::Command};

    use super::{
        StashEntry, apply_stash, create_stash, drop_stash, list_stashes, parse_stash_list_output,
    };

    #[test]
    fn parses_stash_list_output() {
        let output = "\
stash@{0}\0On main: work in progress
stash@{12}\0WIP on feature/workbench: 1111111 add changes
";

        let stashes = parse_stash_list_output(output);

        assert_eq!(
            stashes,
            vec![
                StashEntry {
                    selector: "stash@{0}".to_owned(),
                    index: 0,
                    message: "On main: work in progress".to_owned(),
                },
                StashEntry {
                    selector: "stash@{12}".to_owned(),
                    index: 12,
                    message: "WIP on feature/workbench: 1111111 add changes".to_owned(),
                },
            ]
        );
    }

    #[test]
    fn creates_lists_applies_and_drops_stash_in_real_repository() -> Result<(), Box<dyn Error>> {
        let repository_path = create_test_repository("stash-flow")?;
        fs::write(repository_path.join("notes.txt"), "changed\n")?;

        create_stash(&repository_path, "save changes")?;

        let stashes = list_stashes(&repository_path)?;
        assert_eq!(stashes.len(), 1);
        assert_eq!(stashes[0].selector, "stash@{0}");
        assert_eq!(stashes[0].index, 0);
        assert!(stashes[0].message.contains("save changes"));

        apply_stash(&repository_path, "stash@{0}")?;
        assert_eq!(
            fs::read_to_string(repository_path.join("notes.txt"))?,
            "changed\n"
        );

        drop_stash(&repository_path, "stash@{0}")?;
        assert!(list_stashes(&repository_path)?.is_empty());

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
        run_git_command(&repository_path, ["init", "--initial-branch=main"])?;
        run_git_command(
            &repository_path,
            ["config", "user.email", "qa@example.test"],
        )?;
        run_git_command(
            &repository_path,
            ["config", "user.name", "Git Workbench QA"],
        )?;
        fs::write(repository_path.join("notes.txt"), "base\n")?;
        run_git_command(&repository_path, ["add", "notes.txt"])?;
        run_git_command(&repository_path, ["commit", "-m", "initial"])?;
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
