import type { GitOperationResult } from "./repository-types";

export const OPERATION_QUEUE_ENTRY_LIMIT = 8;

export type OperationQueueStatus = "running" | "success" | "error";
export type OperationLogStream = "stdout" | "stderr";
export type GitOperationEventKind = "started" | "output" | "finished";

export type OperationLogLine = {
  stream: OperationLogStream;
  line: string;
};

export type OperationQueueEntry = {
  id: string;
  operation: string;
  command: string;
  status: OperationQueueStatus;
  logs: OperationLogLine[];
  result: GitOperationResult | null;
};

export type GitOperationEventPayload =
  | {
      operationId: string;
      event: "started";
      command: string;
      stream: null;
      line: null;
      status: null;
    }
  | {
      operationId: string;
      event: "output";
      command: string;
      stream: OperationLogStream;
      line: string;
      status: null;
    }
  | {
      operationId: string;
      event: "finished";
      command: string;
      stream: null;
      line: null;
      status: Exclude<OperationQueueStatus, "running">;
    };

export function createOperationQueueEntry(args: { id: string; operation: string; command: string }): OperationQueueEntry {
  return {
    command: args.command,
    id: args.id,
    logs: [],
    operation: args.operation,
    result: null,
    status: "running"
  };
}

export function applyOperationEvent(entries: OperationQueueEntry[], event: GitOperationEventPayload): OperationQueueEntry[] {
  const entryIndex = entries.findIndex((entry) => entry.id === event.operationId);
  if (entryIndex === -1) {
    return entries;
  }

  const nextEntries = entries.slice();
  nextEntries[entryIndex] = applyEventToEntry(nextEntries[entryIndex], event);
  return trimOperationQueueEntries(nextEntries);
}

export function finishOperationQueueEntry(
  entries: OperationQueueEntry[],
  id: string,
  status: OperationQueueStatus,
  result: GitOperationResult
): OperationQueueEntry[] {
  const entryIndex = entries.findIndex((entry) => entry.id === id);
  if (entryIndex === -1) {
    return entries;
  }

  const nextEntries = entries.slice();
  const entry = nextEntries[entryIndex];
  nextEntries[entryIndex] = {
    ...entry,
    command: result.command,
    logs: entry.logs.length === 0 ? operationLogLinesFromResult(result) : entry.logs,
    result,
    status
  };
  return trimOperationQueueEntries(nextEntries);
}

export function trimOperationQueueEntries(entries: OperationQueueEntry[], limit = OPERATION_QUEUE_ENTRY_LIMIT): OperationQueueEntry[] {
  return entries.slice(0, limit);
}

function applyEventToEntry(entry: OperationQueueEntry, event: GitOperationEventPayload): OperationQueueEntry {
  switch (event.event) {
    case "started":
      return {
        ...entry,
        command: event.command,
        result: null,
        status: "running"
      };
    case "output":
      return {
        ...entry,
        command: event.command,
        logs: [...entry.logs, { line: event.line, stream: event.stream }]
      };
    case "finished":
      return {
        ...entry,
        command: event.command,
        status: event.status
      };
  }
}

function operationLogLinesFromResult(result: GitOperationResult): OperationLogLine[] {
  return [...operationLogLinesFromOutput("stdout", result.stdout), ...operationLogLinesFromOutput("stderr", result.stderr)];
}

function operationLogLinesFromOutput(stream: OperationLogStream, output: string): OperationLogLine[] {
  if (output.length === 0) {
    return [];
  }

  return output
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => ({ line, stream }));
}
