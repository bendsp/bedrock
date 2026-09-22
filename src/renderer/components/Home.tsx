import React from "react";
import { FileText, FolderOpen } from "lucide-react";
import { WorkspaceInfo } from "../../shared/types";
import { Button } from "./ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "./ui/item";

interface HomeProps {
  workspace: WorkspaceInfo | null;
  busy: boolean;
  onSelectRoot: (choice: "default" | "choose") => void;
  onQuickOpen: () => void;
  onOpenRecent: (filePath: string) => void;
}

export const Home = ({
  workspace,
  busy,
  onSelectRoot,
  onOpenRecent,
  onQuickOpen,
}: HomeProps) => (
  <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-10">
    <h1 className="text-3xl font-semibold tracking-tight">Home</h1>
    {workspace?.rootPath && (
      <Button variant="outline" disabled={busy} onClick={onQuickOpen}>
        Find a note…
      </Button>
    )}
    {!workspace?.rootPath ? (
      <section className="flex flex-col gap-4" aria-label="Root folder setup">
        <h2 className="text-lg font-medium">Choose a home for your files</h2>
        <p className="max-w-lg text-sm text-muted-foreground">
          Bedrock keeps your notes and app data in this folder. You can change
          it in Settings.
        </p>
        {workspace ? (
          <p className="break-all text-sm">{workspace.suggestedRootPath}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || !workspace}
            onClick={() => onSelectRoot("default")}
          >
            Use suggested folder
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onSelectRoot("choose")}
          >
            <FolderOpen /> Choose folder…
          </Button>
        </div>
      </section>
    ) : (
      <section
        className="flex flex-col gap-3"
        aria-label="Recently opened files"
      >
        <h2 className="text-sm font-medium text-muted-foreground">
          Recently opened
        </h2>
        {workspace.recentFiles.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            Files you open or create will appear here.
          </p>
        ) : (
          <ItemGroup>
            {workspace.recentFiles.map((file) => (
              <Item key={file.filePath} asChild size="sm">
                <button
                  type="button"
                  disabled={busy}
                  className="w-full text-left hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => onOpenRecent(file.filePath)}
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <ItemContent className="min-w-0">
                    <ItemTitle>{file.filePath.split(/[/\\]/).pop()}</ItemTitle>
                    <ItemDescription className="truncate">
                      {file.filePath}
                    </ItemDescription>
                  </ItemContent>
                  <time
                    dateTime={file.openedAt}
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    {new Date(file.openedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                </button>
              </Item>
            ))}
          </ItemGroup>
        )}
      </section>
    )}
  </main>
);
