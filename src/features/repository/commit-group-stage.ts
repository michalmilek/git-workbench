import type { CommitGroupSuggestion } from "./commit-groups";
import type { GitOperationResult, StatusFile } from "./repository-types";

export type CommitGroupStageErrorDetails = {
  message: string;
  command?: string;
  stdout?: string;
  stderr?: string;
};

export function buildStageGroupResult(
  suggestion: CommitGroupSuggestion,
  files: StatusFile[],
  results: GitOperationResult[]
): GitOperationResult {
  const stdout = [
    `Staged ${files.length} files for ${suggestion.title}.`,
    ...results.map((result) => result.stdout).filter((output) => output.length > 0)
  ].join("\n");
  const stderr = results.map((result) => result.stderr).filter((output) => output.length > 0).join("\n");

  return {
    command: results.map((result) => result.command).join("\n"),
    stderr,
    stdout
  };
}

export function buildPartialStageGroupError({
  error,
  stagedFiles,
  stagedResults,
  suggestion
}: {
  error: CommitGroupStageErrorDetails;
  stagedFiles: StatusFile[];
  stagedResults: GitOperationResult[];
  suggestion: CommitGroupSuggestion;
}): CommitGroupStageErrorDetails {
  if (stagedResults.length === 0) {
    return error;
  }

  const partialResult = buildStageGroupResult(suggestion, stagedFiles, stagedResults);

  return {
    command: joinOutput([partialResult.command, error.command]),
    message: `Stage group partially completed for ${suggestion.title}: ${error.message}`,
    stderr: joinOutput([partialResult.stderr, error.stderr ?? error.message]),
    stdout: joinOutput([partialResult.stdout, error.stdout])
  };
}

function joinOutput(parts: Array<string | undefined>): string | undefined {
  const output = parts.filter((part) => part !== undefined && part.length > 0).join("\n");

  return output.length === 0 ? undefined : output;
}
