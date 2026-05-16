use std::{
    io::{self, Read},
    path::Path,
    process::{Child, ChildStderr, ChildStdout, Command, Stdio},
    sync::Arc,
    thread::{self, JoinHandle},
};

use serde::Serialize;
use tauri::Emitter;

use crate::{git::command::GitOperationResult, operation_error::OperationError};

pub const GIT_OPERATION_EVENT: &str = "git-operation";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitOperationEvent {
    pub operation_id: String,
    pub event: GitOperationEventKind,
    pub command: String,
    pub stream: Option<GitOperationStream>,
    pub line: Option<String>,
    pub status: Option<GitOperationStatus>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitOperationEventKind {
    Started,
    Output,
    Finished,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitOperationStream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitOperationStatus {
    Success,
    Error,
}

/// Runs Git and emits Tauri events while stdout and stderr are produced.
///
/// # Errors
///
/// Returns an operation error when Git cannot be executed, output cannot be read,
/// or Git exits unsuccessfully.
pub fn run_git_with_events(
    app: tauri::AppHandle,
    repository_path: &Path,
    args: &[String],
    operation_id: &str,
) -> Result<GitOperationResult, OperationError> {
    let app = Arc::new(app);
    let command = command_text(args);
    let mut child = Command::new("git")
        .args(args)
        .current_dir(repository_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            OperationError::command("failed to run git", command.clone(), error.to_string())
        })?;

    let (stdout, stderr) = take_child_output(&mut child, &command)?;

    emit_started_event(app.as_ref(), operation_id, &command);

    let stdout_handle = spawn_output_reader(
        Arc::clone(&app),
        command.clone(),
        operation_id.to_owned(),
        GitOperationStream::Stdout,
        stdout,
    );
    let stderr_handle = spawn_output_reader(
        Arc::clone(&app),
        command.clone(),
        operation_id.to_owned(),
        GitOperationStream::Stderr,
        stderr,
    );

    let wait_result = child.wait();
    let stdout_result = join_output_reader(stdout_handle);
    let stderr_result = join_output_reader(stderr_handle);

    let stdout_bytes = match stdout_result {
        Ok(bytes) => bytes,
        Err(error) => {
            emit_finished_event(
                app.as_ref(),
                operation_id,
                &command,
                GitOperationStatus::Error,
            );
            return Err(OperationError::command("failed to run git", command, error));
        }
    };
    let stderr_bytes = match stderr_result {
        Ok(bytes) => bytes,
        Err(error) => {
            emit_finished_event(
                app.as_ref(),
                operation_id,
                &command,
                GitOperationStatus::Error,
            );
            return Err(OperationError::command("failed to run git", command, error));
        }
    };
    let exit_status = match wait_result {
        Ok(status) => status,
        Err(error) => {
            emit_finished_event(
                app.as_ref(),
                operation_id,
                &command,
                GitOperationStatus::Error,
            );
            return Err(OperationError::command(
                "failed to run git",
                command,
                error.to_string(),
            ));
        }
    };

    let stdout = String::from_utf8_lossy(&stdout_bytes).into_owned();
    let stderr = String::from_utf8_lossy(&stderr_bytes).into_owned();
    let status = if exit_status.success() {
        GitOperationStatus::Success
    } else {
        GitOperationStatus::Error
    };
    emit_finished_event(app.as_ref(), operation_id, &command, status);

    if !exit_status.success() {
        return Err(OperationError::command(
            "git command failed",
            command,
            stderr,
        ));
    }

    Ok(GitOperationResult {
        command,
        stdout,
        stderr,
    })
}

pub fn command_text(args: &[String]) -> String {
    let mut command = String::from("git");
    if !args.is_empty() {
        command.push(' ');
        command.push_str(&args.join(" "));
    }
    command
}

fn take_child_output(
    child: &mut Child,
    command: &str,
) -> Result<(ChildStdout, ChildStderr), OperationError> {
    let Some(stdout) = child.stdout.take() else {
        return Err(OperationError::command(
            "failed to run git",
            command.to_owned(),
            String::from("failed to capture git stdout"),
        ));
    };
    let Some(stderr) = child.stderr.take() else {
        return Err(OperationError::command(
            "failed to run git",
            command.to_owned(),
            String::from("failed to capture git stderr"),
        ));
    };

    Ok((stdout, stderr))
}

fn output_line_text(bytes: &[u8]) -> String {
    let without_line_feed = bytes.strip_suffix(b"\n").map_or(bytes, |line| line);
    let without_carriage_return = without_line_feed
        .strip_suffix(b"\r")
        .map_or(without_line_feed, |line| line);
    String::from_utf8_lossy(without_carriage_return).into_owned()
}

fn spawn_output_reader<R>(
    app: Arc<tauri::AppHandle>,
    command: String,
    operation_id: String,
    stream: GitOperationStream,
    reader: R,
) -> JoinHandle<io::Result<Vec<u8>>>
where
    R: Read + Send + 'static,
{
    thread::spawn(move || read_stream_output(app.as_ref(), &command, &operation_id, stream, reader))
}

fn read_stream_output<R>(
    app: &tauri::AppHandle,
    command: &str,
    operation_id: &str,
    stream: GitOperationStream,
    reader: R,
) -> io::Result<Vec<u8>>
where
    R: Read,
{
    let mut reader = reader;
    let mut output = Vec::new();
    let mut frame = OutputFrameAccumulator::default();
    let mut buffer = [0; 8192];

    loop {
        let bytes_read = reader.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }

        let bytes = &buffer[..bytes_read];
        output.extend_from_slice(bytes);
        for byte in bytes {
            if let Some(line) = frame.push_byte(*byte) {
                emit_output_event(app, command, operation_id, stream, line);
            }
        }
    }

    if let Some(line) = frame.finish() {
        emit_output_event(app, command, operation_id, stream, line);
    }

    Ok(output)
}

#[derive(Default)]
struct OutputFrameAccumulator {
    bytes: Vec<u8>,
    previous_was_carriage_return: bool,
}

impl OutputFrameAccumulator {
    fn push_byte(&mut self, byte: u8) -> Option<String> {
        if self.previous_was_carriage_return && byte == b'\n' {
            self.previous_was_carriage_return = false;
            return None;
        }

        self.previous_was_carriage_return = false;

        match byte {
            b'\r' => {
                self.previous_was_carriage_return = true;
                Some(self.take_frame())
            }
            b'\n' => Some(self.take_frame()),
            _ => {
                self.bytes.push(byte);
                None
            }
        }
    }

    fn finish(&mut self) -> Option<String> {
        if self.bytes.is_empty() {
            return None;
        }

        Some(self.take_frame())
    }

    fn take_frame(&mut self) -> String {
        let bytes = std::mem::take(&mut self.bytes);
        output_line_text(&bytes)
    }
}

fn join_output_reader(handle: JoinHandle<io::Result<Vec<u8>>>) -> Result<Vec<u8>, String> {
    match handle.join() {
        Ok(output_result) => output_result.map_err(|error| error.to_string()),
        Err(_panic) => Err(String::from("failed to read git output")),
    }
}

fn emit_started_event(app: &tauri::AppHandle, operation_id: &str, command: &str) {
    emit_operation_event(
        app,
        GitOperationEvent {
            operation_id: operation_id.to_owned(),
            event: GitOperationEventKind::Started,
            command: command.to_owned(),
            stream: None,
            line: None,
            status: None,
        },
    );
}

fn emit_finished_event(
    app: &tauri::AppHandle,
    operation_id: &str,
    command: &str,
    status: GitOperationStatus,
) {
    emit_operation_event(
        app,
        GitOperationEvent {
            operation_id: operation_id.to_owned(),
            event: GitOperationEventKind::Finished,
            command: command.to_owned(),
            stream: None,
            line: None,
            status: Some(status),
        },
    );
}

fn emit_output_event(
    app: &tauri::AppHandle,
    command: &str,
    operation_id: &str,
    stream: GitOperationStream,
    line: String,
) {
    emit_operation_event(
        app,
        GitOperationEvent {
            operation_id: operation_id.to_owned(),
            event: GitOperationEventKind::Output,
            command: command.to_owned(),
            stream: Some(stream),
            line: Some(line),
            status: None,
        },
    );
}

fn emit_operation_event(app: &tauri::AppHandle, event: GitOperationEvent) {
    let _event_result = app.emit(GIT_OPERATION_EVENT, event);
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use serde_json::json;

    use super::{
        GitOperationEvent, GitOperationEventKind, GitOperationStatus, GitOperationStream,
        OutputFrameAccumulator, command_text, output_line_text,
    };

    #[test]
    fn serializes_git_operation_events_as_camel_case_payloads() -> Result<(), Box<dyn Error>> {
        let event = GitOperationEvent {
            operation_id: String::from("operation-42"),
            event: GitOperationEventKind::Output,
            command: String::from("git fetch"),
            stream: Some(GitOperationStream::Stderr),
            line: Some(String::from("remote: Counting objects: 3")),
            status: Some(GitOperationStatus::Success),
        };

        assert_eq!(
            serde_json::to_value(event)?,
            json!({
                "operationId": "operation-42",
                "event": "output",
                "command": "git fetch",
                "stream": "stderr",
                "line": "remote: Counting objects: 3",
                "status": "success"
            })
        );

        Ok(())
    }

    #[test]
    fn parses_output_line_text_without_line_endings() {
        assert_eq!(output_line_text(b"first line\n"), "first line");
        assert_eq!(output_line_text(b"second line\r\n"), "second line");
        assert_eq!(output_line_text(b"final line"), "final line");
    }

    #[test]
    fn splits_carriage_return_progress_frames() {
        let mut accumulator = OutputFrameAccumulator::default();
        let mut frames = b"Counting objects: 10%\rCounting objects: 50%\rDone\r\n"
            .iter()
            .filter_map(|byte| accumulator.push_byte(*byte))
            .collect::<Vec<_>>();
        frames.extend(accumulator.finish());

        assert_eq!(
            frames,
            ["Counting objects: 10%", "Counting objects: 50%", "Done"]
        );
    }

    #[test]
    fn preserves_streamed_wrapper_command_text() {
        assert_eq!(
            command_text(&[String::from("fetch")]),
            String::from("git fetch")
        );
        assert_eq!(
            command_text(&[String::from("merge"), String::from("feature/work")]),
            String::from("git merge feature/work")
        );
        assert_eq!(
            command_text(&[
                String::from("-c"),
                String::from("core.editor=true"),
                String::from("rebase"),
                String::from("--continue"),
            ]),
            String::from("git -c core.editor=true rebase --continue")
        );
    }
}
