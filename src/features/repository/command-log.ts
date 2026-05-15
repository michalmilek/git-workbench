export const COMMAND_LOG_STORAGE_KEY = "git-workbench-command-log";
export const COMMAND_LOG_ENTRY_LIMIT = 20;

export type CommandLogEntry = {
  id: string;
  timestamp: string;
  operation: string;
  status: "success" | "error";
  message: string;
  command?: string;
  stdout?: string;
  stderr?: string;
};

export function addCommandLogEntry(
  entries: CommandLogEntry[],
  entry: CommandLogEntry,
  limit = COMMAND_LOG_ENTRY_LIMIT
): CommandLogEntry[] {
  return trimCommandLogEntries([entry, ...entries], limit);
}

export function parseCommandLog(value: string | null): CommandLogEntry[] {
  if (value === null) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return trimCommandLogEntries(parsed.filter(isCommandLogEntry));
  } catch {
    return [];
  }
}

export function serializeCommandLog(entries: CommandLogEntry[]): string {
  return JSON.stringify(trimCommandLogEntries(entries));
}

export function trimCommandLogEntries(entries: CommandLogEntry[], limit = COMMAND_LOG_ENTRY_LIMIT): CommandLogEntry[] {
  return entries.slice(0, Math.max(0, limit));
}

function isCommandLogEntry(value: unknown): value is CommandLogEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const entry = value as Partial<CommandLogEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.timestamp === "string" &&
    typeof entry.operation === "string" &&
    (entry.status === "success" || entry.status === "error") &&
    typeof entry.message === "string" &&
    optionalString(entry.command) &&
    optionalString(entry.stdout) &&
    optionalString(entry.stderr)
  );
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}
