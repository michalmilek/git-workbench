import { hasStagedChanges, hasWorktreeChanges } from "./repository-status";
import type { StatusFile } from "./repository-types";

export type CommitGroupSuggestion = {
  id: string;
  title: string;
  summary: string;
  body: string;
  description: string;
  files: StatusFile[];
  stageableCount: number;
  stagedCount: number;
  worktreeCount: number;
  conflictCount: number;
};

type CommitGroupId = "conflicts" | "backend" | "frontend" | "tests" | "docs" | "tooling" | "assets" | "workspace";

type CommitGroupMetadata = {
  id: CommitGroupId;
  title: string;
  summary: string;
  description: string;
};

const groupMetadata: Record<CommitGroupId, CommitGroupMetadata> = {
  assets: {
    description: "Image, font, and media file updates.",
    id: "assets",
    summary: "chore: update assets",
    title: "Assets"
  },
  backend: {
    description: "Tauri backend and Rust workspace changes.",
    id: "backend",
    summary: "feat: update Tauri backend",
    title: "Backend"
  },
  conflicts: {
    description: "Files that still need merge conflict resolution.",
    id: "conflicts",
    summary: "fix: resolve merge conflicts",
    title: "Conflicts"
  },
  docs: {
    description: "Documentation and markdown content updates.",
    id: "docs",
    summary: "docs: update project documentation",
    title: "Docs"
  },
  frontend: {
    description: "React app, component, feature, library, and style changes.",
    id: "frontend",
    summary: "feat: update frontend workspace",
    title: "Frontend"
  },
  tests: {
    description: "Automated test and specification file updates.",
    id: "tests",
    summary: "test: update test coverage",
    title: "Tests"
  },
  tooling: {
    description: "Package, build, config, lockfile, and toolchain updates.",
    id: "tooling",
    summary: "chore: update project tooling",
    title: "Tooling"
  },
  workspace: {
    description: "Workspace file updates that do not fit a narrower area.",
    id: "workspace",
    summary: "chore: update workspace files",
    title: "Workspace"
  }
};

const groupPriority: CommitGroupId[] = [
  "conflicts",
  "backend",
  "frontend",
  "tests",
  "docs",
  "tooling",
  "assets",
  "workspace"
];

const assetExtensions = new Set([
  "apng",
  "avif",
  "eot",
  "gif",
  "ico",
  "jpg",
  "jpeg",
  "mp3",
  "mp4",
  "ogg",
  "otf",
  "png",
  "svg",
  "ttf",
  "wav",
  "webm",
  "webp",
  "woff",
  "woff2"
]);

const toolingFileNames = new Set([
  ".eslintrc",
  ".eslintrc.cjs",
  ".eslintrc.js",
  ".eslintrc.json",
  ".prettierrc",
  ".prettierrc.json",
  "Cargo.lock",
  "Cargo.toml",
  "bun.lock",
  "clippy.toml",
  "components.json",
  "package-lock.json",
  "package.json",
  "pnpm-lock.yaml",
  "rustfmt.toml",
  "yarn.lock"
]);

export function buildCommitGroupSuggestions(files: StatusFile[]): CommitGroupSuggestion[] {
  const filesByGroup = new Map<CommitGroupId, StatusFile[]>();

  for (const file of files) {
    const groupId = classifyFile(file);
    filesByGroup.set(groupId, [...(filesByGroup.get(groupId) ?? []), file]);
  }

  return groupPriority.flatMap((groupId) => {
    const groupFiles = filesByGroup.get(groupId);

    if (groupFiles === undefined) {
      return [];
    }

    const sortedFiles = [...groupFiles].sort(compareStatusFiles);
    const metadata = groupMetadata[groupId];

    return [
      {
        ...metadata,
        body: buildBody(metadata, sortedFiles),
        conflictCount: sortedFiles.filter((file) => file.conflict).length,
        files: sortedFiles,
        stageableCount: sortedFiles.filter(isCommitGroupStageableFile).length,
        stagedCount: sortedFiles.filter(hasStagedChanges).length,
        worktreeCount: sortedFiles.filter(hasWorktreeChanges).length
      }
    ];
  });
}

export function isCommitGroupStageableFile(file: StatusFile): boolean {
  return !file.conflict && hasWorktreeChanges(file);
}

function classifyFile(file: StatusFile): CommitGroupId {
  const path = file.path;

  if (file.conflict) {
    return "conflicts";
  }

  if (isTestPath(path)) {
    return "tests";
  }

  if (isDocsPath(path)) {
    return "docs";
  }

  if (isToolingPath(path)) {
    return "tooling";
  }

  if (isAssetPath(path)) {
    return "assets";
  }

  if (path.startsWith("src-tauri/")) {
    return "backend";
  }

  if (isFrontendPath(path)) {
    return "frontend";
  }

  return "workspace";
}

function isFrontendPath(path: string): boolean {
  return (
    path.startsWith("src/app/") ||
    path.startsWith("src/components/") ||
    path.startsWith("src/features/") ||
    path.startsWith("src/lib/") ||
    path === "src/main.tsx" ||
    path === "src/styles.css"
  );
}

function isTestPath(path: string): boolean {
  const segments = path.split("/");
  const fileName = segments[segments.length - 1] ?? path;

  return (
    segments.some((segment) => ["__tests__", "spec", "specs", "test", "tests"].includes(segment)) ||
    /\.(spec|test)\.[^.]+$/.test(fileName)
  );
}

function isDocsPath(path: string): boolean {
  return path === "README.md" || path.startsWith("docs/") || path.endsWith(".md");
}

function isToolingPath(path: string): boolean {
  const segments = path.split("/");
  const fileName = segments[segments.length - 1] ?? path;

  return (
    toolingFileNames.has(fileName) ||
    /^tsconfig(?:\.[^.]+)?\.json$/.test(fileName) ||
    /^vite\.config\.[^.]+$/.test(fileName) ||
    /^tailwind\.config\.[^.]+$/.test(fileName)
  );
}

function isAssetPath(path: string): boolean {
  const segments = path.split(".");
  const extension = segments[segments.length - 1];

  return extension !== undefined && assetExtensions.has(extension.toLowerCase());
}

function compareStatusFiles(left: StatusFile, right: StatusFile): number {
  return left.path.localeCompare(right.path);
}

function buildBody(metadata: CommitGroupMetadata, files: StatusFile[]): string {
  return `${metadata.description}\n\nFiles:\n${files.map((file) => `- ${file.path}`).join("\n")}`;
}
