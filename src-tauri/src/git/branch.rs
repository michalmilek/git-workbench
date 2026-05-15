use std::{path::Path, process::Command};

use serde::Serialize;

use crate::{
    git::command::{GitOperationResult, run_git},
    operation_error::OperationError,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchList {
    pub branches: Vec<BranchInfo>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub branch_type: BranchType,
    pub current: bool,
    pub upstream: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BranchType {
    Local,
    Remote,
}

fn parse_branch_list_output(local_output: &str, remote_output: &str) -> BranchList {
    let mut branches = parse_branch_output(local_output, BranchType::Local);
    branches.extend(parse_branch_output(remote_output, BranchType::Remote));
    BranchList { branches }
}

fn parse_branch_output(output: &str, branch_type: BranchType) -> Vec<BranchInfo> {
    output
        .lines()
        .filter_map(|record| parse_branch_record(record, branch_type))
        .collect()
}

fn parse_branch_record(record: &str, branch_type: BranchType) -> Option<BranchInfo> {
    let mut fields = record.split('\0');
    let name = fields.next()?.trim();
    if name.is_empty() || name.contains(" -> ") {
        return None;
    }

    let current = fields.next().map_or("", str::trim) == "*";
    let upstream = fields
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);

    Some(BranchInfo {
        name: name.to_owned(),
        branch_type,
        current,
        upstream,
    })
}

/// Lists local and remote branches for a repository.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
pub fn list_branches(repository_path: &Path) -> Result<BranchList, OperationError> {
    let local_args = vec![
        String::from("branch"),
        String::from("--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%00"),
    ];
    let remote_args = vec![
        String::from("branch"),
        String::from("--remotes"),
        String::from("--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%00"),
    ];
    let local_output = run_git(repository_path, &local_args)?;
    let remote_output = run_git(repository_path, &remote_args)?;
    Ok(parse_branch_list_output(
        &local_output.stdout,
        &remote_output.stdout,
    ))
}

/// Checks out a local or remote branch name using Git.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
pub fn checkout_branch(
    repository_path: &Path,
    branch_name: &str,
) -> Result<GitOperationResult, OperationError> {
    let args = checkout_args(repository_path, branch_name);
    run_git(repository_path, &args)
}

/// Creates a local branch.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
pub fn create_branch(
    repository_path: &Path,
    branch_name: &str,
) -> Result<GitOperationResult, OperationError> {
    let args = vec![String::from("branch"), branch_name.to_owned()];
    run_git(repository_path, &args)
}

/// Deletes a merged local branch without forcing deletion.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed or exits unsuccessfully.
pub fn delete_branch(
    repository_path: &Path,
    branch_name: &str,
) -> Result<GitOperationResult, OperationError> {
    let args = vec![
        String::from("branch"),
        String::from("-d"),
        branch_name.to_owned(),
    ];
    run_git(repository_path, &args)
}

fn checkout_args(repository_path: &Path, branch_name: &str) -> Vec<String> {
    let Some(local_tracking_name) = local_tracking_name(repository_path, branch_name) else {
        return vec![String::from("checkout"), branch_name.to_owned()];
    };

    if branch_ref_exists(repository_path, "heads", &local_tracking_name) {
        return vec![String::from("checkout"), local_tracking_name];
    }

    vec![
        String::from("checkout"),
        String::from("--track"),
        branch_name.to_owned(),
    ]
}

fn local_tracking_name(repository_path: &Path, branch_name: &str) -> Option<String> {
    if !branch_ref_exists(repository_path, "remotes", branch_name) {
        return None;
    }

    branch_name
        .split_once('/')
        .map(|(_, local_name)| local_name.to_owned())
}

fn branch_ref_exists(repository_path: &Path, ref_namespace: &str, branch_name: &str) -> bool {
    let ref_name = format!("refs/{ref_namespace}/{branch_name}");
    Command::new("git")
        .args(["show-ref", "--verify", "--quiet", ref_name.as_str()])
        .current_dir(repository_path)
        .status()
        .is_ok_and(|status| status.success())
}

#[cfg(test)]
mod tests {
    use std::{error::Error, fs, path::Path, process::Command};

    use super::{
        BranchInfo, BranchList, BranchType, checkout_branch, create_branch, delete_branch,
        list_branches, parse_branch_list_output,
    };

    #[test]
    fn parses_local_and_remote_branch_output() {
        let local_output = "\
main\0*\0origin/main\0
feature/workbench\0 \0\0
";
        let remote_output = "\
origin/HEAD -> origin/main\0 \0\0
origin/main\0 \0\0
origin/feature/workbench\0 \0\0
";

        let branches = parse_branch_list_output(local_output, remote_output);

        assert_eq!(
            branches,
            BranchList {
                branches: vec![
                    BranchInfo {
                        name: "main".to_owned(),
                        branch_type: BranchType::Local,
                        current: true,
                        upstream: Some("origin/main".to_owned()),
                    },
                    BranchInfo {
                        name: "feature/workbench".to_owned(),
                        branch_type: BranchType::Local,
                        current: false,
                        upstream: None,
                    },
                    BranchInfo {
                        name: "origin/main".to_owned(),
                        branch_type: BranchType::Remote,
                        current: false,
                        upstream: None,
                    },
                    BranchInfo {
                        name: "origin/feature/workbench".to_owned(),
                        branch_type: BranchType::Remote,
                        current: false,
                        upstream: None,
                    },
                ],
            }
        );
    }

    #[test]
    fn creates_lists_checks_out_and_deletes_branch_in_real_repository() -> Result<(), Box<dyn Error>>
    {
        let repository_path = create_test_repository("branch-flow")?;

        create_branch(&repository_path, "feature/workbench")?;

        let branches = list_branches(&repository_path)?;
        assert!(branches.branches.iter().any(|branch| {
            branch.name == "main"
                && branch.branch_type == BranchType::Local
                && branch.current
                && branch.upstream.is_none()
        }));
        assert!(branches.branches.iter().any(|branch| {
            branch.name == "feature/workbench"
                && branch.branch_type == BranchType::Local
                && !branch.current
                && branch.upstream.is_none()
        }));

        checkout_branch(&repository_path, "feature/workbench")?;
        let checked_out = list_branches(&repository_path)?;
        assert!(checked_out.branches.iter().any(|branch| {
            branch.name == "feature/workbench"
                && branch.branch_type == BranchType::Local
                && branch.current
        }));

        checkout_branch(&repository_path, "main")?;
        delete_branch(&repository_path, "feature/workbench")?;
        let after_delete = list_branches(&repository_path)?;
        assert!(
            !after_delete
                .branches
                .iter()
                .any(|branch| branch.name == "feature/workbench")
        );

        fs::remove_dir_all(repository_path)?;

        Ok(())
    }

    #[test]
    fn checks_out_remote_branch_as_local_tracking_branch() -> Result<(), Box<dyn Error>> {
        let repository_path = create_test_repository("remote-branch-flow")?;
        let remote_path = create_bare_repository("remote-branch-flow")?;
        let remote_url = remote_path.to_string_lossy().into_owned();

        run_git_command(
            &repository_path,
            ["remote", "add", "origin", remote_url.as_str()],
        )?;
        run_git_command(&repository_path, ["push", "-u", "origin", "main"])?;
        create_branch(&repository_path, "feature/remote")?;
        checkout_branch(&repository_path, "feature/remote")?;
        run_git_command(&repository_path, ["push", "-u", "origin", "feature/remote"])?;
        checkout_branch(&repository_path, "main")?;
        delete_branch(&repository_path, "feature/remote")?;
        run_git_command(&repository_path, ["fetch", "origin"])?;

        checkout_branch(&repository_path, "origin/feature/remote")?;

        let branches = list_branches(&repository_path)?;
        assert!(branches.branches.iter().any(|branch| {
            branch.name == "feature/remote"
                && branch.branch_type == BranchType::Local
                && branch.current
                && branch.upstream.as_deref() == Some("origin/feature/remote")
        }));

        fs::remove_dir_all(repository_path)?;
        fs::remove_dir_all(remote_path)?;

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
        fs::write(repository_path.join("README.md"), "base\n")?;
        run_git_command(&repository_path, ["add", "README.md"])?;
        run_git_command(&repository_path, ["commit", "-m", "initial"])?;
        Ok(repository_path)
    }

    fn create_bare_repository(name: &str) -> Result<std::path::PathBuf, Box<dyn Error>> {
        let repository_path = std::env::temp_dir().join(format!(
            "git-workbench-{name}-remote-{}",
            std::process::id()
        ));
        if repository_path.exists() {
            fs::remove_dir_all(&repository_path)?;
        }
        fs::create_dir_all(&repository_path)?;
        run_git_command(&repository_path, ["init", "--bare"])?;
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
