import React, { useCallback, useMemo } from "react";
import type { HTMLAttributes, ReactElement } from "react";
import { EditorView } from "@codemirror/view";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { createWrapSelectionOrWordCommand } from "../editor/codemirror/commands";
import { formatBindingShortcut } from "../keybindings";

type FormatKeyBindings = {
  bold: string;
  italic: string;
  strikethrough: string;
};

export type EditorContextMenuProps = {
  getView: () => EditorView | null;
  keyBindings: FormatKeyBindings;
  // We need to be able to attach an `onContextMenu` handler to the trigger element.
  // Constraining the child props avoids `unknown` props during webpack builds.
  children: ReactElement<HTMLAttributes<HTMLElement>>;
};

export function EditorContextMenu({
  getView,
  keyBindings,
  children,
}: EditorContextMenuProps) {
  const boldCommand = useMemo(
    () =>
      createWrapSelectionOrWordCommand({
        before: "**",
        after: "**",
        emptySnippet: "****",
        emptyCursorOffset: 2,
      }),
    []
  );
  const italicCommand = useMemo(
    () =>
      createWrapSelectionOrWordCommand({
        before: "*",
        after: "*",
        emptySnippet: "**",
        emptyCursorOffset: 1,
      }),
    []
  );
  const strikeCommand = useMemo(
    () =>
      createWrapSelectionOrWordCommand({
        before: "~~",
        after: "~~",
        emptySnippet: "~~~~",
        emptyCursorOffset: 2,
      }),
    []
  );

  const runCommand = useCallback(
    (command: (view: EditorView) => boolean) => {
      const view = getView();
      if (!view) {
        return;
      }
      view.focus();
      command(view);
    },
    [getView]
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
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

  const child = React.cloneElement(children, {
    onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
      handleContextMenu(event);
      children.props.onContextMenu?.(event);
    },
  } as HTMLAttributes<HTMLElement>);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{child}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuLabel inset>Format</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem inset onSelect={() => runCommand(boldCommand)}>
          Bold
          <ContextMenuShortcut>
            {formatBindingShortcut(keyBindings.bold)}
          </ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem inset onSelect={() => runCommand(italicCommand)}>
          Italic
          <ContextMenuShortcut>
            {formatBindingShortcut(keyBindings.italic)}
          </ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem inset onSelect={() => runCommand(strikeCommand)}>
          Strikethrough
          <ContextMenuShortcut>
            {formatBindingShortcut(keyBindings.strikethrough)}
          </ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
