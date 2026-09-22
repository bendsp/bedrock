import { focusMarkdownEditor } from "../editor/codemirror/tableCellContext";
import { cloneElement, useState } from "react";
import type { HTMLAttributes, ReactElement, MouseEvent } from "react";
import type { EditorView } from "@codemirror/view";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./ui/context-menu";
import type { CommandRegistry, CommandRunner } from "../commands/commandSystem";
import { resolveCommandShortcutLabel } from "../commands/commandSystem";
import type { UserSettings } from "../settings";
import { tableAt } from "../editor/codemirror/tables";

export function EditorContextMenu({
  getView,
  commands,
  commandRegistry,
  settings,
  children,
}: {
  getView: () => EditorView | null;
  commands: CommandRunner;
  commandRegistry: CommandRegistry;
  settings: UserSettings;
  children: ReactElement<HTMLAttributes<HTMLElement>>;
}) {
  const [inTable, setInTable] = useState(false);
  const child = cloneElement(children, {
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      const view = getView();
      if (
        view &&
        view.state.selection.main.empty &&
        !(event.target as HTMLElement).closest(".cm-rich-table")
      ) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos !== null) view.dispatch({ selection: { anchor: pos } });
      }
      setInTable(!!view && !!tableAt(view));
      children.props.onContextMenu?.(event);
    },
  });
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{child}</ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        {(["Format", "Insert", "Table", "Edit", "File", "Theme"] as const).map(
          (category) => (
            <ContextMenuSub key={category}>
              <ContextMenuSubTrigger
                disabled={category === "Table" && !inTable}
              >
                {category}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="max-h-[75vh] overflow-auto">
                {commandRegistry
                  .list()
                  .filter(
                    (command) =>
                      command.category === category &&
                      command.id !== "theme.set",
                  )
                  .map((command) => (
                    <ContextMenuItem
                      key={command.id}
                      disabled={!commands.canRun(command.id)}
                      onSelect={() => {
                        const view = getView();
                        if (!view || command.id === "theme.set") return;
                        focusMarkdownEditor(view);
                        void commands.runWithView(command.id, view);
                      }}
                    >
                      {command.title}
                      <ContextMenuShortcut>
                        {resolveCommandShortcutLabel(
                          commandRegistry,
                          command.id,
                          settings,
                        )}
                      </ContextMenuShortcut>
                    </ContextMenuItem>
                  ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          ),
        )}
        <ContextMenuItem
          onSelect={() => void commands.run("app.commandPalette")}
        >
          Command palette
          <ContextMenuShortcut>
            {resolveCommandShortcutLabel(
              commandRegistry,
              "app.commandPalette",
              settings,
            )}
          </ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
