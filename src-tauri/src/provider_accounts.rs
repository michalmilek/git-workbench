use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    time::Duration,
};

use keyring::{Entry, Error as KeyringError};
use reqwest::{
    Client,
    header::{AUTHORIZATION, USER_AGENT},
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::{git::GitOperationResult, operation_error::OperationError};

const METADATA_FILE_NAME: &str = "provider_accounts.json";
const KEYCHAIN_SERVICE_NAME: &str = "git-workbench.provider-accounts";
const USER_AGENT_VALUE: &str = "git-workbench";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProviderKind {
    Github,
    Gitlab,
    CustomGitlab,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAccount {
    pub id: String,
    pub provider_kind: ProviderKind,
    pub base_url: String,
    pub label: String,
    pub token_configured: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAccountInput {
    pub provider_kind: ProviderKind,
    pub base_url: String,
    pub label: String,
    pub token: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConnectionResult {
    pub account_id: String,
    pub ok: bool,
    pub status_code: Option<u16>,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderAccountStore {
    accounts: Vec<ProviderAccountMetadata>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderAccountMetadata {
    id: String,
    provider_kind: ProviderKind,
    base_url: String,
    label: String,
}

impl ProviderAccountMetadata {
    fn from_input(input: &ProviderAccountInput) -> Result<Self, OperationError> {
        let base_url = normalized_base_url(&input.base_url);
        validate_https_base_url(&base_url)?;

        Self {
            id: account_id(input.provider_kind, &base_url, &input.label),
            provider_kind: input.provider_kind,
            base_url,
            label: input.label.clone(),
        }
        .validated()
    }

    fn into_account(self, token_configured: bool) -> ProviderAccount {
        ProviderAccount {
            id: self.id,
            provider_kind: self.provider_kind,
            base_url: self.base_url,
            label: self.label,
            token_configured,
        }
    }

    fn validated(self) -> Result<Self, OperationError> {
        validate_https_base_url(&self.base_url)?;
        let expected_id = account_id(self.provider_kind, &self.base_url, &self.label);
        if self.id != expected_id {
            return Err(OperationError::parse(
                "provider account metadata id does not match provider endpoint",
            ));
        }

        Ok(self)
    }
}

/// Lists provider accounts stored in the supplied config directory.
///
/// # Errors
///
/// Returns an operation error when metadata cannot be read or token state
/// cannot be resolved.
pub fn list_provider_accounts_from_config_dir(
    config_dir: &Path,
    mut token_configured_for: impl FnMut(&str) -> Result<bool, OperationError>,
) -> Result<Vec<ProviderAccount>, OperationError> {
    let store = read_store(config_dir)?;
    let mut accounts = Vec::with_capacity(store.accounts.len());

    for metadata in store.accounts {
        let token_configured = token_configured_for(&metadata.id)?;
        accounts.push(metadata.into_account(token_configured));
    }

    Ok(accounts)
}

/// Saves non-secret provider account metadata in the supplied config directory.
///
/// # Errors
///
/// Returns an operation error when the metadata file cannot be read or written.
pub fn save_provider_account_metadata(
    config_dir: &Path,
    input: &ProviderAccountInput,
    token_configured: bool,
) -> Result<ProviderAccount, OperationError> {
    let metadata = ProviderAccountMetadata::from_input(input)?;
    let mut store = read_store(config_dir)?;
    store.accounts.retain(|account| account.id != metadata.id);
    store.accounts.push(metadata.clone());
    store.accounts.sort_by(compare_metadata);
    write_store(config_dir, &store)?;

    Ok(metadata.into_account(token_configured))
}

/// Lists configured provider accounts.
///
/// # Errors
///
/// Returns an operation error when the app config directory, metadata file, or
/// keychain cannot be read.
#[tauri::command]
pub fn list_provider_accounts(
    app_handle: AppHandle,
) -> Result<Vec<ProviderAccount>, OperationError> {
    let config_dir = app_config_dir(&app_handle)?;
    let _app_handle = app_handle;
    list_provider_accounts_from_config_dir(&config_dir, token_configured_for_account)
}

/// Saves a provider account and stores the token in the OS keychain.
///
/// # Errors
///
/// Returns an operation error when metadata cannot be saved or keychain storage
/// fails.
#[tauri::command]
pub fn save_provider_account(
    app_handle: AppHandle,
    input: ProviderAccountInput,
) -> Result<ProviderAccount, OperationError> {
    let config_dir = app_config_dir(&app_handle)?;
    let _app_handle = app_handle;
    let ProviderAccountInput {
        provider_kind,
        base_url,
        label,
        token,
    } = input;
    let metadata_input = ProviderAccountInput {
        provider_kind,
        base_url,
        label,
        token: String::new(),
    };
    let account_id = account_id_for_input(&metadata_input);
    validate_https_base_url(&normalized_base_url(&metadata_input.base_url))?;
    let token_configured = if token.is_empty() {
        delete_provider_token(&account_id)?;
        false
    } else {
        save_provider_token(&account_id, &token)?;
        true
    };

    save_provider_account_metadata(&config_dir, &metadata_input, token_configured)
}

/// Deletes a provider account and its token from the OS keychain.
///
/// # Errors
///
/// Returns an operation error when metadata cannot be updated or keychain access
/// fails.
#[tauri::command]
pub fn delete_provider_account(
    app_handle: AppHandle,
    account_id: &str,
) -> Result<GitOperationResult, OperationError> {
    let config_dir = app_config_dir(&app_handle)?;
    let _app_handle = app_handle;
    delete_provider_token(account_id)?;
    let deleted = delete_provider_account_metadata(&config_dir, account_id)?;
    let stdout = if deleted {
        String::from("deleted provider account")
    } else {
        String::from("provider account not found")
    };

    Ok(GitOperationResult {
        command: format!("delete-provider-account {account_id}"),
        stdout,
        stderr: String::new(),
    })
}

/// Tests a provider account token against the provider user API.
///
/// # Errors
///
/// Returns an operation error when metadata or keychain access fails.
#[tauri::command]
pub async fn test_provider_connection(
    app_handle: AppHandle,
    account_id: &str,
) -> Result<ProviderConnectionResult, OperationError> {
    let config_dir = app_config_dir(&app_handle)?;
    let _app_handle = app_handle;
    let Some(metadata) = find_provider_account_metadata(&config_dir, account_id)? else {
        return Ok(provider_connection_result(
            account_id.to_owned(),
            false,
            None,
            String::from("provider account not found"),
        ));
    };
    let Some(token) = read_provider_token(&metadata.id)? else {
        return Ok(provider_connection_result(
            metadata.id,
            false,
            None,
            String::from("provider token is not configured"),
        ));
    };

    Ok(run_provider_connection_test(&metadata, &token).await)
}

#[must_use]
pub fn account_id_for_input(input: &ProviderAccountInput) -> String {
    account_id(
        input.provider_kind,
        &normalized_base_url(&input.base_url),
        &input.label,
    )
}

#[must_use]
pub const fn keychain_service_name() -> &'static str {
    KEYCHAIN_SERVICE_NAME
}

#[must_use]
pub fn keychain_account_name(account_id: &str) -> String {
    format!("provider-account:{account_id}")
}

pub fn api_user_url(provider_kind: ProviderKind, base_url: &str) -> Result<String, OperationError> {
    let base_url = normalized_base_url(base_url);
    validate_https_base_url(&base_url)?;

    Ok(match provider_kind {
        ProviderKind::Github => String::from("https://api.github.com/user"),
        ProviderKind::Gitlab | ProviderKind::CustomGitlab => {
            format!("{base_url}/api/v4/user")
        }
    })
}

#[must_use]
pub fn authorization_header_value(token: &str) -> String {
    format!("Bearer {token}")
}

#[must_use]
pub const fn user_agent_header_value() -> &'static str {
    USER_AGENT_VALUE
}

fn delete_provider_account_metadata(
    config_dir: &Path,
    account_id: &str,
) -> Result<bool, OperationError> {
    let mut store = read_store(config_dir)?;
    let account_count = store.accounts.len();
    store.accounts.retain(|account| account.id != account_id);
    let deleted = store.accounts.len() != account_count;
    if deleted {
        write_store(config_dir, &store)?;
    }

    Ok(deleted)
}

fn find_provider_account_metadata(
    config_dir: &Path,
    account_id: &str,
) -> Result<Option<ProviderAccountMetadata>, OperationError> {
    let store = read_store(config_dir)?;
    Ok(store
        .accounts
        .into_iter()
        .find(|account| account.id == account_id))
}

fn read_store(config_dir: &Path) -> Result<ProviderAccountStore, OperationError> {
    let metadata_path = provider_accounts_path(config_dir);
    let json = match fs::read_to_string(metadata_path) {
        Ok(json) => json,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return Ok(ProviderAccountStore::default());
        }
        Err(error) => {
            return Err(operation_error(
                "failed to read provider account metadata",
                error,
            ));
        }
    };

    let store = serde_json::from_str(&json)
        .map_err(|error| operation_error("failed to parse provider account metadata", error))?;
    validate_store(store)
}

fn validate_store(store: ProviderAccountStore) -> Result<ProviderAccountStore, OperationError> {
    let mut accounts = Vec::with_capacity(store.accounts.len());
    for metadata in store.accounts {
        accounts.push(metadata.validated()?);
    }

    Ok(ProviderAccountStore { accounts })
}

fn write_store(config_dir: &Path, store: &ProviderAccountStore) -> Result<(), OperationError> {
    fs::create_dir_all(config_dir).map_err(|error| {
        operation_error("failed to create provider account config directory", error)
    })?;
    let json = serde_json::to_string_pretty(store)
        .map_err(|error| operation_error("failed to serialize provider account metadata", error))?;
    fs::write(provider_accounts_path(config_dir), json)
        .map_err(|error| operation_error("failed to write provider account metadata", error))
}

fn provider_accounts_path(config_dir: &Path) -> PathBuf {
    config_dir.join(METADATA_FILE_NAME)
}

fn compare_metadata(
    left: &ProviderAccountMetadata,
    right: &ProviderAccountMetadata,
) -> std::cmp::Ordering {
    left.provider_kind
        .cmp(&right.provider_kind)
        .then_with(|| left.base_url.cmp(&right.base_url))
        .then_with(|| left.label.cmp(&right.label))
        .then_with(|| left.id.cmp(&right.id))
}

fn app_config_dir(app_handle: &AppHandle) -> Result<PathBuf, OperationError> {
    app_handle
        .path()
        .app_config_dir()
        .map_err(|error| operation_error("failed to resolve app config directory", error))
}

fn save_provider_token(account_id: &str, token: &str) -> Result<(), OperationError> {
    provider_token_entry(account_id)?
        .set_password(token)
        .map_err(|error| operation_error("failed to save provider token", error))
}

fn read_provider_token(account_id: &str) -> Result<Option<String>, OperationError> {
    match provider_token_entry(account_id)?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(operation_error("failed to read provider token", error)),
    }
}

fn delete_provider_token(account_id: &str) -> Result<(), OperationError> {
    match provider_token_entry(account_id)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(operation_error("failed to delete provider token", error)),
    }
}

fn token_configured_for_account(account_id: &str) -> Result<bool, OperationError> {
    read_provider_token(account_id).map(|token| token.is_some())
}

fn provider_token_entry(account_id: &str) -> Result<Entry, OperationError> {
    Entry::new(keychain_service_name(), &keychain_account_name(account_id))
        .map_err(|error| operation_error("failed to open provider token keychain entry", error))
}

async fn run_provider_connection_test(
    metadata: &ProviderAccountMetadata,
    token: &str,
) -> ProviderConnectionResult {
    let Ok(url) = api_user_url(metadata.provider_kind, &metadata.base_url) else {
        return provider_connection_result(
            metadata.id.clone(),
            false,
            None,
            String::from("provider account base URL must use https"),
        );
    };
    let client = Client::builder().timeout(REQUEST_TIMEOUT).build();
    let response = match client {
        Ok(client) => {
            client
                .get(url)
                .header(AUTHORIZATION, authorization_header_value(token))
                .header(USER_AGENT, user_agent_header_value())
                .send()
                .await
        }
        Err(error) => Err(error),
    };

    match response {
        Ok(response) => {
            let status = response.status();
            let status_code = status.as_u16();
            let ok = status.is_success();
            let message = if ok {
                String::from("connection succeeded")
            } else {
                format!("provider returned HTTP {status_code}")
            };
            provider_connection_result(metadata.id.clone(), ok, Some(status_code), message)
        }
        Err(error) => provider_connection_result(
            metadata.id.clone(),
            false,
            None,
            format!("connection failed: {error}"),
        ),
    }
}

const fn provider_connection_result(
    account_id: String,
    ok: bool,
    status_code: Option<u16>,
    message: String,
) -> ProviderConnectionResult {
    ProviderConnectionResult {
        account_id,
        ok,
        status_code,
        message,
    }
}

const fn provider_kind_value(provider_kind: ProviderKind) -> &'static str {
    match provider_kind {
        ProviderKind::Github => "github",
        ProviderKind::Gitlab => "gitlab",
        ProviderKind::CustomGitlab => "customGitlab",
    }
}

fn account_id(provider_kind: ProviderKind, base_url: &str, label: &str) -> String {
    let identity = format!(
        "{}\0{}\0{}",
        provider_kind_value(provider_kind),
        base_url,
        label.trim()
    );
    format!(
        "{}-{}",
        provider_kind_value(provider_kind),
        lowercase_hex(identity.as_bytes())
    )
}

fn normalized_base_url(base_url: &str) -> String {
    base_url.trim().trim_end_matches('/').to_ascii_lowercase()
}

fn validate_https_base_url(base_url: &str) -> Result<(), OperationError> {
    if base_url.starts_with("https://") {
        return Ok(());
    }

    Err(OperationError::parse(
        "provider account base URL must use https",
    ))
}

fn lowercase_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut value = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        value.push(char::from(HEX[usize::from(byte >> 4)]));
        value.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    value
}

fn operation_error(message: &str, error: impl std::fmt::Display) -> OperationError {
    OperationError::parse(format!("{message}: {error}"))
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{
        ProviderAccountInput, ProviderKind, account_id_for_input, api_user_url,
        authorization_header_value, keychain_account_name, keychain_service_name,
        list_provider_accounts_from_config_dir, lowercase_hex, save_provider_account_metadata,
        user_agent_header_value,
    };

    #[test]
    fn derives_stable_account_ids_from_provider_base_url_and_label() {
        let first = ProviderAccountInput {
            provider_kind: ProviderKind::Github,
            base_url: String::from("https://github.com/"),
            label: String::from("Personal"),
            token: String::from("ghp_secret"),
        };
        let second = ProviderAccountInput {
            provider_kind: ProviderKind::Github,
            base_url: String::from("https://github.com"),
            label: String::from("Personal"),
            token: String::from("different_secret"),
        };

        assert_eq!(account_id_for_input(&first), account_id_for_input(&second));
        assert_eq!(
            account_id_for_input(&first),
            format!(
                "github-{}",
                lowercase_hex("github\0https://github.com\0Personal".as_bytes())
            )
        );
    }

    #[test]
    fn account_ids_do_not_collapse_slug_collisions() {
        let dotted_host = ProviderAccountInput {
            provider_kind: ProviderKind::CustomGitlab,
            base_url: String::from("https://gitlab.company.test"),
            label: String::from("Work"),
            token: String::from("glpat-secret"),
        };
        let dashed_host = ProviderAccountInput {
            provider_kind: ProviderKind::CustomGitlab,
            base_url: String::from("https://gitlab-company.test"),
            label: String::from("Work"),
            token: String::from("glpat-secret"),
        };

        assert_ne!(
            account_id_for_input(&dotted_host),
            account_id_for_input(&dashed_host)
        );
    }

    #[test]
    fn roundtrips_metadata_json_without_token_values() -> Result<(), Box<dyn std::error::Error>> {
        let config_dir = temp_config_dir()?;
        let input = ProviderAccountInput {
            provider_kind: ProviderKind::CustomGitlab,
            base_url: String::from("https://gitlab.company.test/"),
            label: String::from("Platform"),
            token: String::from("glpat-secret"),
        };

        let saved = save_provider_account_metadata(&config_dir, &input, true)?;
        let accounts = list_provider_accounts_from_config_dir(&config_dir, |_| Ok(true))?;
        let json = fs::read_to_string(config_dir.join("provider_accounts.json"))?;
        let value: serde_json::Value = serde_json::from_str(&json)?;

        assert_eq!(accounts, vec![saved]);
        assert_eq!(value["accounts"][0]["providerKind"], "customGitlab");
        assert!(!json.contains("glpat-secret"));
        assert!(!json.contains("token"));
        fs::remove_dir_all(config_dir)?;
        Ok(())
    }

    #[test]
    fn derives_deterministic_keychain_names() {
        assert_eq!(keychain_service_name(), "git-workbench.provider-accounts");
        let account_id = account_id_for_input(&ProviderAccountInput {
            provider_kind: ProviderKind::Github,
            base_url: String::from("https://github.com"),
            label: String::from("Personal"),
            token: String::new(),
        });
        assert_eq!(
            keychain_account_name(&account_id),
            format!("provider-account:{account_id}")
        );
    }

    #[test]
    fn builds_provider_api_user_urls() -> Result<(), Box<dyn std::error::Error>> {
        assert_eq!(
            api_user_url(ProviderKind::Github, "https://github.com")?,
            "https://api.github.com/user"
        );
        assert_eq!(
            api_user_url(ProviderKind::Gitlab, "https://gitlab.com/")?,
            "https://gitlab.com/api/v4/user"
        );
        assert_eq!(
            api_user_url(
                ProviderKind::CustomGitlab,
                "https://gitlab.company.test/root/"
            )?,
            "https://gitlab.company.test/root/api/v4/user"
        );
        Ok(())
    }

    #[test]
    fn rejects_plaintext_provider_base_urls() -> Result<(), Box<dyn std::error::Error>> {
        let config_dir = temp_config_dir()?;
        let input = ProviderAccountInput {
            provider_kind: ProviderKind::CustomGitlab,
            base_url: String::from("http://gitlab.company.test"),
            label: String::from("Platform"),
            token: String::from("glpat-secret"),
        };

        assert!(save_provider_account_metadata(&config_dir, &input, true).is_err());
        assert!(api_user_url(ProviderKind::CustomGitlab, "http://gitlab.company.test").is_err());

        fs::remove_dir_all(config_dir)?;
        Ok(())
    }

    #[test]
    fn rejects_metadata_when_id_does_not_match_endpoint() -> Result<(), Box<dyn std::error::Error>>
    {
        let config_dir = temp_config_dir()?;
        fs::write(
            config_dir.join("provider_accounts.json"),
            r#"{
  "accounts": [
    {
      "id": "github-https-github-com-personal",
      "providerKind": "github",
      "baseUrl": "https://gitlab.company.test",
      "label": "Personal"
    }
  ]
}"#,
        )?;

        assert!(list_provider_accounts_from_config_dir(&config_dir, |_| Ok(true)).is_err());
        fs::remove_dir_all(config_dir)?;
        Ok(())
    }

    #[test]
    fn builds_connection_headers() {
        assert_eq!(
            authorization_header_value("secret-token"),
            "Bearer secret-token"
        );
        assert_eq!(user_agent_header_value(), "git-workbench");
    }

    fn temp_config_dir() -> Result<PathBuf, Box<dyn std::error::Error>> {
        let now = SystemTime::now().duration_since(UNIX_EPOCH)?;
        let path = std::env::temp_dir().join(format!(
            "git-workbench-provider-accounts-test-{}-{}",
            std::process::id(),
            now.as_nanos()
        ));
        fs::create_dir_all(&path)?;
        Ok(path)
    }
}
