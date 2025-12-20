import { cloneElement, useCallback, useMemo } from "react";
import type { HTMLAttributes, ReactElement, MouseEvent } from "react";
import { EditorView } from "@codemirror/view";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type {
  CommandId,
  CommandRegistry,
  CommandRunner,
} from "../commands/commandSystem";
import { resolveCommandShortcutLabel } from "../commands/commandSystem";
import type { UserSettings } from "../settings";

export type EditorContextMenuProps = {
  getView: () => EditorView | null;
  commands: CommandRunner;
  commandRegistry: CommandRegistry;
  settings: UserSettings;
  // We need to be able to attach an `onContextMenu` handler to the trigger element.
  // Constraining the child props avoids `unknown` props during webpack builds.
  children: ReactElement<HTMLAttributes<HTMLElement>>;
};

export function EditorContextMenu({
  getView,
  commands,
  commandRegistry,
  settings,
  children,
}: EditorContextMenuProps) {
  const shortcuts = useMemo(() => {
    const get = (id: CommandId) =>
      resolveCommandShortcutLabel(commandRegistry, id, settings) ?? "";

    return {
      bold: get("format.bold"),
      italic: get("format.italic"),
      strikethrough: get("format.strikethrough"),
      inlineCode: get("format.inlineCode"),
      link: get("insert.link"),
      settings: get("app.openSettings"),
    };
  }, [commandRegistry, settings]);

  const runCommand = useCallback(
    (id: Parameters<CommandRunner["runWithView"]>[0]) => {
      const view = getView();
      if (!view) {
        return;
      }
      view.focus();
      void commands.runWithView(id, view);
    },
    [commands, getView]
  );

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const view = getView();
      if (!view) {
        return;
      }

      // If there's already a selection, preserve it. Otherwise, move the cursor
      // to the right-click position so formatting targets the expected word.
      const sel = view.state.selection.main;
      if (sel.from !== sel.to) {
        return;
      }

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) {
        return;
      }

      view.dispatch({
        selection: { anchor: pos },
        scrollIntoView: false,
      });
    },
    [getView]
  );

  const child = cloneElement(children, {
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      handleContextMenu(event);
      children.props.onContextMenu?.(event);
    },
  } as HTMLAttributes<HTMLElement>);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{child}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuSub>
          <ContextMenuSubTrigger inset>Format</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem inset onSelect={() => runCommand("format.bold")}>
              Bold
              <ContextMenuShortcut>{shortcuts.bold}</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem inset onSelect={() => runCommand("format.italic")}>
              Italic
              <ContextMenuShortcut>{shortcuts.italic}</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              inset
              onSelect={() => runCommand("format.strikethrough")}
            >
              Strikethrough
              <ContextMenuShortcut>
                {shortcuts.strikethrough}
              </ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              inset
              onSelect={() => runCommand("format.inlineCode")}
            >
              Inline code
              <ContextMenuShortcut>{shortcuts.inlineCode}</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger inset>Insert</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem inset onSelect={() => runCommand("insert.link")}>
              Link
              <ContextMenuShortcut>{shortcuts.link}</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator></ContextMenuSeparator>
        <ContextMenuItem inset onSelect={() => runCommand("app.openSettings")}>
          Settings
          <ContextMenuShortcut>{shortcuts.settings}</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
