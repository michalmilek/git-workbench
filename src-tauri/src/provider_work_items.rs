use std::{path::Path, time::Duration};

use reqwest::{
    Client,
    header::{AUTHORIZATION, USER_AGENT},
};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::{
    git::provider::{self, ProviderKind as RemoteProviderKind, ProviderRemote},
    operation_error::OperationError,
    provider_accounts::{
        self, ProviderAccountToken, ProviderKind, authorization_header_value,
        user_agent_header_value,
    },
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProviderCheckStatus {
    Pending,
    Running,
    Success,
    Failed,
    Canceled,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderWorkItem {
    pub id: String,
    pub provider_kind: ProviderKind,
    pub account_id: String,
    pub provider_base_url: String,
    pub remote_name: String,
    pub title: String,
    pub author: Option<String>,
    pub source_branch: Option<String>,
    pub target_branch: Option<String>,
    pub state: String,
    pub web_url: Option<String>,
    pub ci_url: Option<String>,
    pub check_status: ProviderCheckStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderWorkItemList {
    pub items: Vec<ProviderWorkItem>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GithubWorkItemDraft {
    item: ProviderWorkItem,
    head_sha: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GitlabWorkItemDraft {
    item: ProviderWorkItem,
    iid: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ProviderCiStatus {
    check_status: ProviderCheckStatus,
    ci_url: Option<String>,
}

struct RemoteProject<'a> {
    owner: &'a str,
    repository: &'a str,
}

struct ProviderWorkSource {
    remote: ProviderRemote,
    account: ProviderAccountToken,
}

struct ProviderWorkSources {
    remotes: Vec<ProviderRemote>,
    sources: Vec<ProviderWorkSource>,
}

/// Lists open GitHub pull requests and GitLab merge requests for configured provider remotes.
///
/// # Errors
///
/// Returns an operation error when provider remotes, account metadata, tokens, or
/// provider API calls cannot be read.
#[tauri::command]
pub async fn list_provider_work_items(
    app_handle: AppHandle,
    repository_path: String,
) -> Result<ProviderWorkItemList, OperationError> {
    let list =
        list_provider_work_items_for_repository(&app_handle, Path::new(&repository_path)).await?;
    let _app_handle = app_handle;
    Ok(list)
}

async fn list_provider_work_items_for_repository(
    app_handle: &AppHandle,
    repository_path: &Path,
) -> Result<ProviderWorkItemList, OperationError> {
    let app_handle = app_handle.clone();
    let repository_path = repository_path.to_path_buf();
    let provider_sources = tauri::async_runtime::spawn_blocking(move || {
        collect_provider_work_sources(&app_handle, &repository_path)
    })
    .await
    .map_err(|error| operation_error("failed to collect provider work item sources", error))??;
    let client = Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| operation_error("failed to create provider HTTP client", error))?;
    let mut items = Vec::new();
    let has_sources = !provider_sources.sources.is_empty();

    for source in provider_sources.sources {
        let mut remote_items =
            fetch_remote_work_items(&client, &source.remote, &source.account).await?;
        items.append(&mut remote_items);
    }

    if !has_sources {
        return Ok(missing_provider_account_list(&provider_sources.remotes));
    }

    Ok(ProviderWorkItemList {
        message: loaded_message(items.len()),
        items,
    })
}

fn collect_provider_work_sources(
    app_handle: &AppHandle,
    repository_path: &Path,
) -> Result<ProviderWorkSources, OperationError> {
    let remote_list = provider::list_provider_remotes(repository_path)?;
    let mut sources = Vec::new();

    for remote in &remote_list.remotes {
        let Some(account) = provider_account_token_for_remote(app_handle, remote)? else {
            continue;
        };
        sources.push(ProviderWorkSource {
            remote: remote.clone(),
            account,
        });
    }

    Ok(ProviderWorkSources {
        remotes: remote_list.remotes,
        sources,
    })
}

fn provider_account_token_for_remote(
    app_handle: &AppHandle,
    remote: &ProviderRemote,
) -> Result<Option<ProviderAccountToken>, OperationError> {
    let Some(project) = remote_project(remote) else {
        return Ok(None);
    };

    match remote.provider_kind {
        RemoteProviderKind::Github => provider_accounts::find_provider_account_token(
            app_handle,
            ProviderKind::Github,
            "https://github.com",
        ),
        RemoteProviderKind::Gitlab => provider_accounts::find_provider_account_token(
            app_handle,
            ProviderKind::Gitlab,
            "https://gitlab.com",
        ),
        RemoteProviderKind::CustomGitlab => {
            let Some(host) = remote.host.as_deref() else {
                return Ok(None);
            };
            provider_accounts::find_provider_account_token_by_host_and_owner(
                app_handle,
                ProviderKind::CustomGitlab,
                host,
                project.owner,
            )
        }
        RemoteProviderKind::Unknown => Ok(None),
    }
}

async fn fetch_remote_work_items(
    client: &Client,
    remote: &ProviderRemote,
    account: &ProviderAccountToken,
) -> Result<Vec<ProviderWorkItem>, OperationError> {
    match remote.provider_kind {
        RemoteProviderKind::Github => fetch_github_work_items(client, remote, account).await,
        RemoteProviderKind::Gitlab | RemoteProviderKind::CustomGitlab => {
            fetch_gitlab_work_items(client, remote, account).await
        }
        RemoteProviderKind::Unknown => Ok(Vec::new()),
    }
}

async fn fetch_github_work_items(
    client: &Client,
    remote: &ProviderRemote,
    account: &ProviderAccountToken,
) -> Result<Vec<ProviderWorkItem>, OperationError> {
    let Some(project) = remote_project(remote) else {
        return Ok(Vec::new());
    };
    let pull_requests_url = build_github_pull_requests_url(project.owner, project.repository);
    let pull_requests_json =
        fetch_provider_json(client, &pull_requests_url, account.token()).await?;
    let mut drafts = parse_github_pull_requests_json(
        remote,
        account.account_id(),
        account.base_url(),
        &pull_requests_json,
    )?;

    for draft in &mut drafts {
        let Some(head_sha) = draft.head_sha.as_deref() else {
            continue;
        };
        let checks_url = build_github_check_runs_url(project.owner, project.repository, head_sha);
        if let Ok(checks_json) = fetch_provider_json(client, &checks_url, account.token()).await
            && let Ok(status) = parse_github_check_runs_json(&checks_json)
        {
            draft.item.check_status = status.check_status;
            draft.item.ci_url = status.ci_url;
        }
    }

    Ok(drafts.into_iter().map(|draft| draft.item).collect())
}

async fn fetch_gitlab_work_items(
    client: &Client,
    remote: &ProviderRemote,
    account: &ProviderAccountToken,
) -> Result<Vec<ProviderWorkItem>, OperationError> {
    let Some(project) = remote_project(remote) else {
        return Ok(Vec::new());
    };
    let merge_requests_url =
        build_gitlab_merge_requests_url(account.base_url(), project.owner, project.repository);
    let merge_requests_json =
        fetch_provider_json(client, &merge_requests_url, account.token()).await?;
    let mut drafts = parse_gitlab_merge_requests_json(
        remote,
        account.account_id(),
        account.base_url(),
        &merge_requests_json,
    )?;

    for draft in &mut drafts {
        let pipelines_url = build_gitlab_merge_request_pipelines_url(
            account.base_url(),
            project.owner,
            project.repository,
            draft.iid,
        );
        if let Ok(pipelines_json) =
            fetch_provider_json(client, &pipelines_url, account.token()).await
            && let Ok(status) = parse_gitlab_pipelines_json(&pipelines_json)
        {
            draft.item.check_status = status.check_status;
            draft.item.ci_url = status.ci_url;
        }
    }

    Ok(drafts.into_iter().map(|draft| draft.item).collect())
}

async fn fetch_provider_json(
    client: &Client,
    url: &str,
    token: &str,
) -> Result<String, OperationError> {
    let response = client
        .get(url)
        .header(AUTHORIZATION, authorization_header_value(token))
        .header(USER_AGENT, user_agent_header_value())
        .send()
        .await
        .map_err(|error| operation_error("provider request failed", error))?;
    let status = response.status();
    if !status.is_success() {
        return Err(OperationError::parse(format!(
            "provider request returned HTTP {}",
            status.as_u16()
        )));
    }

    response
        .text()
        .await
        .map_err(|error| operation_error("failed to read provider response", error))
}

fn build_github_pull_requests_url(owner: &str, repository: &str) -> String {
    format!("https://api.github.com/repos/{owner}/{repository}/pulls?state=open")
}

fn build_github_check_runs_url(owner: &str, repository: &str, head_sha: &str) -> String {
    format!("https://api.github.com/repos/{owner}/{repository}/commits/{head_sha}/check-runs")
}

fn build_gitlab_merge_requests_url(base_url: &str, owner: &str, repository: &str) -> String {
    let project_path = project_path_relative_to_base_url(base_url, owner, repository);
    format!(
        "{}/api/v4/projects/{}/merge_requests?state=opened",
        normalized_base_url(base_url),
        encoded_gitlab_project_path(&project_path)
    )
}

fn build_gitlab_merge_request_pipelines_url(
    base_url: &str,
    owner: &str,
    repository: &str,
    merge_request_iid: u64,
) -> String {
    let project_path = project_path_relative_to_base_url(base_url, owner, repository);
    format!(
        "{}/api/v4/projects/{}/merge_requests/{merge_request_iid}/pipelines?per_page=1",
        normalized_base_url(base_url),
        encoded_gitlab_project_path(&project_path)
    )
}

fn parse_github_pull_requests_json(
    remote: &ProviderRemote,
    account_id: &str,
    account_base_url: &str,
    json: &str,
) -> Result<Vec<GithubWorkItemDraft>, OperationError> {
    let pull_requests: Vec<GithubPullRequest> = serde_json::from_str(json)
        .map_err(|error| operation_error("failed to parse GitHub pull requests", error))?;
    let Some(provider_kind) = provider_kind_for_remote(remote.provider_kind) else {
        return Err(OperationError::parse("unsupported provider kind"));
    };

    Ok(pull_requests
        .into_iter()
        .map(|pull_request| {
            let GithubPullRequest {
                number,
                title,
                state,
                html_url,
                user,
                head,
                base,
            } = pull_request;
            let head_sha = head.as_ref().and_then(|head| head.sha.clone());
            let source_branch = head.and_then(|head| head.branch_ref);
            let target_branch = base.and_then(|base| base.branch_ref);

            GithubWorkItemDraft {
                item: ProviderWorkItem {
                    id: format!(
                        "{}:{}:{number}",
                        provider_kind_id_prefix(provider_kind),
                        remote.remote_name
                    ),
                    provider_kind,
                    account_id: account_id.to_owned(),
                    provider_base_url: account_base_url.to_owned(),
                    remote_name: remote.remote_name.clone(),
                    title,
                    author: user.map(|user| user.login),
                    source_branch,
                    target_branch,
                    state,
                    web_url: html_url,
                    ci_url: None,
                    check_status: ProviderCheckStatus::Unknown,
                },
                head_sha,
            }
        })
        .collect())
}

fn parse_github_check_runs_json(json: &str) -> Result<ProviderCiStatus, OperationError> {
    let check_runs: GithubCheckRuns = serde_json::from_str(json)
        .map_err(|error| operation_error("failed to parse GitHub check runs", error))?;
    let ci_url = check_runs
        .check_runs
        .iter()
        .find_map(|check_run| check_run.html_url.clone());
    let check_status = check_runs
        .check_runs
        .iter()
        .map(github_check_run_status)
        .fold(ProviderCheckStatus::Unknown, combine_check_status);

    Ok(ProviderCiStatus {
        check_status,
        ci_url,
    })
}

fn parse_gitlab_merge_requests_json(
    remote: &ProviderRemote,
    account_id: &str,
    account_base_url: &str,
    json: &str,
) -> Result<Vec<GitlabWorkItemDraft>, OperationError> {
    let merge_requests: Vec<GitlabMergeRequest> = serde_json::from_str(json)
        .map_err(|error| operation_error("failed to parse GitLab merge requests", error))?;
    let Some(provider_kind) = provider_kind_for_remote(remote.provider_kind) else {
        return Err(OperationError::parse("unsupported provider kind"));
    };

    Ok(merge_requests
        .into_iter()
        .map(|merge_request| {
            let iid = merge_request.iid;

            GitlabWorkItemDraft {
                item: ProviderWorkItem {
                    id: format!(
                        "{}:{}:{}",
                        provider_kind_id_prefix(provider_kind),
                        remote.remote_name,
                        iid
                    ),
                    provider_kind,
                    account_id: account_id.to_owned(),
                    provider_base_url: account_base_url.to_owned(),
                    remote_name: remote.remote_name.clone(),
                    title: merge_request.title,
                    author: merge_request.author.map(|author| author.username),
                    source_branch: merge_request.source_branch,
                    target_branch: merge_request.target_branch,
                    state: merge_request.state,
                    web_url: merge_request.web_url,
                    ci_url: None,
                    check_status: ProviderCheckStatus::Unknown,
                },
                iid,
            }
        })
        .collect())
}

fn parse_gitlab_pipelines_json(json: &str) -> Result<ProviderCiStatus, OperationError> {
    let pipelines: Vec<GitlabPipeline> = serde_json::from_str(json)
        .map_err(|error| operation_error("failed to parse GitLab pipelines", error))?;
    let Some(pipeline) = pipelines.first() else {
        return Ok(ProviderCiStatus {
            check_status: ProviderCheckStatus::Unknown,
            ci_url: None,
        });
    };

    Ok(ProviderCiStatus {
        check_status: gitlab_pipeline_status(&pipeline.status),
        ci_url: pipeline.web_url.clone(),
    })
}

fn missing_provider_account_list(remotes: &[ProviderRemote]) -> ProviderWorkItemList {
    let has_supported_remote = remotes.iter().any(supported_provider_remote);
    let message = if has_supported_remote {
        String::from("No matching provider account/token configured for detected provider remotes.")
    } else {
        String::from("No GitHub or GitLab remotes found.")
    };

    ProviderWorkItemList {
        items: Vec::new(),
        message,
    }
}

fn loaded_message(item_count: usize) -> String {
    if item_count == 0 {
        return String::from("No open provider work items found.");
    }

    format!("Loaded {item_count} provider work item(s).")
}

fn supported_provider_remote(remote: &ProviderRemote) -> bool {
    if remote_project(remote).is_none() {
        return false;
    }
    match remote.provider_kind {
        RemoteProviderKind::Github | RemoteProviderKind::Gitlab => true,
        RemoteProviderKind::CustomGitlab => remote.host.is_some(),
        RemoteProviderKind::Unknown => false,
    }
}

fn remote_project(remote: &ProviderRemote) -> Option<RemoteProject<'_>> {
    Some(RemoteProject {
        owner: remote.owner.as_deref()?,
        repository: remote.repository.as_deref()?,
    })
}

const fn provider_kind_for_remote(provider_kind: RemoteProviderKind) -> Option<ProviderKind> {
    match provider_kind {
        RemoteProviderKind::Github => Some(ProviderKind::Github),
        RemoteProviderKind::Gitlab => Some(ProviderKind::Gitlab),
        RemoteProviderKind::CustomGitlab => Some(ProviderKind::CustomGitlab),
        RemoteProviderKind::Unknown => None,
    }
}

const fn provider_kind_id_prefix(provider_kind: ProviderKind) -> &'static str {
    match provider_kind {
        ProviderKind::Github => "github",
        ProviderKind::Gitlab => "gitlab",
        ProviderKind::CustomGitlab => "customGitlab",
    }
}

fn github_check_run_status(check_run: &GithubCheckRun) -> ProviderCheckStatus {
    match check_run.status.as_deref() {
        Some("queued" | "requested" | "waiting" | "pending") => ProviderCheckStatus::Pending,
        Some("in_progress") => ProviderCheckStatus::Running,
        Some("completed") => github_check_run_conclusion(check_run.conclusion.as_deref()),
        Some(_) | None => ProviderCheckStatus::Unknown,
    }
}

fn github_check_run_conclusion(conclusion: Option<&str>) -> ProviderCheckStatus {
    match conclusion {
        Some("success") => ProviderCheckStatus::Success,
        Some("failure" | "timed_out" | "action_required") => ProviderCheckStatus::Failed,
        Some("cancelled" | "canceled") => ProviderCheckStatus::Canceled,
        Some(_) | None => ProviderCheckStatus::Unknown,
    }
}

fn gitlab_pipeline_status(status: &str) -> ProviderCheckStatus {
    match status {
        "created" | "pending" => ProviderCheckStatus::Pending,
        "waiting_for_resource" | "preparing" | "running" => ProviderCheckStatus::Running,
        "success" => ProviderCheckStatus::Success,
        "failed" => ProviderCheckStatus::Failed,
        "canceled" | "cancelled" => ProviderCheckStatus::Canceled,
        _ => ProviderCheckStatus::Unknown,
    }
}

const fn check_status_priority(status: ProviderCheckStatus) -> u8 {
    match status {
        ProviderCheckStatus::Failed => 5,
        ProviderCheckStatus::Canceled => 4,
        ProviderCheckStatus::Running => 3,
        ProviderCheckStatus::Pending => 2,
        ProviderCheckStatus::Success => 1,
        ProviderCheckStatus::Unknown => 0,
    }
}

const fn combine_check_status(
    current: ProviderCheckStatus,
    candidate: ProviderCheckStatus,
) -> ProviderCheckStatus {
    if check_status_priority(candidate) > check_status_priority(current) {
        return candidate;
    }

    current
}

fn project_path_relative_to_base_url(base_url: &str, owner: &str, repository: &str) -> String {
    let owner = owner.trim_matches('/');
    let Some(base_path) = base_url_path(base_url) else {
        return format!("{owner}/{repository}");
    };
    let relative_owner = if owner == base_path {
        ""
    } else {
        owner
            .strip_prefix(&format!("{base_path}/"))
            .unwrap_or(owner)
    };

    if relative_owner.is_empty() {
        return repository.to_owned();
    }

    format!("{relative_owner}/{repository}")
}

fn base_url_path(base_url: &str) -> Option<String> {
    let rest = base_url.strip_prefix("https://")?;
    let (_, path) = rest.split_once('/')?;
    let path = path.trim_matches('/');
    if path.is_empty() {
        return None;
    }

    Some(path.to_owned())
}

fn encoded_gitlab_project_path(project_path: &str) -> String {
    percent_encode(project_path)
}

fn percent_encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if is_unreserved(byte) {
            encoded.push(char::from(byte));
        } else {
            encoded.push('%');
            encoded.push(hex_digit(byte >> 4));
            encoded.push(hex_digit(byte & 0x0f));
        }
    }

    encoded
}

const fn is_unreserved(byte: u8) -> bool {
    matches!(
        byte,
        b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~'
    )
}

fn hex_digit(value: u8) -> char {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    char::from(HEX[usize::from(value)])
}

fn normalized_base_url(base_url: &str) -> String {
    base_url.trim().trim_end_matches('/').to_owned()
}

fn operation_error(message: &str, error: impl std::fmt::Display) -> OperationError {
    OperationError::parse(format!("{message}: {error}"))
}

#[derive(Deserialize)]
struct GithubPullRequest {
    number: u64,
    title: String,
    state: String,
    html_url: Option<String>,
    user: Option<GithubUser>,
    head: Option<GithubRef>,
    base: Option<GithubRef>,
}

#[derive(Deserialize)]
struct GithubUser {
    login: String,
}

#[derive(Deserialize)]
struct GithubRef {
    #[serde(rename = "ref")]
    branch_ref: Option<String>,
    sha: Option<String>,
}

#[derive(Deserialize)]
struct GithubCheckRuns {
    #[serde(default)]
    check_runs: Vec<GithubCheckRun>,
}

#[derive(Deserialize)]
struct GithubCheckRun {
    status: Option<String>,
    conclusion: Option<String>,
    html_url: Option<String>,
}

#[derive(Deserialize)]
struct GitlabMergeRequest {
    iid: u64,
    title: String,
    state: String,
    web_url: Option<String>,
    author: Option<GitlabAuthor>,
    source_branch: Option<String>,
    target_branch: Option<String>,
}

#[derive(Deserialize)]
struct GitlabAuthor {
    username: String,
}

#[derive(Deserialize)]
struct GitlabPipeline {
    status: String,
    web_url: Option<String>,
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use serde_json::json;

    use crate::{
        git::provider::{ProviderKind as RemoteProviderKind, ProviderRemote},
        provider_accounts::ProviderKind,
    };

    use super::{
        ProviderCheckStatus, ProviderWorkItem, ProviderWorkItemList, build_github_check_runs_url,
        build_github_pull_requests_url, build_gitlab_merge_request_pipelines_url,
        build_gitlab_merge_requests_url, missing_provider_account_list,
        parse_github_check_runs_json, parse_github_pull_requests_json,
        parse_gitlab_merge_requests_json, parse_gitlab_pipelines_json,
        project_path_relative_to_base_url,
    };

    #[test]
    fn serializes_work_item_payload_as_camel_case_without_tokens() -> Result<(), Box<dyn Error>> {
        let value = serde_json::to_value(ProviderWorkItemList {
            items: vec![ProviderWorkItem {
                id: String::from("github:origin:17"),
                provider_kind: ProviderKind::Github,
                account_id: String::from("github-account"),
                provider_base_url: String::from("https://github.com"),
                remote_name: String::from("origin"),
                title: String::from("Add provider panel"),
                author: Some(String::from("octocat")),
                source_branch: Some(String::from("feature/provider-panel")),
                target_branch: Some(String::from("main")),
                state: String::from("open"),
                web_url: Some(String::from("https://github.com/acme/workbench/pull/17")),
                ci_url: Some(String::from(
                    "https://github.com/acme/workbench/actions/runs/1",
                )),
                check_status: ProviderCheckStatus::Success,
            }],
            message: String::from("loaded provider work items"),
        })?;
        let encoded = serde_json::to_string(&value)?;

        assert_eq!(
            value,
            json!({
                "items": [{
                    "id": "github:origin:17",
                    "providerKind": "github",
                    "accountId": "github-account",
                    "providerBaseUrl": "https://github.com",
                    "remoteName": "origin",
                    "title": "Add provider panel",
                    "author": "octocat",
                    "sourceBranch": "feature/provider-panel",
                    "targetBranch": "main",
                    "state": "open",
                    "webUrl": "https://github.com/acme/workbench/pull/17",
                    "ciUrl": "https://github.com/acme/workbench/actions/runs/1",
                    "checkStatus": "success"
                }],
                "message": "loaded provider work items"
            })
        );
        assert!(!encoded.contains("secret-token"));
        assert!(!encoded.contains("token"));
        Ok(())
    }

    #[test]
    fn removes_custom_gitlab_base_path_from_project_path() {
        assert_eq!(
            project_path_relative_to_base_url(
                "https://gitlab.company.test/gitlab",
                "gitlab/platform",
                "workbench"
            ),
            "platform/workbench"
        );
    }

    #[test]
    fn builds_github_api_urls() {
        assert_eq!(
            build_github_pull_requests_url("openai", "codex"),
            "https://api.github.com/repos/openai/codex/pulls?state=open"
        );
        assert_eq!(
            build_github_check_runs_url("openai", "codex", "abc123"),
            "https://api.github.com/repos/openai/codex/commits/abc123/check-runs"
        );
    }

    #[test]
    fn builds_gitlab_api_urls_with_encoded_project_path() {
        assert_eq!(
            build_gitlab_merge_requests_url("https://gitlab.com/", "group/sub group", "workbench"),
            "https://gitlab.com/api/v4/projects/group%2Fsub%20group%2Fworkbench/merge_requests?state=opened"
        );
        assert_eq!(
            build_gitlab_merge_request_pipelines_url(
                "https://gitlab.company.test/root/",
                "platform",
                "workbench",
                17
            ),
            "https://gitlab.company.test/root/api/v4/projects/platform%2Fworkbench/merge_requests/17/pipelines?per_page=1"
        );
    }

    #[test]
    fn parses_github_pull_requests_json() -> Result<(), Box<dyn Error>> {
        let items = parse_github_pull_requests_json(
            &remote(RemoteProviderKind::Github),
            "github-account",
            "https://github.com",
            r#"[
  {
    "id": 9821,
    "number": 17,
    "title": "Add provider panel",
    "state": "open",
    "html_url": "https://github.com/acme/workbench/pull/17",
    "user": { "login": "octocat" },
    "head": { "ref": "feature/provider-panel", "sha": "abc123" },
    "base": { "ref": "main" }
  }
]"#,
        )?;

        assert_eq!(items.len(), 1);
        let item = &items[0].item;
        assert_eq!(item.id, "github:origin:17");
        assert_eq!(item.provider_kind, ProviderKind::Github);
        assert_eq!(item.account_id, "github-account");
        assert_eq!(item.provider_base_url, "https://github.com");
        assert_eq!(item.remote_name, "origin");
        assert_eq!(item.title, "Add provider panel");
        assert_eq!(item.author.as_deref(), Some("octocat"));
        assert_eq!(
            item.source_branch.as_deref(),
            Some("feature/provider-panel")
        );
        assert_eq!(item.target_branch.as_deref(), Some("main"));
        assert_eq!(item.state, "open");
        assert_eq!(
            item.web_url.as_deref(),
            Some("https://github.com/acme/workbench/pull/17")
        );
        assert_eq!(item.check_status, ProviderCheckStatus::Unknown);
        assert_eq!(items[0].head_sha.as_deref(), Some("abc123"));
        Ok(())
    }

    #[test]
    fn parses_github_check_runs_json() -> Result<(), Box<dyn Error>> {
        let status = parse_github_check_runs_json(
            r#"{
  "check_runs": [
    {
      "status": "completed",
      "conclusion": "success",
      "html_url": "https://github.com/acme/workbench/runs/1"
    }
  ]
}"#,
        )?;

        assert_eq!(status.check_status, ProviderCheckStatus::Success);
        assert_eq!(
            status.ci_url.as_deref(),
            Some("https://github.com/acme/workbench/runs/1")
        );
        Ok(())
    }

    #[test]
    fn parses_gitlab_merge_requests_json() -> Result<(), Box<dyn Error>> {
        let items = parse_gitlab_merge_requests_json(
            &remote(RemoteProviderKind::Gitlab),
            "gitlab-account",
            "https://gitlab.com",
            r#"[
  {
    "id": 771,
    "iid": 23,
    "title": "Add provider panel",
    "state": "opened",
    "web_url": "https://gitlab.com/acme/workbench/-/merge_requests/23",
    "author": { "username": "gitlab-user" },
    "source_branch": "feature/provider-panel",
    "target_branch": "main"
  }
]"#,
        )?;

        assert_eq!(items.len(), 1);
        let item = &items[0].item;
        assert_eq!(item.id, "gitlab:origin:23");
        assert_eq!(item.provider_kind, ProviderKind::Gitlab);
        assert_eq!(item.account_id, "gitlab-account");
        assert_eq!(item.provider_base_url, "https://gitlab.com");
        assert_eq!(item.remote_name, "origin");
        assert_eq!(item.title, "Add provider panel");
        assert_eq!(item.author.as_deref(), Some("gitlab-user"));
        assert_eq!(
            item.source_branch.as_deref(),
            Some("feature/provider-panel")
        );
        assert_eq!(item.target_branch.as_deref(), Some("main"));
        assert_eq!(item.state, "opened");
        assert_eq!(
            item.web_url.as_deref(),
            Some("https://gitlab.com/acme/workbench/-/merge_requests/23")
        );
        assert_eq!(item.check_status, ProviderCheckStatus::Unknown);
        assert_eq!(items[0].iid, 23);
        Ok(())
    }

    #[test]
    fn parses_gitlab_pipeline_json() -> Result<(), Box<dyn Error>> {
        let status = parse_gitlab_pipelines_json(
            r#"[
  {
    "id": 991,
    "status": "running",
    "web_url": "https://gitlab.com/acme/workbench/-/pipelines/991"
  }
]"#,
        )?;

        assert_eq!(status.check_status, ProviderCheckStatus::Running);
        assert_eq!(
            status.ci_url.as_deref(),
            Some("https://gitlab.com/acme/workbench/-/pipelines/991")
        );
        Ok(())
    }

    #[test]
    fn returns_clear_message_when_no_matching_account_token_exists() {
        let list = missing_provider_account_list(&[remote(RemoteProviderKind::Github)]);

        assert_eq!(list.items, Vec::<ProviderWorkItem>::new());
        assert_eq!(
            list.message,
            "No matching provider account/token configured for detected provider remotes."
        );
    }

    fn remote(provider_kind: RemoteProviderKind) -> ProviderRemote {
        ProviderRemote {
            remote_name: String::from("origin"),
            provider_kind,
            host: Some(String::from("github.com")),
            owner: Some(String::from("acme")),
            repository: Some(String::from("workbench")),
            fetch_url: Some(String::from("https://github.com/acme/workbench.git")),
            push_url: None,
            web_url: Some(String::from("https://github.com/acme/workbench")),
        }
    }
}
