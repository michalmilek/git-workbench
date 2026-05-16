use std::{collections::BTreeMap, path::Path, time::Duration};

use reqwest::{
    Client,
    header::{AUTHORIZATION, LINK, USER_AGENT},
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
    provider_work_items::ProviderCheckStatus,
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderReviewDetails {
    pub item_id: String,
    pub provider_kind: ProviderKind,
    pub provider_base_url: String,
    pub remote_name: String,
    pub title: String,
    pub author: Option<String>,
    pub source_branch: Option<String>,
    pub target_branch: Option<String>,
    pub state: String,
    pub web_url: Option<String>,
    pub check_status: ProviderCheckStatus,
    pub files: Vec<ProviderReviewFile>,
    pub threads: Vec<ProviderReviewThread>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderReviewFile {
    pub path: String,
    pub previous_path: Option<String>,
    pub status: Option<String>,
    pub additions: Option<u64>,
    pub deletions: Option<u64>,
    pub patch: Option<String>,
    pub too_large: bool,
    pub collapsed: bool,
    pub position: Option<ProviderReviewPosition>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderReviewThread {
    pub id: String,
    pub path: Option<String>,
    pub line: Option<u64>,
    pub resolved: bool,
    pub comments: Vec<ProviderReviewComment>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderReviewComment {
    pub id: String,
    pub author: Option<String>,
    pub body: String,
    pub created_at: Option<String>,
    pub system: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderReviewPosition {
    pub provider_kind: ProviderKind,
    pub path: Option<String>,
    pub line: Option<u64>,
    pub side: Option<String>,
    pub old_path: Option<String>,
    pub old_line: Option<u64>,
    pub new_line: Option<u64>,
    pub position_type: Option<String>,
    pub base_sha: Option<String>,
    pub start_sha: Option<String>,
    pub head_sha: Option<String>,
}

struct ReviewSource {
    remote: ProviderRemote,
    account: ProviderAccountToken,
}

struct ReviewItemId {
    provider_kind: ProviderKind,
    remote_name: String,
    number: u64,
}

struct RemoteProject<'a> {
    owner: &'a str,
    repository: &'a str,
}

/// Returns read-only PR/MR review details for a provider work item.
///
/// # Errors
///
/// Returns an operation error when the selected item, provider account, remote,
/// or provider API response cannot be resolved.
#[tauri::command]
pub async fn get_provider_review_details(
    app_handle: AppHandle,
    repository_path: String,
    item_id: String,
    account_id: String,
) -> Result<ProviderReviewDetails, OperationError> {
    let parsed_item_id = parse_review_item_id(&item_id)?;
    let source = provider_review_source_for_item(
        &app_handle,
        Path::new(&repository_path),
        &parsed_item_id,
        &account_id,
    )?;
    let client = Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| operation_error("failed to create provider HTTP client", error))?;

    match parsed_item_id.provider_kind {
        ProviderKind::Github => {
            fetch_github_review_details(&client, &source, &parsed_item_id, &item_id).await
        }
        ProviderKind::Gitlab | ProviderKind::CustomGitlab => {
            fetch_gitlab_review_details(&client, &source, &parsed_item_id, &item_id).await
        }
    }
}

fn provider_review_source_for_item(
    app_handle: &AppHandle,
    repository_path: &Path,
    item_id: &ReviewItemId,
    account_id: &str,
) -> Result<ReviewSource, OperationError> {
    let remotes = provider::list_provider_remotes(repository_path)?;
    let Some(remote) = remotes
        .remotes
        .into_iter()
        .find(|remote| remote.remote_name == item_id.remote_name)
    else {
        return Err(OperationError::parse(
            "selected provider work item remote not found",
        ));
    };
    if provider_kind_for_remote(remote.provider_kind) != Some(item_id.provider_kind) {
        return Err(OperationError::parse(
            "selected provider work item does not match remote provider",
        ));
    }
    let Some(account) =
        provider_accounts::find_provider_account_token_by_id(app_handle, account_id)?
    else {
        return Err(OperationError::parse(
            "no provider account/token configured for selected provider work item",
        ));
    };
    if account.provider_kind() != item_id.provider_kind {
        return Err(OperationError::parse(
            "selected provider account does not match provider work item",
        ));
    }

    Ok(ReviewSource { remote, account })
}

async fn fetch_github_review_details(
    client: &Client,
    source: &ReviewSource,
    item_id: &ReviewItemId,
    raw_item_id: &str,
) -> Result<ProviderReviewDetails, OperationError> {
    let Some(project) = remote_project(&source.remote) else {
        return Err(OperationError::parse(
            "selected provider remote has no project path",
        ));
    };
    let pull_request_url =
        build_github_pull_request_url(project.owner, project.repository, item_id.number);
    let files_url =
        build_github_pull_request_files_url(project.owner, project.repository, item_id.number);
    let comments_url = build_github_pull_request_review_comments_url(
        project.owner,
        project.repository,
        item_id.number,
    );
    let issue_comments_url = build_github_pull_request_issue_comments_url(
        project.owner,
        project.repository,
        item_id.number,
    );
    let reviews_url =
        build_github_pull_request_reviews_url(project.owner, project.repository, item_id.number);

    let pull_request_json =
        fetch_provider_json(client, &pull_request_url, source.account.token()).await?;
    let files_json =
        fetch_provider_json_array_pages(client, &files_url, source.account.token()).await?;
    let comments_json =
        fetch_provider_json_array_pages(client, &comments_url, source.account.token()).await?;
    let issue_comments_json =
        fetch_provider_json_array_pages(client, &issue_comments_url, source.account.token())
            .await?;
    let reviews_json =
        fetch_provider_json_array_pages(client, &reviews_url, source.account.token()).await?;
    let pull_request = parse_github_pull_request_json(&pull_request_json)?;
    let mut threads = parse_github_issue_comments_json(item_id.number, &issue_comments_json)?;
    threads.append(&mut parse_github_reviews_json(&reviews_json)?);
    threads.append(&mut parse_github_review_comments_json(&comments_json)?);

    Ok(ProviderReviewDetails {
        item_id: raw_item_id.to_owned(),
        provider_kind: ProviderKind::Github,
        provider_base_url: source.account.base_url().to_owned(),
        remote_name: source.remote.remote_name.clone(),
        title: pull_request.title,
        author: pull_request.user.map(|user| user.login),
        source_branch: pull_request.head.and_then(|head| head.branch_ref),
        target_branch: pull_request.base.and_then(|base| base.branch_ref),
        state: pull_request.state,
        web_url: pull_request.html_url,
        check_status: ProviderCheckStatus::Unknown,
        files: parse_github_pull_request_files_json(&files_json)?,
        threads,
        message: String::from("Loaded provider review details."),
    })
}

async fn fetch_gitlab_review_details(
    client: &Client,
    source: &ReviewSource,
    item_id: &ReviewItemId,
    raw_item_id: &str,
) -> Result<ProviderReviewDetails, OperationError> {
    let Some(project) = remote_project(&source.remote) else {
        return Err(OperationError::parse(
            "selected provider remote has no project path",
        ));
    };
    let merge_request_url = build_gitlab_merge_request_url(
        source.account.base_url(),
        project.owner,
        project.repository,
        item_id.number,
    );
    let diffs_url = build_gitlab_merge_request_diffs_url(
        source.account.base_url(),
        project.owner,
        project.repository,
        item_id.number,
    );
    let discussions_url = build_gitlab_merge_request_discussions_url(
        source.account.base_url(),
        project.owner,
        project.repository,
        item_id.number,
    );

    let merge_request_json =
        fetch_provider_json(client, &merge_request_url, source.account.token()).await?;
    let diffs_json =
        fetch_provider_json_array_pages(client, &diffs_url, source.account.token()).await?;
    let discussions_json =
        fetch_provider_json_array_pages(client, &discussions_url, source.account.token()).await?;
    let merge_request = parse_gitlab_merge_request_json(&merge_request_json)?;
    let provider_kind = item_id.provider_kind;

    Ok(ProviderReviewDetails {
        item_id: raw_item_id.to_owned(),
        provider_kind,
        provider_base_url: source.account.base_url().to_owned(),
        remote_name: source.remote.remote_name.clone(),
        title: merge_request.title,
        author: merge_request.author.map(|author| author.username),
        source_branch: merge_request.source_branch,
        target_branch: merge_request.target_branch,
        state: merge_request.state,
        web_url: merge_request.web_url,
        check_status: ProviderCheckStatus::Unknown,
        files: parse_gitlab_merge_request_diffs_json(provider_kind, &diffs_json)?,
        threads: parse_gitlab_discussions_json(&discussions_json)?,
        message: String::from("Loaded provider review details."),
    })
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

async fn fetch_provider_json_array_pages(
    client: &Client,
    url: &str,
    token: &str,
) -> Result<String, OperationError> {
    let mut next_url = Some(url.to_owned());
    let mut values = Vec::new();

    while let Some(current_url) = next_url {
        let response = client
            .get(&current_url)
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

        next_url = response
            .headers()
            .get(LINK)
            .and_then(|value| value.to_str().ok())
            .and_then(next_link_url);
        let text = response
            .text()
            .await
            .map_err(|error| operation_error("failed to read provider response", error))?;
        let mut page_values: Vec<serde_json::Value> = serde_json::from_str(&text)
            .map_err(|error| operation_error("failed to parse provider JSON page", error))?;
        values.append(&mut page_values);
    }

    serde_json::to_string(&values)
        .map_err(|error| operation_error("failed to encode provider JSON pages", error))
}

fn next_link_url(link_header: &str) -> Option<String> {
    for link in link_header.split(',') {
        let mut segments = link.split(';').map(str::trim);
        let url = segments.next()?;
        if segments.any(|segment| segment == r#"rel="next""#) {
            return url
                .strip_prefix('<')
                .and_then(|value| value.strip_suffix('>'))
                .map(str::to_owned);
        }
    }

    None
}

fn parse_review_item_id(item_id: &str) -> Result<ReviewItemId, OperationError> {
    let mut parts = item_id.splitn(3, ':');
    let Some(provider_kind) = parts.next().and_then(parse_provider_kind_prefix) else {
        return Err(OperationError::parse("unsupported provider review item id"));
    };
    let Some(remote_name) = parts.next() else {
        return Err(OperationError::parse(
            "provider review item id is missing remote",
        ));
    };
    let Some(number) = parts.next() else {
        return Err(OperationError::parse(
            "provider review item id is missing number",
        ));
    };
    let number = number
        .parse::<u64>()
        .map_err(|error| operation_error("invalid provider review item number", error))?;

    Ok(ReviewItemId {
        provider_kind,
        remote_name: remote_name.to_owned(),
        number,
    })
}

fn parse_provider_kind_prefix(value: &str) -> Option<ProviderKind> {
    match value {
        "github" => Some(ProviderKind::Github),
        "gitlab" => Some(ProviderKind::Gitlab),
        "customGitlab" => Some(ProviderKind::CustomGitlab),
        _ => None,
    }
}

fn build_github_pull_request_url(owner: &str, repository: &str, number: u64) -> String {
    format!("https://api.github.com/repos/{owner}/{repository}/pulls/{number}")
}

fn build_github_pull_request_files_url(owner: &str, repository: &str, number: u64) -> String {
    format!("https://api.github.com/repos/{owner}/{repository}/pulls/{number}/files?per_page=100")
}

fn build_github_pull_request_review_comments_url(
    owner: &str,
    repository: &str,
    number: u64,
) -> String {
    format!(
        "https://api.github.com/repos/{owner}/{repository}/pulls/{number}/comments?per_page=100"
    )
}

fn build_github_pull_request_issue_comments_url(
    owner: &str,
    repository: &str,
    number: u64,
) -> String {
    format!(
        "https://api.github.com/repos/{owner}/{repository}/issues/{number}/comments?per_page=100"
    )
}

fn build_github_pull_request_reviews_url(owner: &str, repository: &str, number: u64) -> String {
    format!("https://api.github.com/repos/{owner}/{repository}/pulls/{number}/reviews?per_page=100")
}

fn build_gitlab_merge_request_url(
    base_url: &str,
    owner: &str,
    repository: &str,
    merge_request_iid: u64,
) -> String {
    let project_path = project_path_relative_to_base_url(base_url, owner, repository);
    format!(
        "{}/api/v4/projects/{}/merge_requests/{merge_request_iid}",
        normalized_base_url(base_url),
        encoded_gitlab_project_path(&project_path)
    )
}

fn build_gitlab_merge_request_diffs_url(
    base_url: &str,
    owner: &str,
    repository: &str,
    merge_request_iid: u64,
) -> String {
    let project_path = project_path_relative_to_base_url(base_url, owner, repository);
    format!(
        "{}/api/v4/projects/{}/merge_requests/{merge_request_iid}/diffs?per_page=100",
        normalized_base_url(base_url),
        encoded_gitlab_project_path(&project_path)
    )
}

fn build_gitlab_merge_request_discussions_url(
    base_url: &str,
    owner: &str,
    repository: &str,
    merge_request_iid: u64,
) -> String {
    let project_path = project_path_relative_to_base_url(base_url, owner, repository);
    format!(
        "{}/api/v4/projects/{}/merge_requests/{merge_request_iid}/discussions?per_page=100",
        normalized_base_url(base_url),
        encoded_gitlab_project_path(&project_path)
    )
}

fn parse_github_pull_request_json(json: &str) -> Result<GithubPullRequest, OperationError> {
    serde_json::from_str(json)
        .map_err(|error| operation_error("failed to parse GitHub pull request", error))
}

fn parse_github_pull_request_files_json(
    json: &str,
) -> Result<Vec<ProviderReviewFile>, OperationError> {
    let files: Vec<GithubPullRequestFile> = serde_json::from_str(json)
        .map_err(|error| operation_error("failed to parse GitHub pull request files", error))?;

    Ok(files
        .into_iter()
        .map(|file| ProviderReviewFile {
            position: Some(ProviderReviewPosition {
                provider_kind: ProviderKind::Github,
                path: Some(file.filename.clone()),
                line: None,
                side: Some(String::from("RIGHT")),
                old_path: file.previous_filename.clone(),
                old_line: None,
                new_line: None,
                position_type: Some(String::from("text")),
                base_sha: None,
                start_sha: None,
                head_sha: None,
            }),
            path: file.filename,
            previous_path: file.previous_filename,
            status: Some(file.status),
            additions: Some(file.additions),
            deletions: Some(file.deletions),
            patch: file.patch,
            too_large: false,
            collapsed: false,
        })
        .collect())
}

fn parse_github_review_comments_json(
    json: &str,
) -> Result<Vec<ProviderReviewThread>, OperationError> {
    let comments: Vec<GithubReviewComment> = serde_json::from_str(json)
        .map_err(|error| operation_error("failed to parse GitHub review comments", error))?;
    let mut threads = Vec::new();
    let mut thread_indexes = BTreeMap::new();

    for comment in comments
        .iter()
        .filter(|comment| comment.in_reply_to_id.is_none())
    {
        thread_indexes.insert(comment.id, threads.len());
        threads.push(github_review_thread_from_comment(comment));
    }

    for comment in comments
        .iter()
        .filter(|comment| comment.in_reply_to_id.is_some())
    {
        let Some(parent_id) = comment.in_reply_to_id else {
            continue;
        };
        if let Some(index) = thread_indexes.get(&parent_id) {
            threads[*index]
                .comments
                .push(github_review_comment_to_provider(comment));
        } else {
            threads.push(github_review_thread_from_comment(comment));
        }
    }

    Ok(threads)
}

fn github_review_thread_from_comment(comment: &GithubReviewComment) -> ProviderReviewThread {
    ProviderReviewThread {
        id: format!("github-review-comment:{}", comment.id),
        path: Some(comment.path.clone()),
        line: comment.line.or(comment.original_line),
        resolved: false,
        comments: vec![github_review_comment_to_provider(comment)],
    }
}

fn github_review_comment_to_provider(comment: &GithubReviewComment) -> ProviderReviewComment {
    ProviderReviewComment {
        id: comment.id.to_string(),
        author: comment.user.as_ref().map(|user| user.login.clone()),
        body: comment.body.clone(),
        created_at: comment.created_at.clone(),
        system: false,
    }
}

fn parse_github_issue_comments_json(
    pull_request_number: u64,
    json: &str,
) -> Result<Vec<ProviderReviewThread>, OperationError> {
    let comments: Vec<GithubIssueComment> = serde_json::from_str(json)
        .map_err(|error| operation_error("failed to parse GitHub issue comments", error))?;
    if comments.is_empty() {
        return Ok(Vec::new());
    }

    Ok(vec![ProviderReviewThread {
        id: format!("github-issue-comments:{pull_request_number}"),
        path: None,
        line: None,
        resolved: false,
        comments: comments
            .into_iter()
            .map(|comment| ProviderReviewComment {
                id: comment.id.to_string(),
                author: comment.user.map(|user| user.login),
                body: comment.body,
                created_at: comment.created_at,
                system: false,
            })
            .collect(),
    }])
}

fn parse_github_reviews_json(json: &str) -> Result<Vec<ProviderReviewThread>, OperationError> {
    let reviews: Vec<GithubReview> = serde_json::from_str(json)
        .map_err(|error| operation_error("failed to parse GitHub reviews", error))?;

    Ok(reviews
        .into_iter()
        .filter_map(|review| {
            let body = review.body.unwrap_or_default();
            if body.trim().is_empty() {
                return None;
            }

            Some(ProviderReviewThread {
                id: format!("github-review:{}", review.id),
                path: None,
                line: None,
                resolved: false,
                comments: vec![ProviderReviewComment {
                    id: review.id.to_string(),
                    author: review.user.map(|user| user.login),
                    body,
                    created_at: review.submitted_at,
                    system: false,
                }],
            })
        })
        .collect())
}

fn parse_gitlab_merge_request_json(json: &str) -> Result<GitlabMergeRequest, OperationError> {
    serde_json::from_str(json)
        .map_err(|error| operation_error("failed to parse GitLab merge request", error))
}

fn parse_gitlab_merge_request_diffs_json(
    provider_kind: ProviderKind,
    json: &str,
) -> Result<Vec<ProviderReviewFile>, OperationError> {
    let diffs: Vec<GitlabMergeRequestDiff> = serde_json::from_str(json)
        .map_err(|error| operation_error("failed to parse GitLab merge request diffs", error))?;

    Ok(diffs
        .into_iter()
        .map(|diff| {
            let status = gitlab_diff_status(&diff);
            ProviderReviewFile {
                position: Some(ProviderReviewPosition {
                    provider_kind,
                    path: Some(diff.new_path.clone()),
                    line: None,
                    side: Some(String::from("new")),
                    old_path: Some(diff.old_path.clone()),
                    old_line: None,
                    new_line: None,
                    position_type: Some(String::from("text")),
                    base_sha: None,
                    start_sha: None,
                    head_sha: None,
                }),
                path: diff.new_path,
                previous_path: Some(diff.old_path),
                status: Some(status),
                additions: None,
                deletions: None,
                patch: diff.diff,
                too_large: diff.too_large.unwrap_or(false),
                collapsed: diff.collapsed.unwrap_or(false),
            }
        })
        .collect())
}

fn parse_gitlab_discussions_json(json: &str) -> Result<Vec<ProviderReviewThread>, OperationError> {
    let discussions: Vec<GitlabDiscussion> = serde_json::from_str(json)
        .map_err(|error| operation_error("failed to parse GitLab discussions", error))?;

    Ok(discussions
        .into_iter()
        .filter_map(|discussion| {
            let first_note = discussion.notes.first()?;
            let position = first_note.position.as_ref();
            let path = position.and_then(GitlabPosition::path);
            let line = position.and_then(GitlabPosition::line);
            let resolved = discussion
                .notes
                .iter()
                .filter(|note| note.resolvable.unwrap_or(false))
                .all(|note| note.resolved.unwrap_or(false));

            Some(ProviderReviewThread {
                id: discussion.id,
                path,
                line,
                resolved,
                comments: discussion
                    .notes
                    .into_iter()
                    .map(|note| ProviderReviewComment {
                        id: note.id.to_string(),
                        author: note.author.map(|author| author.username),
                        body: note.body,
                        created_at: note.created_at,
                        system: note.system.unwrap_or(false),
                    })
                    .collect(),
            })
        })
        .collect())
}

fn gitlab_diff_status(diff: &GitlabMergeRequestDiff) -> String {
    if diff.deleted_file.unwrap_or(false) {
        return String::from("deleted");
    }
    if diff.renamed_file.unwrap_or(false) {
        return String::from("renamed");
    }
    if diff.new_file.unwrap_or(false) {
        return String::from("added");
    }

    String::from("modified")
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
}

#[derive(Deserialize)]
struct GithubPullRequestFile {
    filename: String,
    previous_filename: Option<String>,
    status: String,
    additions: u64,
    deletions: u64,
    patch: Option<String>,
}

#[derive(Deserialize)]
struct GithubReviewComment {
    id: u64,
    path: String,
    line: Option<u64>,
    original_line: Option<u64>,
    body: String,
    created_at: Option<String>,
    user: Option<GithubUser>,
    in_reply_to_id: Option<u64>,
}

#[derive(Deserialize)]
struct GithubIssueComment {
    id: u64,
    body: String,
    created_at: Option<String>,
    user: Option<GithubUser>,
}

#[derive(Deserialize)]
struct GithubReview {
    id: u64,
    body: Option<String>,
    submitted_at: Option<String>,
    user: Option<GithubUser>,
}

#[derive(Deserialize)]
struct GitlabMergeRequest {
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
struct GitlabMergeRequestDiff {
    old_path: String,
    new_path: String,
    diff: Option<String>,
    new_file: Option<bool>,
    renamed_file: Option<bool>,
    deleted_file: Option<bool>,
    too_large: Option<bool>,
    collapsed: Option<bool>,
}

#[derive(Deserialize)]
struct GitlabDiscussion {
    id: String,
    notes: Vec<GitlabNote>,
}

#[derive(Deserialize)]
struct GitlabNote {
    id: u64,
    body: String,
    created_at: Option<String>,
    system: Option<bool>,
    resolvable: Option<bool>,
    resolved: Option<bool>,
    author: Option<GitlabAuthor>,
    position: Option<GitlabPosition>,
}

#[derive(Deserialize)]
struct GitlabPosition {
    old_path: Option<String>,
    new_path: Option<String>,
    old_line: Option<u64>,
    new_line: Option<u64>,
}

impl GitlabPosition {
    fn path(&self) -> Option<String> {
        self.new_path.clone().or_else(|| self.old_path.clone())
    }

    const fn line(&self) -> Option<u64> {
        match (self.new_line, self.old_line) {
            (Some(line), _) | (None, Some(line)) => Some(line),
            (None, None) => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use serde_json::json;

    use crate::{
        provider_accounts::ProviderKind,
        provider_reviews::{
            ProviderReviewDetails, ProviderReviewFile, ProviderReviewPosition,
            ProviderReviewThread, build_github_pull_request_files_url,
            build_github_pull_request_issue_comments_url, build_github_pull_request_reviews_url,
            build_gitlab_merge_request_diffs_url, next_link_url, parse_github_issue_comments_json,
            parse_github_review_comments_json, parse_github_reviews_json,
            parse_gitlab_discussions_json,
        },
        provider_work_items::ProviderCheckStatus,
    };

    #[test]
    fn builds_github_pull_request_files_url() {
        assert_eq!(
            build_github_pull_request_files_url("openai", "codex", 42),
            "https://api.github.com/repos/openai/codex/pulls/42/files?per_page=100"
        );
    }

    #[test]
    fn builds_github_pull_request_top_level_comment_urls() {
        assert_eq!(
            build_github_pull_request_issue_comments_url("openai", "codex", 42),
            "https://api.github.com/repos/openai/codex/issues/42/comments?per_page=100"
        );
        assert_eq!(
            build_github_pull_request_reviews_url("openai", "codex", 42),
            "https://api.github.com/repos/openai/codex/pulls/42/reviews?per_page=100"
        );
    }

    #[test]
    fn parses_github_review_comment_json() -> Result<(), Box<dyn Error>> {
        let threads = parse_github_review_comments_json(
            r#"[
  {
    "id": 1001,
    "path": "src/lib.rs",
    "line": 12,
    "side": "RIGHT",
    "body": "Looks right",
    "created_at": "2026-05-16T10:00:00Z",
    "user": { "login": "octocat" },
    "position": 4,
    "commit_id": "head-sha",
    "original_commit_id": "base-sha"
  }
]"#,
        )?;

        assert_eq!(
            threads,
            vec![ProviderReviewThread {
                id: String::from("github-review-comment:1001"),
                path: Some(String::from("src/lib.rs")),
                line: Some(12),
                resolved: false,
                comments: vec![crate::provider_reviews::ProviderReviewComment {
                    id: String::from("1001"),
                    author: Some(String::from("octocat")),
                    body: String::from("Looks right"),
                    created_at: Some(String::from("2026-05-16T10:00:00Z")),
                    system: false,
                }],
            }]
        );
        Ok(())
    }

    #[test]
    fn groups_github_review_replies_into_parent_threads() -> Result<(), Box<dyn Error>> {
        let threads = parse_github_review_comments_json(
            r#"[
  {
    "id": 1001,
    "path": "src/lib.rs",
    "line": 12,
    "body": "Please adjust this",
    "created_at": "2026-05-16T10:00:00Z",
    "user": { "login": "octocat" }
  },
  {
    "id": 1002,
    "path": "src/lib.rs",
    "line": 12,
    "body": "Done",
    "created_at": "2026-05-16T10:10:00Z",
    "user": { "login": "contributor" },
    "in_reply_to_id": 1001
  }
]"#,
        )?;

        assert_eq!(
            threads,
            vec![ProviderReviewThread {
                id: String::from("github-review-comment:1001"),
                path: Some(String::from("src/lib.rs")),
                line: Some(12),
                resolved: false,
                comments: vec![
                    crate::provider_reviews::ProviderReviewComment {
                        id: String::from("1001"),
                        author: Some(String::from("octocat")),
                        body: String::from("Please adjust this"),
                        created_at: Some(String::from("2026-05-16T10:00:00Z")),
                        system: false,
                    },
                    crate::provider_reviews::ProviderReviewComment {
                        id: String::from("1002"),
                        author: Some(String::from("contributor")),
                        body: String::from("Done"),
                        created_at: Some(String::from("2026-05-16T10:10:00Z")),
                        system: false,
                    },
                ],
            }]
        );
        Ok(())
    }

    #[test]
    fn parses_github_issue_comments_as_top_level_thread() -> Result<(), Box<dyn Error>> {
        let threads = parse_github_issue_comments_json(
            42,
            r#"[
  {
    "id": 2001,
    "body": "Top-level question",
    "created_at": "2026-05-16T10:20:00Z",
    "user": { "login": "reviewer" }
  },
  {
    "id": 2002,
    "body": "Top-level answer",
    "created_at": "2026-05-16T10:25:00Z",
    "user": { "login": "author" }
  }
]"#,
        )?;

        assert_eq!(
            threads,
            vec![ProviderReviewThread {
                id: String::from("github-issue-comments:42"),
                path: None,
                line: None,
                resolved: false,
                comments: vec![
                    crate::provider_reviews::ProviderReviewComment {
                        id: String::from("2001"),
                        author: Some(String::from("reviewer")),
                        body: String::from("Top-level question"),
                        created_at: Some(String::from("2026-05-16T10:20:00Z")),
                        system: false,
                    },
                    crate::provider_reviews::ProviderReviewComment {
                        id: String::from("2002"),
                        author: Some(String::from("author")),
                        body: String::from("Top-level answer"),
                        created_at: Some(String::from("2026-05-16T10:25:00Z")),
                        system: false,
                    },
                ],
            }]
        );
        Ok(())
    }

    #[test]
    fn parses_github_review_summaries_as_top_level_threads() -> Result<(), Box<dyn Error>> {
        let threads = parse_github_reviews_json(
            r#"[
  {
    "id": 3001,
    "body": "Approved with one note",
    "state": "APPROVED",
    "submitted_at": "2026-05-16T10:30:00Z",
    "user": { "login": "maintainer" }
  },
  {
    "id": 3002,
    "body": "",
    "state": "COMMENTED",
    "submitted_at": "2026-05-16T10:35:00Z",
    "user": { "login": "maintainer" }
  }
]"#,
        )?;

        assert_eq!(
            threads,
            vec![ProviderReviewThread {
                id: String::from("github-review:3001"),
                path: None,
                line: None,
                resolved: false,
                comments: vec![crate::provider_reviews::ProviderReviewComment {
                    id: String::from("3001"),
                    author: Some(String::from("maintainer")),
                    body: String::from("Approved with one note"),
                    created_at: Some(String::from("2026-05-16T10:30:00Z")),
                    system: false,
                }],
            }]
        );
        Ok(())
    }

    #[test]
    fn extracts_next_provider_link_url() {
        assert_eq!(
            next_link_url(
                r#"<https://api.github.com/repos/openai/codex/pulls/42/files?page=2>; rel="next", <https://api.github.com/repos/openai/codex/pulls/42/files?page=4>; rel="last""#
            ),
            Some(String::from(
                "https://api.github.com/repos/openai/codex/pulls/42/files?page=2"
            ))
        );
        assert_eq!(
            next_link_url(
                r#"<https://api.github.com/repos/openai/codex/pulls/42/files?page=4>; rel="last""#
            ),
            None
        );
    }

    #[test]
    fn builds_gitlab_merge_request_diffs_url_with_encoded_project_path() {
        assert_eq!(
            build_gitlab_merge_request_diffs_url(
                "https://gitlab.com/",
                "platform/sub group",
                "workbench",
                17
            ),
            "https://gitlab.com/api/v4/projects/platform%2Fsub%20group%2Fworkbench/merge_requests/17/diffs?per_page=100"
        );
    }

    #[test]
    fn parses_gitlab_discussions_json() -> Result<(), Box<dyn Error>> {
        let threads = parse_gitlab_discussions_json(
            r#"[
  {
    "id": "abc123",
    "individual_note": false,
    "notes": [
      {
        "id": 55,
        "body": "Please adjust this",
        "created_at": "2026-05-16T10:00:00Z",
        "system": false,
        "resolvable": true,
        "resolved": true,
        "author": { "username": "gitlab-user" },
        "position": {
          "position_type": "text",
          "new_path": "src/main.rs",
          "new_line": 22,
          "base_sha": "base",
          "start_sha": "start",
          "head_sha": "head"
        }
      }
    ]
  }
]"#,
        )?;

        assert_eq!(
            threads,
            vec![ProviderReviewThread {
                id: String::from("abc123"),
                path: Some(String::from("src/main.rs")),
                line: Some(22),
                resolved: true,
                comments: vec![crate::provider_reviews::ProviderReviewComment {
                    id: String::from("55"),
                    author: Some(String::from("gitlab-user")),
                    body: String::from("Please adjust this"),
                    created_at: Some(String::from("2026-05-16T10:00:00Z")),
                    system: false,
                }],
            }]
        );
        Ok(())
    }

    #[test]
    fn serializes_review_details_as_camel_case_without_tokens() -> Result<(), Box<dyn Error>> {
        let details = ProviderReviewDetails {
            item_id: String::from("github:origin:42"),
            provider_kind: ProviderKind::Github,
            provider_base_url: String::from("https://github.com"),
            remote_name: String::from("origin"),
            title: String::from("Review read model"),
            author: Some(String::from("octocat")),
            source_branch: Some(String::from("feature/review")),
            target_branch: Some(String::from("main")),
            state: String::from("open"),
            web_url: Some(String::from("https://github.com/acme/workbench/pull/42")),
            check_status: ProviderCheckStatus::Success,
            files: vec![ProviderReviewFile {
                path: String::from("src/lib.rs"),
                previous_path: None,
                status: Some(String::from("modified")),
                additions: Some(4),
                deletions: Some(1),
                patch: Some(String::from("@@ -1 +1 @@")),
                too_large: false,
                collapsed: false,
                position: Some(ProviderReviewPosition {
                    provider_kind: ProviderKind::Github,
                    path: Some(String::from("src/lib.rs")),
                    line: Some(12),
                    side: Some(String::from("RIGHT")),
                    old_path: None,
                    old_line: None,
                    new_line: Some(12),
                    position_type: Some(String::from("text")),
                    base_sha: Some(String::from("base")),
                    start_sha: None,
                    head_sha: Some(String::from("head")),
                }),
            }],
            threads: Vec::new(),
            message: String::from("Loaded provider review details."),
        };
        let value = serde_json::to_value(details)?;
        let encoded = serde_json::to_string(&value)?;

        assert_eq!(
            value,
            json!({
                "itemId": "github:origin:42",
                "providerKind": "github",
                "providerBaseUrl": "https://github.com",
                "remoteName": "origin",
                "title": "Review read model",
                "author": "octocat",
                "sourceBranch": "feature/review",
                "targetBranch": "main",
                "state": "open",
                "webUrl": "https://github.com/acme/workbench/pull/42",
                "checkStatus": "success",
                "files": [{
                    "path": "src/lib.rs",
                    "previousPath": null,
                    "status": "modified",
                    "additions": 4,
                    "deletions": 1,
                    "patch": "@@ -1 +1 @@",
                    "tooLarge": false,
                    "collapsed": false,
                    "position": {
                        "providerKind": "github",
                        "path": "src/lib.rs",
                        "line": 12,
                        "side": "RIGHT",
                        "oldPath": null,
                        "oldLine": null,
                        "newLine": 12,
                        "positionType": "text",
                        "baseSha": "base",
                        "startSha": null,
                        "headSha": "head"
                    }
                }],
                "threads": [],
                "message": "Loaded provider review details."
            })
        );
        assert!(!encoded.contains("secret-token"));
        assert!(!encoded.contains("token"));
        Ok(())
    }
}
