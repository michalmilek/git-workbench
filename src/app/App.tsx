import {
  IconCloudUpload,
  IconGitBranch,
  IconGitCommit,
  IconGitMerge,
  IconGitPullRequest,
  IconHistory,
  IconInbox,
  IconRefresh,
  IconStack2
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { summarizeRepositoryStatus } from "@/features/repository/repository-status";
import { cn } from "@/lib/utils";

import { activeRepository, repositoryStatus } from "./workbench-data";

const navigationItems = [
  { active: true, icon: IconInbox, label: "Changes" },
  { active: false, icon: IconHistory, label: "History" },
  { active: false, icon: IconStack2, label: "Stashes" },
  { active: false, icon: IconGitPullRequest, label: "PR/MR" }
] as const;

export function App() {
  const summary = summarizeRepositoryStatus(repositoryStatus);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-[260px_minmax(0,1fr)_340px]">
        <aside className="flex min-w-0 flex-col border-r bg-muted/30 p-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Active repository</p>
            <h1 className="truncate text-xl font-semibold">{activeRepository.name}</h1>
            <p className="truncate text-sm text-muted-foreground">{activeRepository.path}</p>
          </div>

          <div className="mt-6 rounded-md border bg-background p-3">
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <IconGitBranch aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{summary.branchLabel}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{summary.syncLabel}</p>
          </div>

          <nav className="mt-6 flex flex-col gap-1">
            {navigationItems.map((item) => (
              <Button
                className={cn("justify-start", item.active && "bg-primary text-primary-foreground hover:bg-primary/80")}
                key={item.label}
                type="button"
                variant={item.active ? "default" : "ghost"}
              >
                <item.icon aria-hidden="true" data-icon="inline-start" />
                {item.label}
              </Button>
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-2 rounded-md border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Provider</p>
              <Badge variant="secondary">API ready</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{activeRepository.provider}</p>
          </div>
        </aside>

        <section className="min-w-0 p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Changes</p>
              <h2 className="truncate text-2xl font-semibold">{summary.changedFileCount} changed files</h2>
            </div>
            <Button type="button" variant="outline">
              <IconRefresh aria-hidden="true" data-icon="inline-start" />
              Refresh
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-[280px_minmax(0,1fr)] gap-4">
            <div className="min-h-[520px] overflow-hidden rounded-md border">
              {repositoryStatus.files.map((file) => (
                <button
                  className="block w-full border-b px-3 py-3 text-left text-sm last:border-b-0 hover:bg-muted"
                  key={file.path}
                  type="button"
                >
                  <span className="block truncate font-medium">{file.path}</span>
                  <span className="text-muted-foreground">
                    {file.indexStatus} / {file.worktreeStatus}
                  </span>
                </button>
              ))}
            </div>

            <div className="min-h-[520px] min-w-0 rounded-md border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Diff preview</p>
                <Badge variant={summary.hasUntrackedFiles ? "outline" : "secondary"}>
                  {summary.hasUntrackedFiles ? "Untracked files" : "Tracked changes"}
                </Badge>
              </div>
              <pre className="mt-4 overflow-auto rounded-md bg-background p-4 text-sm leading-6">
                {`@@ src/app/App.tsx
+ Workbench shell
+ Strict frontend mapping
+ Rust command boundary`}
              </pre>
            </div>
          </div>
        </section>

        <aside className="flex min-w-0 flex-col border-l bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Action panel</h2>
            <Badge variant="outline">Preview</Badge>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <Textarea className="min-h-28" placeholder="Commit message" />
            <Button type="button">
              <IconGitCommit aria-hidden="true" data-icon="inline-start" />
              Commit staged changes
            </Button>
            <Button type="button" variant="outline">
              <IconGitMerge aria-hidden="true" data-icon="inline-start" />
              Preview merge/rebase
            </Button>
          </div>

          <Separator className="my-5" />

          <div className="flex flex-col gap-3 rounded-md border bg-background p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <IconCloudUpload aria-hidden="true" className="size-4 shrink-0" />
              Sync
            </div>
            <p className="text-muted-foreground">System Git transport, provider API metadata.</p>
            <div className="flex gap-2">
              <Button size="sm" type="button" variant="secondary">
                Pull
              </Button>
              <Button size="sm" type="button" variant="secondary">
                Push
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
