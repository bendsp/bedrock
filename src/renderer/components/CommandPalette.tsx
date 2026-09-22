import { Fragment, useMemo, useRef, useState } from "react";
import { Search, ArrowUp, ArrowDown, CornerDownLeft } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import type { CommandRegistry, CommandRunner } from "../commands/commandSystem";
import { resolveCommandShortcutLabel } from "../commands/commandSystem";
import type { UserSettings } from "../settings";

export function CommandPalette({
  registry,
  commands,
  settings,
  hasEditor,
  onClose,
  restoreFocus,
}: {
  registry: CommandRegistry;
  commands: CommandRunner;
  settings: UserSettings;
  hasEditor: boolean;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const pending = useRef<(() => void) | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const items = useMemo(
    () =>
      registry
        .list()
        .filter(
          (command) =>
            command.id !== "theme.set" &&
            command.id !== "app.commandPalette" &&
            commands.canRun(command.id) &&
            (!command.requiresEditor || hasEditor) &&
            `${command.category} ${command.title} ${command.description ?? ""}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((left, right) => {
          const order = [
            "File",
            "Edit",
            "Format",
            "Insert",
            "Table",
            "Theme",
            "App",
          ];
          return order.indexOf(left.category) - order.indexOf(right.category);
        }),
    [registry, commands, hasEditor, query],
  );
  const run = (index: number) => {
    const command = items[index];
    if (!command || command.id === "theme.set") return;
    const id = command.id;
    pending.current = () => {
      void commands.run(id);
    };
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
          className="command-palette fixed left-1/2 top-[15%] z-50 w-[min(36rem,90vw)] -translate-x-1/2 rounded-xl border bg-background shadow-xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus();
            pending.current?.();
          }}
        >
          <Dialog.Title className="sr-only">Commands</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search formatting, tables, files, and editor actions.
          </Dialog.Description>
          <div className="command-search">
            <Search size={18} aria-hidden="true" />
            <input
              placeholder="Search commands…"
              autoFocus
              role="combobox"
              aria-label="Search commands"
              aria-expanded="true"
              aria-controls="command-results"
              aria-activedescendant={
                items[active] ? `command-${items[active].id}` : undefined
              }
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const next =
                    (active +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      items.length) %
                    Math.max(1, items.length);
                  setActive(next);
                  document
                    .getElementById(`command-${items[next]?.id}`)
                    ?.scrollIntoView({ block: "nearest" });
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  run(active);
                }
              }}
            />
            <kbd>esc</kbd>
          </div>
          <div id="command-results" role="listbox" aria-label="Commands">
            {items.map((command, index) => (
              <Fragment key={command.id}>
                {(index === 0 ||
                  items[index - 1].category !== command.category) && (
                  <div className="command-category" role="presentation">
                    {command.category}
                  </div>
                )}
                <div
                  id={`command-${command.id}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseMove={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => run(index)}
                >
                  <span>{command.title}</span>
                  <kbd>
                    {resolveCommandShortcutLabel(
                      registry,
                      command.id,
                      settings,
                    )}
                  </kbd>
                </div>
              </Fragment>
            ))}
            {!items.length && <p role="status">No matching commands.</p>}
          </div>
          <div className="command-footer" aria-hidden="true">
            <span>
              <ArrowUp size={12} />
              <ArrowDown size={12} /> Navigate
            </span>
            <span>
              <CornerDownLeft size={13} /> Run command
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
