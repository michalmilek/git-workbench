use std::path::Path;

use serde::Serialize;

use crate::{git::command::run_git, operation_error::OperationError};

const HISTORY_LIMIT: u16 = 200;
const RECORD_SEPARATOR: char = '\x1e';
const LOG_FORMAT: &str = "%H%x00%h%x00%P%x00%s%x00%an%x00%ae%x00%aI%x00%D%x1e";
const COMMIT_METADATA_FORMAT: &str = "%H%x00%h%x00%P%x00%s%x00%an%x00%ae%x00%aI%x00%D%x00%b";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitSummary {
    pub oid: String,
    pub short_oid: String,
    pub parents: Vec<String>,
    pub subject: String,
    pub author_name: String,
    pub author_email: String,
    pub authored_at: String,
    pub refs: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CommitFileChangeType {
    Added,
    Binary,
    Copied,
    Modified,
    Deleted,
    Renamed,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitChangedFile {
    pub path: String,
    pub previous_path: Option<String>,
    pub change_type: CommitFileChangeType,
    pub additions: Option<u32>,
    pub deletions: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetails {
    pub commit: CommitSummary,
    pub body: String,
    pub files: Vec<CommitChangedFile>,
    pub diff_text: String,
}

/// Lists recent commits visible from all refs in a repository.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed, exits unsuccessfully, or returns
/// malformed history output.
pub fn list_commit_history(
    repository_path: &Path,
    query: Option<String>,
) -> Result<Vec<CommitSummary>, OperationError> {
    let args = history_args(query);
    let output = run_git(repository_path, &args)?;
    parse_log_output(&output.stdout)
}

/// Reads metadata, changed files, and patch text for one commit.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed, exits unsuccessfully, or returns
/// malformed commit detail output.
pub fn get_commit_details(
    repository_path: &Path,
    commit_oid: &str,
) -> Result<CommitDetails, OperationError> {
    let metadata = run_git(repository_path, &commit_metadata_args(commit_oid))?;
    let changed_files = run_git(repository_path, &changed_files_args(commit_oid))?;
    let diff = run_git(repository_path, &diff_text_args(commit_oid))?;

    let (commit, body) = parse_commit_metadata_output(&metadata.stdout)?;
    let files = parse_changed_files_output(&changed_files.stdout)?;

    Ok(CommitDetails {
        commit,
        body,
        files,
        diff_text: diff.stdout,
    })
}

fn history_args(query: Option<String>) -> Vec<String> {
    let mut args = vec![
        String::from("log"),
        String::from("--exclude=refs/stash"),
        String::from("--all"),
        String::from("--date=iso-strict"),
        format!("--max-count={HISTORY_LIMIT}"),
        format!("--pretty=format:{LOG_FORMAT}"),
    ];

    if let Some(query_text) = query
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
    {
        args.push(String::from("--fixed-strings"));
        args.push(String::from("--regexp-ignore-case"));
        args.push(format!("--grep={query_text}"));
    }

    args
}

fn commit_metadata_args(commit_oid: &str) -> Vec<String> {
    vec![
        String::from("show"),
        String::from("-s"),
        String::from("--date=iso-strict"),
        format!("--pretty=format:{COMMIT_METADATA_FORMAT}"),
        commit_oid.to_owned(),
    ]
}

fn changed_files_args(commit_oid: &str) -> Vec<String> {
    vec![
        String::from("show"),
        String::from("--raw"),
        String::from("--numstat"),
        String::from("--find-renames"),
        String::from("--diff-merges=first-parent"),
        String::from("-z"),
        String::from("--format="),
        commit_oid.to_owned(),
    ]
}

fn diff_text_args(commit_oid: &str) -> Vec<String> {
    vec![
        String::from("show"),
        String::from("--format="),
        String::from("--find-renames"),
        String::from("--diff-merges=first-parent"),
        String::from("--patch"),
        String::from("--no-ext-diff"),
        commit_oid.to_owned(),
    ]
}

fn parse_log_output(output: &str) -> Result<Vec<CommitSummary>, OperationError> {
    output
        .split_terminator(RECORD_SEPARATOR)
        .map(|record| record.trim_start_matches('\n'))
        .filter(|record| !record.is_empty())
        .map(parse_commit_summary_record)
        .collect()
}

fn parse_commit_metadata_output(output: &str) -> Result<(CommitSummary, String), OperationError> {
    let fields = output.splitn(9, '\0').collect::<Vec<_>>();
    let [
        oid,
        short_oid,
        parents,
        subject,
        author_name,
        author_email,
        authored_at,
        refs,
        body,
    ] = fields.as_slice()
    else {
        return Err(OperationError::parse("invalid commit metadata record"));
    };

    Ok((
        commit_summary_from_fields(CommitSummaryFields {
            oid,
            short_oid,
            parents,
            subject,
            author_name,
            author_email,
            authored_at,
            refs,
        }),
        (*body).to_owned(),
    ))
}

fn parse_commit_summary_record(record: &str) -> Result<CommitSummary, OperationError> {
    let fields = record.split('\0').collect::<Vec<_>>();
    let [
        oid,
        short_oid,
        parents,
        subject,
        author_name,
        author_email,
        authored_at,
        refs,
    ] = fields.as_slice()
    else {
        return Err(OperationError::parse("invalid commit history record"));
    };

    Ok(commit_summary_from_fields(CommitSummaryFields {
        oid,
        short_oid,
        parents,
        subject,
        author_name,
        author_email,
        authored_at,
        refs,
    }))
}

#[derive(Clone, Copy)]
struct CommitSummaryFields<'a> {
    oid: &'a str,
    short_oid: &'a str,
    parents: &'a str,
    subject: &'a str,
    author_name: &'a str,
    author_email: &'a str,
    authored_at: &'a str,
    refs: &'a str,
}

fn commit_summary_from_fields(fields: CommitSummaryFields<'_>) -> CommitSummary {
    CommitSummary {
        oid: fields.oid.to_owned(),
        short_oid: fields.short_oid.to_owned(),
        parents: parse_parents(fields.parents),
        subject: fields.subject.to_owned(),
        author_name: fields.author_name.to_owned(),
        author_email: fields.author_email.to_owned(),
        authored_at: fields.authored_at.to_owned(),
        refs: parse_refs(fields.refs),
    }
}

fn parse_parents(value: &str) -> Vec<String> {
    value.split_whitespace().map(str::to_owned).collect()
}

fn parse_refs(value: &str) -> Vec<String> {
    value
        .split(", ")
        .map(str::trim)
        .filter(|reference| !reference.is_empty())
        .map(str::to_owned)
        .collect()
}

fn parse_changed_files_output(output: &str) -> Result<Vec<CommitChangedFile>, OperationError> {
    let records = output.split_terminator('\0').collect::<Vec<_>>();
    let (statuses, mut index) = parse_raw_statuses(&records)?;
    let mut files = Vec::new();

    while index < records.len() {
        let record = records[index].trim_start_matches('\n');
        if record.is_empty() {
            index += 1;
            continue;
        }

        let (additions, deletions, path_field) = parse_numstat_record(record)?;
        let (path, previous_path, next_index) = if path_field.is_empty() {
            let previous_path = records
                .get(index + 1)
                .ok_or_else(|| OperationError::parse("missing renamed source path"))?;
            let path = records
                .get(index + 2)
                .ok_or_else(|| OperationError::parse("missing renamed target path"))?;
            (
                (*path).to_owned(),
                Some((*previous_path).to_owned()),
                index + 3,
            )
        } else {
            (path_field.to_owned(), None, index + 1)
        };

        let change_type = change_type_for_path(
            &statuses,
            &path,
            previous_path.as_deref(),
            additions,
            deletions,
        );
        files.push(CommitChangedFile {
            path,
            previous_path,
            change_type,
            additions,
            deletions,
        });
        index = next_index;
    }

    Ok(files)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RawChangedFileStatus {
    path: String,
    previous_path: Option<String>,
    change_type: CommitFileChangeType,
}

fn parse_raw_statuses(
    records: &[&str],
) -> Result<(Vec<RawChangedFileStatus>, usize), OperationError> {
    let mut statuses = Vec::new();
    let mut index = 0;

    while index < records.len() {
        let record = records[index].trim_start_matches('\n');
        if !record.starts_with(':') {
            return Ok((statuses, index));
        }

        let status = raw_status_code(record)?;
        let change_type = change_type_from_status(status);
        let (path, previous_path, next_index) = if matches!(
            change_type,
            CommitFileChangeType::Copied | CommitFileChangeType::Renamed
        ) {
            let previous_path = records
                .get(index + 1)
                .ok_or_else(|| OperationError::parse("missing raw renamed source path"))?;
            let path = records
                .get(index + 2)
                .ok_or_else(|| OperationError::parse("missing raw renamed target path"))?;
            (
                (*path).to_owned(),
                Some((*previous_path).to_owned()),
                index + 3,
            )
        } else {
            let path = records
                .get(index + 1)
                .ok_or_else(|| OperationError::parse("missing raw changed path"))?;
            ((*path).to_owned(), None, index + 2)
        };

        statuses.push(RawChangedFileStatus {
            path,
            previous_path,
            change_type,
        });
        index = next_index;
    }

    Ok((statuses, index))
}

fn raw_status_code(record: &str) -> Result<&str, OperationError> {
    let parts = record.split_whitespace().collect::<Vec<_>>();
    let Some(status) = parts.get(4) else {
        return Err(OperationError::parse("missing raw file status"));
    };
    Ok(status)
}

fn parse_numstat_record(record: &str) -> Result<(Option<u32>, Option<u32>, &str), OperationError> {
    let mut fields = record.splitn(3, '\t');
    let additions = parse_numstat_count(fields.next(), "additions")?;
    let deletions = parse_numstat_count(fields.next(), "deletions")?;
    let Some(path) = fields.next() else {
        return Err(OperationError::parse("missing numstat path"));
    };

    Ok((additions, deletions, path))
}

fn parse_numstat_count(
    value: Option<&str>,
    field_name: &str,
) -> Result<Option<u32>, OperationError> {
    let Some(raw_value) = value else {
        return Err(OperationError::parse(format!(
            "missing numstat {field_name}"
        )));
    };
    if raw_value == "-" {
        return Ok(None);
    }
    raw_value
        .parse::<u32>()
        .map(Some)
        .map_err(|_| OperationError::parse(format!("invalid numstat {field_name}")))
}

fn change_type_for_path(
    statuses: &[RawChangedFileStatus],
    path: &str,
    previous_path: Option<&str>,
    additions: Option<u32>,
    deletions: Option<u32>,
) -> CommitFileChangeType {
    if additions.is_none() || deletions.is_none() {
        return CommitFileChangeType::Binary;
    }

    statuses
        .iter()
        .find(|status| status.path == path && status.previous_path.as_deref() == previous_path)
        .or_else(|| statuses.iter().find(|status| status.path == path))
        .map_or_else(
            || {
                if previous_path.is_some() {
                    CommitFileChangeType::Renamed
                } else {
                    CommitFileChangeType::Modified
                }
            },
            |status| status.change_type,
        )
}

fn change_type_from_status(status: &str) -> CommitFileChangeType {
    match status.chars().next().map_or('M', |value| value) {
        'A' => CommitFileChangeType::Added,
        'C' => CommitFileChangeType::Copied,
        'D' => CommitFileChangeType::Deleted,
        'M' | 'T' => CommitFileChangeType::Modified,
        'R' => CommitFileChangeType::Renamed,
        _ => CommitFileChangeType::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use std::{error::Error, fs, path::Path, process::Command};

    use super::{
        CommitChangedFile, CommitFileChangeType, CommitSummary, get_commit_details,
        list_commit_history, parse_changed_files_output, parse_commit_metadata_output,
        parse_log_output,
    };

    #[test]
    fn parses_log_output_with_nul_fields_and_record_separators() -> Result<(), Box<dyn Error>> {
        let output = "\
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\0aaaaaaa\0bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb cccccccccccccccccccccccccccccccccccccccc\0Add history graph\0Ada Lovelace\0ada@example.test\x002026-05-16T08:30:00+02:00\0HEAD -> main, tag: v1.0\x1e
dddddddddddddddddddddddddddddddddddddddd\0ddddddd\0\0Initial import\0Grace Hopper\0grace@example.test\x002026-05-15T21:00:00+02:00\0\x1e";

        let commits = parse_log_output(output)?;

        assert_eq!(
            commits,
            vec![
                CommitSummary {
                    oid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_owned(),
                    short_oid: "aaaaaaa".to_owned(),
                    parents: vec![
                        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".to_owned(),
                        "cccccccccccccccccccccccccccccccccccccccc".to_owned(),
                    ],
                    subject: "Add history graph".to_owned(),
                    author_name: "Ada Lovelace".to_owned(),
                    author_email: "ada@example.test".to_owned(),
                    authored_at: "2026-05-16T08:30:00+02:00".to_owned(),
                    refs: vec!["HEAD -> main".to_owned(), "tag: v1.0".to_owned()],
                },
                CommitSummary {
                    oid: "dddddddddddddddddddddddddddddddddddddddd".to_owned(),
                    short_oid: "ddddddd".to_owned(),
                    parents: Vec::new(),
                    subject: "Initial import".to_owned(),
                    author_name: "Grace Hopper".to_owned(),
                    author_email: "grace@example.test".to_owned(),
                    authored_at: "2026-05-15T21:00:00+02:00".to_owned(),
                    refs: Vec::new(),
                },
            ]
        );

        Ok(())
    }

    #[test]
    fn parses_commit_metadata_body_after_nul_fields() -> Result<(), Box<dyn Error>> {
        let output = "\
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\0aaaaaaa\0bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\0Add history graph\0Ada Lovelace\0ada@example.test\x002026-05-16T08:30:00+02:00\0feature/history\0Body line one

Body line two
";

        let (commit, body) = parse_commit_metadata_output(output)?;

        assert_eq!(commit.subject, "Add history graph");
        assert_eq!(commit.refs, vec!["feature/history"]);
        assert_eq!(body, "Body line one\n\nBody line two\n");

        Ok(())
    }

    #[test]
    fn parses_numstat_output_with_renames_and_statuses() -> Result<(), Box<dyn Error>> {
        let output = "\
:100644 100644 aaaaaaa bbbbbbb R087\0src/old name.rs\0src/new name.rs\0\
:100644 100644 eeeeeee fffffff C091\0src/template.rs\0src/copied.rs\0\
:000000 100644 0000000 ccccccc A\0src/created.rs\0\
:100644 000000 ddddddd 0000000 D\0src/deleted.rs\0\
:100644 100644 1111111 2222222 M\0assets/logo.png\0\
2\t1\t\0src/old name.rs\0src/new name.rs\0\
7\t2\t\0src/template.rs\0src/copied.rs\0\
4\t0\tsrc/created.rs\0\
0\t3\tsrc/deleted.rs\0\
-\t-\tassets/logo.png\0";

        let files = parse_changed_files_output(output)?;

        assert_eq!(
            files,
            vec![
                CommitChangedFile {
                    path: "src/new name.rs".to_owned(),
                    previous_path: Some("src/old name.rs".to_owned()),
                    change_type: CommitFileChangeType::Renamed,
                    additions: Some(2),
                    deletions: Some(1),
                },
                CommitChangedFile {
                    path: "src/copied.rs".to_owned(),
                    previous_path: Some("src/template.rs".to_owned()),
                    change_type: CommitFileChangeType::Copied,
                    additions: Some(7),
                    deletions: Some(2),
                },
                CommitChangedFile {
                    path: "src/created.rs".to_owned(),
                    previous_path: None,
                    change_type: CommitFileChangeType::Added,
                    additions: Some(4),
                    deletions: Some(0),
                },
                CommitChangedFile {
                    path: "src/deleted.rs".to_owned(),
                    previous_path: None,
                    change_type: CommitFileChangeType::Deleted,
                    additions: Some(0),
                    deletions: Some(3),
                },
                CommitChangedFile {
                    path: "assets/logo.png".to_owned(),
                    previous_path: None,
                    change_type: CommitFileChangeType::Binary,
                    additions: None,
                    deletions: None,
                },
            ]
        );

        Ok(())
    }

    #[test]
    fn lists_history_across_branches_and_filters_query() -> Result<(), Box<dyn Error>> {
        let repository_path = create_history_repository("history-list")?;
        fs::write(repository_path.join("scratch.txt"), "stash me\n")?;
        run_git_command(
            &repository_path,
            ["stash", "push", "--include-untracked", "-m", "hidden stash"],
        )?;

        let commits = list_commit_history(&repository_path, None)?;
        let filtered = list_commit_history(&repository_path, Some(String::from("history")))?;

        assert!(commits.len() >= 3);
        assert!(
            !commits
                .iter()
                .any(|commit| commit.subject.contains("hidden stash"))
        );
        assert!(commits.iter().any(|commit| {
            commit.subject == "Add history graph"
                && commit
                    .refs
                    .iter()
                    .any(|reference| reference == "feature/history")
        }));
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].subject, "Add history graph");

        fs::remove_dir_all(repository_path)?;

        Ok(())
    }

    #[test]
    fn reads_merge_commit_details_against_first_parent() -> Result<(), Box<dyn Error>> {
        let repository_path = create_merge_repository("history-merge-details")?;
        let commit_oid = git_output(&repository_path, ["rev-parse", "HEAD"])?;

        let details = get_commit_details(&repository_path, commit_oid.trim())?;

        assert_eq!(details.commit.subject, "Merge feature history");
        assert!(details.commit.parents.len() > 1);
        assert!(details.files.iter().any(|file| {
            file.path == "feature.txt"
                && file.change_type == CommitFileChangeType::Added
                && file.additions == Some(1)
                && file.deletions == Some(0)
        }));
        assert!(
            details
                .diff_text
                .contains("diff --git a/feature.txt b/feature.txt")
        );

        fs::remove_dir_all(repository_path)?;

        Ok(())
    }

    #[test]
    fn reads_commit_details_from_real_repository() -> Result<(), Box<dyn Error>> {
        let repository_path = create_history_repository("history-details")?;
        let commit_oid = git_output(&repository_path, ["rev-parse", "feature/history"])?;

        let details = get_commit_details(&repository_path, commit_oid.trim())?;

        assert_eq!(details.commit.subject, "Add history graph");
        assert!(
            details
                .commit
                .refs
                .iter()
                .any(|reference| reference == "feature/history")
        );
        assert_eq!(details.body, "Body for details\n");
        assert_eq!(
            details.files,
            vec![CommitChangedFile {
                path: "docs/README.md".to_owned(),
                previous_path: Some("README.md".to_owned()),
                change_type: CommitFileChangeType::Renamed,
                additions: Some(1),
                deletions: Some(0),
            }]
        );
        assert!(
            details
                .diff_text
                .contains("diff --git a/README.md b/docs/README.md")
        );
        assert!(details.diff_text.contains("+feature line"));

        fs::remove_dir_all(repository_path)?;

        Ok(())
    }

    fn create_history_repository(name: &str) -> Result<std::path::PathBuf, Box<dyn Error>> {
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

        fs::write(
            repository_path.join("README.md"),
            "base 1\nbase 2\nbase 3\nbase 4\n",
        )?;
        run_git_command(&repository_path, ["add", "README.md"])?;
        run_git_command(&repository_path, ["commit", "-m", "Initial import"])?;

        run_git_command(&repository_path, ["checkout", "-b", "feature/history"])?;
        fs::create_dir_all(repository_path.join("docs"))?;
        run_git_command(&repository_path, ["mv", "README.md", "docs/README.md"])?;
        fs::write(
            repository_path.join("docs/README.md"),
            "base 1\nbase 2\nbase 3\nbase 4\nfeature line\n",
        )?;
        run_git_command(&repository_path, ["add", "docs/README.md"])?;
        run_git_command(
            &repository_path,
            [
                "commit",
                "-m",
                "Add history graph",
                "-m",
                "Body for details",
            ],
        )?;

        run_git_command(&repository_path, ["checkout", "main"])?;
        fs::write(repository_path.join("main.txt"), "main line\n")?;
        run_git_command(&repository_path, ["add", "main.txt"])?;
        run_git_command(&repository_path, ["commit", "-m", "Update main notes"])?;

        Ok(repository_path)
    }

    fn create_merge_repository(name: &str) -> Result<std::path::PathBuf, Box<dyn Error>> {
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

        run_git_command(&repository_path, ["checkout", "-b", "feature/merge"])?;
        fs::write(repository_path.join("feature.txt"), "feature line\n")?;
        run_git_command(&repository_path, ["add", "feature.txt"])?;
        run_git_command(&repository_path, ["commit", "-m", "Add feature file"])?;

        run_git_command(&repository_path, ["checkout", "main"])?;
        fs::write(repository_path.join("main.txt"), "main line\n")?;
        run_git_command(&repository_path, ["add", "main.txt"])?;
        run_git_command(&repository_path, ["commit", "-m", "Add main file"])?;
        run_git_command(
            &repository_path,
            [
                "merge",
                "--no-ff",
                "feature/merge",
                "-m",
                "Merge feature history",
            ],
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
