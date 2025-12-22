import { cloneElement, useCallback, useMemo, useState } from "react";
import type { HTMLAttributes, ReactElement, MouseEvent } from "react";
import { EditorView } from "@codemirror/view";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
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
import { getActiveFormats } from "../lib/getActiveFormats";

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
  const [activeFormats, setActiveFormats] = useState<{
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    inlineCode: boolean;
  }>({
    bold: false,
    italic: false,
    strikethrough: false,
    inlineCode: false,
  });

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

  const updateActiveFormats = useCallback(() => {
    const view = getView();
    if (!view) return;

    setActiveFormats(getActiveFormats(view));
  }, [getView]);

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const view = getView();
      if (!view) {
        return;
      }

      // If there's already a selection, preserve it. Otherwise, move the cursor
      // to the right-click position so formatting targets the expected word.
      const sel = view.state.selection.main;
      if (sel.from === sel.to) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos != null) {
          view.dispatch({
            selection: { anchor: pos },
            scrollIntoView: false,
          });
        }
      }

      // Update active formats state for the context menu
      updateActiveFormats();
    },
    [getView, updateActiveFormats]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        updateActiveFormats();
      }
    },
    [updateActiveFormats]
  );

  const child = cloneElement(children, {
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      handleContextMenu(event);
      children.props.onContextMenu?.(event);
    },
  } as HTMLAttributes<HTMLElement>);

  return (
    <ContextMenu onOpenChange={handleOpenChange}>
      <ContextMenuTrigger asChild>{child}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuSub>
          <ContextMenuSubTrigger inset>Format</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuCheckboxItem
              checked={activeFormats.bold}
              onSelect={() => runCommand("format.bold")}
            >
              Bold
              <ContextMenuShortcut>{shortcuts.bold}</ContextMenuShortcut>
            </ContextMenuCheckboxItem>
            <ContextMenuCheckboxItem
              checked={activeFormats.italic}
              onSelect={() => runCommand("format.italic")}
            >
              Italic
              <ContextMenuShortcut>{shortcuts.italic}</ContextMenuShortcut>
            </ContextMenuCheckboxItem>
            <ContextMenuCheckboxItem
              checked={activeFormats.strikethrough}
              onSelect={() => runCommand("format.strikethrough")}
            >
              Strikethrough
              <ContextMenuShortcut>
                {shortcuts.strikethrough}
              </ContextMenuShortcut>
            </ContextMenuCheckboxItem>
            <ContextMenuCheckboxItem
              checked={activeFormats.inlineCode}
              onSelect={() => runCommand("format.inlineCode")}
            >
              Inline code
              <ContextMenuShortcut>{shortcuts.inlineCode}</ContextMenuShortcut>
            </ContextMenuCheckboxItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger inset>Insert</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem inset onSelect={() => runCommand("insert.link")}>
              Link
              <ContextMenuShortcut>{shortcuts.link}</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              inset
              onSelect={() => runCommand("insert.horizontalRule")}
            >
              Horizontal rule
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
