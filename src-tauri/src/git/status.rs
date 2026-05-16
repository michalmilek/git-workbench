use serde::Serialize;

use crate::{git::command::run_git, operation_error::OperationError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryStatus {
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub files: Vec<StatusFile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusFile {
    pub path: String,
    pub index_status: GitFileStatus,
    pub worktree_status: GitFileStatus,
    pub conflict: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitFileStatus {
    Unmodified,
    Modified,
    Added,
    Deleted,
    Renamed,
    Copied,
    Unmerged,
    Untracked,
    Ignored,
    Unknown,
}

/// Parses `git status --porcelain=v2 --branch` output into a repository status DTO.
///
/// # Errors
///
/// Returns an operation error when branch divergence or file status records are malformed.
pub fn parse_status_output(output: &str) -> Result<RepositoryStatus, OperationError> {
    if output.contains('\0') {
        return parse_z_status_output(output);
    }

    let mut branch = None;
    let mut upstream = None;
    let mut ahead = 0;
    let mut behind = 0;
    let mut files = Vec::new();

    for line in output.lines() {
        if let Some(value) = line.strip_prefix("# branch.head ") {
            branch = (value != "(detached)").then(|| value.to_owned());
            continue;
        }

        if let Some(value) = line.strip_prefix("# branch.upstream ") {
            upstream = Some(value.to_owned());
            continue;
        }

        if let Some(value) = line.strip_prefix("# branch.ab ") {
            let (next_ahead, next_behind) = parse_ahead_behind(value)?;
            ahead = next_ahead;
            behind = next_behind;
            continue;
        }

        if let Some(file) = parse_file_line(line)? {
            files.push(file);
        }
    }

    Ok(RepositoryStatus {
        branch,
        upstream,
        ahead,
        behind,
        files,
    })
}

/// Reads the current repository status by invoking system Git in `repository_path`.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed, exits unsuccessfully, or returns
/// malformed porcelain status output.
pub fn read_repository_status(
    repository_path: &std::path::Path,
) -> Result<RepositoryStatus, OperationError> {
    let args = vec![
        String::from("status"),
        String::from("--porcelain=v2"),
        String::from("--branch"),
        String::from("-z"),
    ];
    let output = run_git(repository_path, &args)?;
    parse_status_output(&output.stdout)
}

fn parse_z_status_output(output: &str) -> Result<RepositoryStatus, OperationError> {
    let mut branch = None;
    let mut upstream = None;
    let mut ahead = 0;
    let mut behind = 0;
    let mut files = Vec::new();

    let records = output.split_terminator('\0').collect::<Vec<_>>();
    let mut index = 0;

    while index < records.len() {
        let record = records[index];

        if let Some(value) = record.strip_prefix("# branch.head ") {
            branch = (value != "(detached)").then(|| value.to_owned());
            index += 1;
            continue;
        }

        if let Some(value) = record.strip_prefix("# branch.upstream ") {
            upstream = Some(value.to_owned());
            index += 1;
            continue;
        }

        if let Some(value) = record.strip_prefix("# branch.ab ") {
            let (next_ahead, next_behind) = parse_ahead_behind(value)?;
            ahead = next_ahead;
            behind = next_behind;
            index += 1;
            continue;
        }

        if let Some(file) = parse_file_record(record)? {
            files.push(file);
        }

        index += if record.starts_with("2 ") { 2 } else { 1 };
    }

    Ok(RepositoryStatus {
        branch,
        upstream,
        ahead,
        behind,
        files,
    })
}

fn parse_ahead_behind(value: &str) -> Result<(u32, u32), OperationError> {
    let mut parts = value.split_whitespace();
    let ahead = parse_count(parts.next(), '+')?;
    let behind = parse_count(parts.next(), '-')?;
    Ok((ahead, behind))
}

fn parse_count(value: Option<&str>, prefix: char) -> Result<u32, OperationError> {
    let Some(raw) = value else {
        return Err(OperationError::parse("missing branch divergence count"));
    };
    let Some(count) = raw.strip_prefix(prefix) else {
        return Err(OperationError::parse("invalid branch divergence count"));
    };
    count
        .parse::<u32>()
        .map_err(|_| OperationError::parse("invalid branch divergence number"))
}

fn parse_file_line(line: &str) -> Result<Option<StatusFile>, OperationError> {
    if let Some(path) = line.strip_prefix("? ") {
        return Ok(Some(StatusFile {
            path: path.to_owned(),
            index_status: GitFileStatus::Untracked,
            worktree_status: GitFileStatus::Untracked,
            conflict: false,
        }));
    }

    if let Some(path) = line.strip_prefix("! ") {
        return Ok(Some(StatusFile {
            path: path.to_owned(),
            index_status: GitFileStatus::Ignored,
            worktree_status: GitFileStatus::Ignored,
            conflict: false,
        }));
    }

    parse_file_record(line)
}

fn parse_file_record(record: &str) -> Result<Option<StatusFile>, OperationError> {
    let Some(record_kind) = record.chars().next() else {
        return Ok(None);
    };

    if record_kind == '?' {
        let Some(path) = record.strip_prefix("? ") else {
            return Err(OperationError::parse("missing untracked file path"));
        };
        return Ok(Some(StatusFile {
            path: path.to_owned(),
            index_status: GitFileStatus::Untracked,
            worktree_status: GitFileStatus::Untracked,
            conflict: false,
        }));
    }

    if record_kind == '!' {
        let Some(path) = record.strip_prefix("! ") else {
            return Err(OperationError::parse("missing ignored file path"));
        };
        return Ok(Some(StatusFile {
            path: path.to_owned(),
            index_status: GitFileStatus::Ignored,
            worktree_status: GitFileStatus::Ignored,
            conflict: false,
        }));
    }

    let (status_pair, path) = match record_kind {
        '1' => parse_status_record_parts(record, 9)?,
        '2' => parse_status_record_parts(record, 10)?,
        'u' => parse_status_record_parts(record, 11)?,
        _ => return Ok(None),
    };
    let mut chars = status_pair.chars();
    let index_status = chars.next().map_or(GitFileStatus::Unknown, map_status);
    let worktree_status = chars.next().map_or(GitFileStatus::Unknown, map_status);

    Ok(Some(StatusFile {
        path: path.to_owned(),
        index_status,
        worktree_status,
        conflict: record_kind == 'u',
    }))
}

fn parse_status_record_parts(
    record: &str,
    expected_parts: usize,
) -> Result<(&str, &str), OperationError> {
    let parts = record.splitn(expected_parts, ' ').collect::<Vec<_>>();

    let Some(status_pair) = parts.get(1) else {
        return Err(OperationError::parse("missing porcelain status pair"));
    };

    let Some(path) = parts.get(expected_parts - 1) else {
        return Err(OperationError::parse("missing porcelain file path"));
    };

    Ok((status_pair, path))
}

const fn map_status(value: char) -> GitFileStatus {
    match value {
        '.' => GitFileStatus::Unmodified,
        'M' => GitFileStatus::Modified,
        'A' => GitFileStatus::Added,
        'D' => GitFileStatus::Deleted,
        'R' => GitFileStatus::Renamed,
        'C' => GitFileStatus::Copied,
        'U' => GitFileStatus::Unmerged,
        '?' => GitFileStatus::Untracked,
        '!' => GitFileStatus::Ignored,
        _ => GitFileStatus::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::{GitFileStatus, RepositoryStatus, StatusFile, parse_status_output};
    use crate::operation_error::OperationError;

    #[test]
    fn parses_branch_ahead_behind_and_changed_files() -> Result<(), OperationError> {
        let output = "\
# branch.oid 1111111111111111111111111111111111111111
# branch.head feature/workbench
# branch.upstream origin/feature/workbench
# branch.ab +2 -1
1 .M N... 100644 100644 100644 1111111111111111111111111111111111111111 1111111111111111111111111111111111111111 src/App.tsx
1 A. N... 000000 100644 100644 0000000000000000000000000000000000000000 2222222222222222222222222222222222222222 src/new.ts
? scratch.txt
";

        let status = parse_status_output(output)?;

        assert_eq!(
            status,
            RepositoryStatus {
                branch: Some("feature/workbench".to_owned()),
                upstream: Some("origin/feature/workbench".to_owned()),
                ahead: 2,
                behind: 1,
                files: vec![
                    StatusFile {
                        path: "src/App.tsx".to_owned(),
                        index_status: GitFileStatus::Unmodified,
                        worktree_status: GitFileStatus::Modified,
                        conflict: false,
                    },
                    StatusFile {
                        path: "src/new.ts".to_owned(),
                        index_status: GitFileStatus::Added,
                        worktree_status: GitFileStatus::Unmodified,
                        conflict: false,
                    },
                    StatusFile {
                        path: "scratch.txt".to_owned(),
                        index_status: GitFileStatus::Untracked,
                        worktree_status: GitFileStatus::Untracked,
                        conflict: false,
                    },
                ],
            }
        );

        Ok(())
    }

    #[test]
    fn parses_z_records_with_spaces_renames_and_conflicts() -> Result<(), OperationError> {
        let output = "\
# branch.oid 1111111111111111111111111111111111111111\0\
# branch.head feature/workbench\0\
# branch.upstream origin/feature/workbench\0\
# branch.ab +0 -3\0\
1 .M N... 100644 100644 100644 1111111111111111111111111111111111111111 1111111111111111111111111111111111111111 docs/file with spaces.md\0\
2 R. N... 100644 100644 100644 1111111111111111111111111111111111111111 2222222222222222222222222222222222222222 R100 src/new name.ts\0src/old name.ts\0\
u UU N... 100644 100644 100644 100644 1111111111111111111111111111111111111111 2222222222222222222222222222222222222222 3333333333333333333333333333333333333333 src/conflict.ts\0\
? scratch file.txt\0";

        let status = parse_status_output(output)?;

        assert_eq!(
            status,
            RepositoryStatus {
                branch: Some("feature/workbench".to_owned()),
                upstream: Some("origin/feature/workbench".to_owned()),
                ahead: 0,
                behind: 3,
                files: vec![
                    StatusFile {
                        path: "docs/file with spaces.md".to_owned(),
                        index_status: GitFileStatus::Unmodified,
                        worktree_status: GitFileStatus::Modified,
                        conflict: false,
                    },
                    StatusFile {
                        path: "src/new name.ts".to_owned(),
                        index_status: GitFileStatus::Renamed,
                        worktree_status: GitFileStatus::Unmodified,
                        conflict: false,
                    },
                    StatusFile {
                        path: "src/conflict.ts".to_owned(),
                        index_status: GitFileStatus::Unmerged,
                        worktree_status: GitFileStatus::Unmerged,
                        conflict: true,
                    },
                    StatusFile {
                        path: "scratch file.txt".to_owned(),
                        index_status: GitFileStatus::Untracked,
                        worktree_status: GitFileStatus::Untracked,
                        conflict: false,
                    },
                ],
            }
        );

        Ok(())
    }
}
