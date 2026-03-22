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
import {
  getTableContextFromTarget,
  type TableCommandContext,
} from "../editor/codemirror/tables";
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
  const [tableContext, setTableContext] = useState<
    (TableCommandContext & {
      bodyRowCount: number;
      columnCount: number;
    }) | null
  >(null);
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
      table: get("insert.table"),
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

  const runTableCommand = useCallback(
    (
      id:
        | "table.addRowAbove"
        | "table.addRowBelow"
        | "table.removeRow"
        | "table.addColumnLeft"
        | "table.addColumnRight"
        | "table.removeColumn"
    ) => {
      const view = getView();
      if (!view || !tableContext) {
        return;
      }
      view.focus();
      void commands.runWithView(id, view, tableContext);
    },
    [commands, getView, tableContext]
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

      const nextTableContext = getTableContextFromTarget(event.target);
      if (nextTableContext) {
        const tableElement =
          event.target instanceof Element
            ? event.target.closest(".cm-md-table")
            : null;
        const columnCount =
          tableElement?.querySelectorAll(
            'thead [data-bedrock-table-cell="true"]'
          ).length ?? 0;
        const bodyRowCount =
          tableElement?.querySelectorAll("tbody tr").length ?? 0;
        setTableContext({
          ...nextTableContext,
          bodyRowCount,
          columnCount,
        });
        return;
      }

      setTableContext(null);

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
    },
    [getView]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        updateActiveFormats();
      } else {
        setTableContext(null);
      }
    },
    [updateActiveFormats]
  );

  const isHeaderCell = tableContext?.section === "header";
  const canRemoveColumn = (tableContext?.columnCount ?? 0) > 1;

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
            <ContextMenuItem inset onSelect={() => runCommand("insert.table")}>
              Table
              <ContextMenuShortcut>{shortcuts.table}</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              inset
              onSelect={() => runCommand("insert.horizontalRule")}
            >
              Horizontal rule
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        {tableContext ? (
          <ContextMenuSub>
            <ContextMenuSubTrigger inset>Table</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {!isHeaderCell ? (
                <ContextMenuItem
                  inset
                  onSelect={() => runTableCommand("table.addRowAbove")}
                >
                  Add row above
                </ContextMenuItem>
              ) : null}
              <ContextMenuItem
                inset
                onSelect={() => runTableCommand("table.addRowBelow")}
              >
                Add row below
              </ContextMenuItem>
              <ContextMenuItem
                inset
                disabled={isHeaderCell}
                onSelect={() => runTableCommand("table.removeRow")}
              >
                Remove row
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                inset
                onSelect={() => runTableCommand("table.addColumnLeft")}
              >
                Add column left
              </ContextMenuItem>
              <ContextMenuItem
                inset
                onSelect={() => runTableCommand("table.addColumnRight")}
              >
                Add column right
              </ContextMenuItem>
              <ContextMenuItem
                inset
                disabled={!canRemoveColumn}
                onSelect={() => runTableCommand("table.removeColumn")}
              >
                Remove column
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        ) : null}
        <ContextMenuSeparator></ContextMenuSeparator>
        <ContextMenuItem inset onSelect={() => runCommand("app.openSettings")}>
          Settings
          <ContextMenuShortcut>{shortcuts.settings}</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
