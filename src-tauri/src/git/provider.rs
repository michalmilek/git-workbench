use std::path::Path;

use serde::Serialize;

use crate::{git::command::run_git, operation_error::OperationError};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProviderKind {
    Github,
    Gitlab,
    CustomGitlab,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRemote {
    pub remote_name: String,
    pub provider_kind: ProviderKind,
    pub host: Option<String>,
    pub owner: Option<String>,
    pub repository: Option<String>,
    pub fetch_url: Option<String>,
    pub push_url: Option<String>,
    pub web_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRemoteList {
    pub remotes: Vec<ProviderRemote>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ProviderIdentity {
    provider_kind: ProviderKind,
    host: Option<String>,
    owner: Option<String>,
    repository: Option<String>,
    web_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RemoteRecord {
    remote_name: String,
    identity: ProviderIdentity,
    direction: RemoteDirection,
    url: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RemoteDirection {
    Fetch,
    Push,
}

/// Lists Git provider remotes configured for a repository.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed, exits unsuccessfully,
/// or prints an invalid `remote -v` record.
pub fn list_provider_remotes(repository_path: &Path) -> Result<ProviderRemoteList, OperationError> {
    let args = vec![String::from("remote"), String::from("-v")];
    let output = run_git(repository_path, &args)?;
    parse_remote_output(&output.stdout)
}

fn parse_remote_output(output: &str) -> Result<ProviderRemoteList, OperationError> {
    let mut remotes = Vec::new();
    for line in output.lines().filter(|line| !line.trim().is_empty()) {
        let record = parse_remote_record(line)?;
        merge_remote_record(&mut remotes, record);
    }
    remotes.sort_by(compare_remote);
    Ok(ProviderRemoteList { remotes })
}

fn parse_remote_record(line: &str) -> Result<RemoteRecord, OperationError> {
    let mut fields = line.split_whitespace();
    let remote_name = fields
        .next()
        .ok_or_else(|| OperationError::parse("missing remote name"))?;
    let url = fields
        .next()
        .ok_or_else(|| OperationError::parse("missing remote url"))?;
    let direction = fields
        .next()
        .ok_or_else(|| OperationError::parse("missing remote direction"))
        .and_then(parse_remote_direction)?;

    Ok(RemoteRecord {
        remote_name: remote_name.to_owned(),
        identity: parse_remote_identity(url),
        direction,
        url: url.to_owned(),
    })
}

fn parse_remote_direction(value: &str) -> Result<RemoteDirection, OperationError> {
    match value {
        "(fetch)" => Ok(RemoteDirection::Fetch),
        "(push)" => Ok(RemoteDirection::Push),
        _ => Err(OperationError::parse("invalid remote direction")),
    }
}

fn parse_remote_identity(url: &str) -> ProviderIdentity {
    let (host, path) = remote_location(url);
    let segments = path_segments(path);
    let (owner, repository) = owner_and_repository(&segments);
    let provider_kind = detect_provider_kind(host.as_deref());
    let web_url = provider_web_url(host.as_deref(), owner.as_deref(), repository.as_deref());

    ProviderIdentity {
        provider_kind,
        host,
        owner,
        repository,
        web_url,
    }
}

fn remote_location(url: &str) -> (Option<String>, Option<&str>) {
    if let Some(value) = url.strip_prefix("https://") {
        return slash_separated_location(value);
    }

    if let Some(value) = url.strip_prefix("ssh://") {
        return slash_separated_location(value);
    }

    if let Some((authority, path)) = url.split_once(':')
        && !authority.contains("://")
    {
        return (host_from_authority(authority), Some(path));
    }

    (None, None)
}

fn slash_separated_location(value: &str) -> (Option<String>, Option<&str>) {
    let Some((authority, path)) = value.split_once('/') else {
        return (host_from_authority(value), None);
    };

    (host_from_authority(authority), Some(path))
}

fn host_from_authority(authority: &str) -> Option<String> {
    let host_with_port = match authority.rsplit_once('@') {
        Some((_, host)) => host,
        None => authority,
    };
    let host = match host_with_port.split_once(':') {
        Some((host, _)) => host,
        None => host_with_port,
    };

    if host.is_empty() {
        return None;
    }

    Some(host.to_owned())
}

fn path_segments(path: Option<&str>) -> Vec<&str> {
    let Some(path) = path else {
        return Vec::new();
    };

    path.trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
}

fn owner_and_repository(segments: &[&str]) -> (Option<String>, Option<String>) {
    let Some((repository_segment, owner_segments)) = segments.split_last() else {
        return (None, None);
    };
    let repository = repository_name(repository_segment);
    let owner = if owner_segments.is_empty() {
        None
    } else {
        Some(owner_segments.join("/"))
    };

    (owner, Some(repository))
}

fn repository_name(segment: &str) -> String {
    if let Some(repository) = segment.strip_suffix(".git") {
        return repository.to_owned();
    }

    segment.to_owned()
}

fn detect_provider_kind(host: Option<&str>) -> ProviderKind {
    let Some(host) = host else {
        return ProviderKind::Unknown;
    };
    let host = host.to_ascii_lowercase();
    match host.as_str() {
        "github.com" => ProviderKind::Github,
        "gitlab.com" => ProviderKind::Gitlab,
        _ if host.contains("gitlab") => ProviderKind::CustomGitlab,
        _ => ProviderKind::Unknown,
    }
}

fn provider_web_url(
    host: Option<&str>,
    owner: Option<&str>,
    repository: Option<&str>,
) -> Option<String> {
    let (Some(host), Some(owner), Some(repository)) = (host, owner, repository) else {
        return None;
    };

    Some(format!("https://{host}/{owner}/{repository}"))
}

fn merge_remote_record(remotes: &mut Vec<ProviderRemote>, record: RemoteRecord) {
    if let Some(remote) = remotes
        .iter_mut()
        .find(|remote| remote_matches_record(remote, &record))
    {
        assign_remote_url(remote, record.direction, record.url);
        return;
    }

    let RemoteRecord {
        remote_name,
        identity,
        direction,
        url,
    } = record;
    let ProviderIdentity {
        provider_kind,
        host,
        owner,
        repository,
        web_url,
    } = identity;
    let mut remote = ProviderRemote {
        remote_name,
        provider_kind,
        host,
        owner,
        repository,
        fetch_url: None,
        push_url: None,
        web_url,
    };
    assign_remote_url(&mut remote, direction, url);
    remotes.push(remote);
}

fn remote_matches_record(remote: &ProviderRemote, record: &RemoteRecord) -> bool {
    remote.remote_name == record.remote_name
        && remote.provider_kind == record.identity.provider_kind
        && remote.host == record.identity.host
        && remote.owner == record.identity.owner
        && remote.repository == record.identity.repository
        && remote.web_url == record.identity.web_url
}

fn assign_remote_url(remote: &mut ProviderRemote, direction: RemoteDirection, url: String) {
    match direction {
        RemoteDirection::Fetch => remote.fetch_url = Some(url),
        RemoteDirection::Push => remote.push_url = Some(url),
    }
}

fn compare_remote(left: &ProviderRemote, right: &ProviderRemote) -> std::cmp::Ordering {
    left.remote_name
        .cmp(&right.remote_name)
        .then_with(|| left.host.cmp(&right.host))
        .then_with(|| left.owner.cmp(&right.owner))
        .then_with(|| left.repository.cmp(&right.repository))
        .then_with(|| left.provider_kind.cmp(&right.provider_kind))
}

#[cfg(test)]
mod tests {
    use std::{error::Error, fs, path::Path, process::Command};

    use serde_json::json;

    use super::{
        ProviderKind, ProviderRemote, ProviderRemoteList, list_provider_remotes,
        parse_remote_output,
    };

    #[test]
    fn parses_github_https_remote() -> Result<(), Box<dyn Error>> {
        let remotes = parse_remote_output(
            "origin\thttps://github.com/openai/codex.git (fetch)\n\
origin\thttps://github.com/openai/codex.git (push)\n",
        )?;

        assert_eq!(
            remotes,
            ProviderRemoteList {
                remotes: vec![ProviderRemote {
                    remote_name: "origin".to_owned(),
                    provider_kind: ProviderKind::Github,
                    host: Some("github.com".to_owned()),
                    owner: Some("openai".to_owned()),
                    repository: Some("codex".to_owned()),
                    fetch_url: Some("https://github.com/openai/codex.git".to_owned()),
                    push_url: Some("https://github.com/openai/codex.git".to_owned()),
                    web_url: Some("https://github.com/openai/codex".to_owned()),
                }],
            }
        );

        Ok(())
    }

    #[test]
    fn parses_gitlab_scp_like_remote() -> Result<(), Box<dyn Error>> {
        let remotes =
            parse_remote_output("origin\tgit@gitlab.com:group/subgroup/repo.git (fetch)\n")?;

        assert_eq!(
            remotes.remotes,
            vec![ProviderRemote {
                remote_name: "origin".to_owned(),
                provider_kind: ProviderKind::Gitlab,
                host: Some("gitlab.com".to_owned()),
                owner: Some("group/subgroup".to_owned()),
                repository: Some("repo".to_owned()),
                fetch_url: Some("git@gitlab.com:group/subgroup/repo.git".to_owned()),
                push_url: None,
                web_url: Some("https://gitlab.com/group/subgroup/repo".to_owned()),
            }]
        );

        Ok(())
    }

    #[test]
    fn parses_custom_gitlab_ssh_remote() -> Result<(), Box<dyn Error>> {
        let remotes = parse_remote_output(
            "origin\tssh://git@gitlab.company.test/group/subgroup/repo.git (push)\n",
        )?;

        assert_eq!(
            remotes.remotes,
            vec![ProviderRemote {
                remote_name: "origin".to_owned(),
                provider_kind: ProviderKind::CustomGitlab,
                host: Some("gitlab.company.test".to_owned()),
                owner: Some("group/subgroup".to_owned()),
                repository: Some("repo".to_owned()),
                fetch_url: None,
                push_url: Some("ssh://git@gitlab.company.test/group/subgroup/repo.git".to_owned()),
                web_url: Some("https://gitlab.company.test/group/subgroup/repo".to_owned()),
            }]
        );

        Ok(())
    }

    #[test]
    fn returns_unknown_for_unclassified_hosts() -> Result<(), Box<dyn Error>> {
        let remotes = parse_remote_output("mirror\tgit@example.com:team/project.git (fetch)\n")?;

        assert_eq!(
            remotes.remotes,
            vec![ProviderRemote {
                remote_name: "mirror".to_owned(),
                provider_kind: ProviderKind::Unknown,
                host: Some("example.com".to_owned()),
                owner: Some("team".to_owned()),
                repository: Some("project".to_owned()),
                fetch_url: Some("git@example.com:team/project.git".to_owned()),
                push_url: None,
                web_url: Some("https://example.com/team/project".to_owned()),
            }]
        );

        Ok(())
    }

    #[test]
    fn serializes_provider_remotes_as_camel_case() -> Result<(), Box<dyn Error>> {
        let value = serde_json::to_value(ProviderRemote {
            remote_name: "origin".to_owned(),
            provider_kind: ProviderKind::CustomGitlab,
            host: Some("gitlab.company.test".to_owned()),
            owner: Some("platform".to_owned()),
            repository: Some("workbench".to_owned()),
            fetch_url: Some("https://gitlab.company.test/platform/workbench.git".to_owned()),
            push_url: None,
            web_url: Some("https://gitlab.company.test/platform/workbench".to_owned()),
        })?;

        assert_eq!(
            value,
            json!({
                "remoteName": "origin",
                "providerKind": "customGitlab",
                "host": "gitlab.company.test",
                "owner": "platform",
                "repository": "workbench",
                "fetchUrl": "https://gitlab.company.test/platform/workbench.git",
                "pushUrl": null,
                "webUrl": "https://gitlab.company.test/platform/workbench"
            })
        );

        Ok(())
    }

    #[test]
    fn lists_provider_remotes_from_real_repository() -> Result<(), Box<dyn Error>> {
        let repository_path = create_test_repository("provider-remotes")?;

        run_git_command(
            &repository_path,
            [
                "remote",
                "add",
                "origin",
                "https://github.com/openai/codex.git",
            ],
        )?;
        run_git_command(
            &repository_path,
            [
                "remote",
                "set-url",
                "--push",
                "origin",
                "git@github.com:openai/codex.git",
            ],
        )?;
        run_git_command(
            &repository_path,
            [
                "remote",
                "add",
                "upstream",
                "ssh://git@gitlab.company.test/group/subgroup/repo.git",
            ],
        )?;
        run_git_command(
            &repository_path,
            [
                "remote",
                "add",
                "mirror",
                "git@example.com:team/project.git",
            ],
        )?;

        let remotes = list_provider_remotes(&repository_path)?;

        let Some(origin) = remotes
            .remotes
            .iter()
            .find(|remote| remote.remote_name == "origin")
        else {
            return Err("missing origin remote".into());
        };
        assert_eq!(origin.provider_kind, ProviderKind::Github);
        assert_eq!(
            origin.fetch_url.as_deref(),
            Some("https://github.com/openai/codex.git")
        );
        assert_eq!(
            origin.push_url.as_deref(),
            Some("git@github.com:openai/codex.git")
        );
        assert_eq!(
            origin.web_url.as_deref(),
            Some("https://github.com/openai/codex")
        );

        let Some(upstream) = remotes
            .remotes
            .iter()
            .find(|remote| remote.remote_name == "upstream")
        else {
            return Err("missing upstream remote".into());
        };
        assert_eq!(upstream.provider_kind, ProviderKind::CustomGitlab);
        assert_eq!(upstream.owner.as_deref(), Some("group/subgroup"));
        assert_eq!(upstream.repository.as_deref(), Some("repo"));

        let Some(mirror) = remotes
            .remotes
            .iter()
            .find(|remote| remote.remote_name == "mirror")
        else {
            return Err("missing mirror remote".into());
        };
        assert_eq!(mirror.provider_kind, ProviderKind::Unknown);
        assert_eq!(mirror.host.as_deref(), Some("example.com"));

        assert_eq!(remotes.remotes.len(), 3);

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
        if status.success() {
            return Ok(());
        }

        Err(format!("git command failed: git {}", args.join(" ")).into())
    }
}
