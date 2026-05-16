export type ParsedDiffHunk = {
  header: string;
  id: string;
  lines: string[];
};

export type ParsedDiffFile = {
  headerLines: string[];
  hunks: ParsedDiffHunk[];
};

export type ParsedDiff = {
  files: ParsedDiffFile[];
};

export function parseDiffHunks(diffText: string): ParsedDiff {
  const lines = diffText.replace(/\r\n/g, "\n").split("\n");
  const files: ParsedDiffFile[] = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index]?.startsWith("diff --git ")) {
      index += 1;
      continue;
    }

    const fileLines: string[] = [];
    while (index < lines.length && !isHunkHeader(lines[index]) && lines[index] !== "") {
      fileLines.push(lines[index]);
      index += 1;
    }

    const hunks: ParsedDiffHunk[] = [];
    while (index < lines.length && isHunkHeader(lines[index])) {
      const hunkLines = [lines[index]];
      index += 1;

      while (index < lines.length && !isHunkHeader(lines[index]) && !lines[index]?.startsWith("diff --git ")) {
        if (lines[index] === "") {
          index += 1;
          break;
        }

        hunkLines.push(lines[index]);
        index += 1;
      }

      hunks.push({
        header: hunkLines[0],
        id: `${files.length}:${hunks.length}`,
        lines: hunkLines
      });
    }

    if (isPatchFile(fileLines, hunks)) {
      files.push({ headerLines: fileLines, hunks });
    }
  }

  return { files };
}

export function buildHunkPatch(parsedDiff: ParsedDiff, hunkId: string): string {
  for (const file of parsedDiff.files) {
    const hunk = file.hunks.find((candidate) => candidate.id === hunkId);
    if (hunk !== undefined) {
      return `${[...file.headerLines, ...hunk.lines].join("\n")}\n`;
    }
  }

  throw new Error(`Unknown diff hunk: ${hunkId}`);
}

function isPatchFile(fileLines: string[], hunks: ParsedDiffHunk[]): boolean {
  return (
    hunks.length > 0 &&
    fileLines[0]?.startsWith("diff --git ") === true &&
    fileLines.some((line) => line.startsWith("--- ")) &&
    fileLines.some((line) => line.startsWith("+++ ")) &&
    hunks.every((hunk) => hunk.lines.every(isPatchLine) && hunk.lines.some(isChangedPatchLine))
  );
}

function isHunkHeader(line: string | undefined): line is string {
  return line?.startsWith("@@ ") === true;
}

function isPatchLine(line: string): boolean {
  return (
    line.startsWith("@@ ") ||
    line.startsWith(" ") ||
    line.startsWith("+") ||
    line.startsWith("-") ||
    line.startsWith("\\ No newline at end of file")
  );
}

function isChangedPatchLine(line: string): boolean {
  return line.startsWith("+") || line.startsWith("-");
}
