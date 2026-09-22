import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, FileText } from "lucide-react";
import type { WorkspaceSearchResult } from "../../shared/types";

type SearchState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; result: WorkspaceSearchResult };
export function QuickOpen({
  onClose,
  onOpen,
  restoreFocus,
}: {
  onClose: () => void;
  onOpen: (path: string) => void;
  restoreFocus: () => void;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ kind: "loading" });
  const [active, setActive] = useState(0);
  const pending = useRef<string | null>(null);
  useEffect(() => {
    let stale = false;
    const timer = setTimeout(
      () => {
        void window.electronAPI.searchWorkspace(query).then(
          (result) => {
            if (!stale) setState({ kind: "ready", result });
          },
          (error) => {
            if (!stale)
              setState({
                kind: "error",
                message:
                  error instanceof Error
                    ? error.message
                    : "Unable to search your folder.",
              });
          },
        );
      },
      query ? 150 : 0,
    );
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);
  const files = state.kind === "ready" ? state.result.files : [];
  const open = (index: number) => {
    const file = files[index];
    if (!file) return;
    pending.current = file.relativePath;
    onClose();
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          className="command-palette quick-open fixed left-1/2 top-[15%] z-50 w-[min(36rem,90vw)] -translate-x-1/2 rounded-xl border shadow-xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus();
            if (pending.current) onOpen(pending.current);
          }}
        >
          <Dialog.Title className="sr-only">Quick open</Dialog.Title>
          <Dialog.Description className="sr-only">
            Find a note by its name, folder, or contents.
          </Dialog.Description>
          <div className="command-search">
            <Search size={18} aria-hidden="true" />
            <input
              autoFocus
              role="combobox"
              aria-label="Find a note"
              aria-expanded="true"
              aria-controls="quick-open-results"
              aria-activedescendant={
                files[active] ? `quick-note-${active}` : undefined
              }
              placeholder="Find a note…"
              maxLength={200}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
                setState({ kind: "loading" });
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const index =
                    (active +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      files.length) %
                    Math.max(files.length, 1);
                  setActive(index);
                  document
                    .getElementById(`quick-note-${index}`)
                    ?.scrollIntoView({ block: "nearest" });
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  open(active);
                }
              }}
            />
            <kbd>esc</kbd>
          </div>
          <div
            id="quick-open-results"
            role="listbox"
            aria-label="Notes"
            aria-busy={state.kind === "loading"}
          >
            {files.map((file, index) => (
              <div
                id={`quick-note-${index}`}
                key={file.relativePath}
                role="option"
                aria-selected={index === active}
                onMouseMove={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => open(index)}
              >
                <FileText size={16} aria-hidden="true" />
                <div className="quick-note-copy">
                  <div>{file.name}</div>
                  <small>{file.relativePath}</small>
                  {file.excerpt && <p>{file.excerpt}</p>}
                </div>
              </div>
            ))}
            {state.kind === "loading" && (
              <p role="status">Searching your folder…</p>
            )}
            {state.kind === "error" && <p role="alert">{state.message}</p>}
            {state.kind === "ready" && !files.length && (
              <p role="status">
                {query
                  ? "No matching notes."
                  : "Your Bedrock folder has no notes yet."}
              </p>
            )}
          </div>
          <div className="command-footer">
            {state.kind === "ready" && state.result.truncated
              ? "Showing a limited set of matches. Refine your search."
              : "Search names, folders, and note contents"}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
