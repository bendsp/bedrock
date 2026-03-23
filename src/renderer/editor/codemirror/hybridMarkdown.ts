import { EditorState, Extension, RangeSetBuilder, StateField } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import {
  commitFocusedTableCellEditor,
  getFocusedTableCellEditor,
  moveCursorBelowTableCommand,
  runFocusedTableCellFormatCommand,
  setTableCellValueCommand,
} from "./commands";
import { markdownToInlineHtml } from "../../lib/export";
import {
  findTableBlocks,
  peekPendingTableFocus,
  restorePendingTableFocus,
  type TableBlock,
  type TableCellSection,
  type TableCommandContext,
} from "./tables";

class HRWidget extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-md-hr-widget";
    return span;
  }

  ignoreEvent() {
    return true;
  }
}

const tableContextKey = (context: TableCommandContext): string => {
  return `${context.section}:${context.row}:${context.column}`;
};
const TABLE_EDITOR_SELECTOR = '[data-bedrock-table-editor="true"]';

const scheduleAnimationFrame =
  globalThis.requestAnimationFrame ??
  ((callback: FrameRequestCallback) =>
    globalThis.setTimeout(() => callback(0), 0));

const isSameTableContext = (
  left: TableCommandContext,
  right: TableCommandContext
): boolean => {
  return (
    left.tableFrom === right.tableFrom &&
    left.tableTo === right.tableTo &&
    left.section === right.section &&
    left.row === right.row &&
    left.column === right.column
  );
};

const getTableContextsInOrder = (table: TableBlock): TableCommandContext[] => {
  const contexts: TableCommandContext[] = table.header.map((_, column) => ({
    tableFrom: table.from,
    tableTo: table.to,
    section: "header",
    row: 0,
    column,
  }));

  table.rows.forEach((row, rowIndex) => {
    row.forEach((_, column) => {
      contexts.push({
        tableFrom: table.from,
        tableTo: table.to,
        section: "body",
        row: rowIndex,
        column,
      });
    });
  });

  return contexts;
};

const buildTableCellEditorTheme = (
  isHeader: boolean
): Extension =>
  EditorView.theme({
    "&": {
      backgroundColor: "transparent",
      color: isHeader
        ? "var(--header-text, #d7dae0)"
        : "var(--panel-text, #e6e9ef)",
      font: "inherit",
      outline: "none",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      font: "inherit",
      lineHeight: "inherit",
      outline: "none",
    },
    ".cm-content": {
      minHeight: "2.25rem",
      padding: "0.45rem 0.65rem",
      caretColor: "var(--panel-text, #e6e9ef)",
    },
    ".cm-line": {
      padding: 0,
    },
  });

class TableWidget extends WidgetType {
  constructor(private readonly table: TableBlock) {
    super();
  }

  eq(other: TableWidget): boolean {
    return JSON.stringify(this.table) === JSON.stringify(other.table);
  }

  toDOM(view: import("@codemirror/view").EditorView) {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-table-widget";

    const tableEl = document.createElement("table");
    tableEl.className = "cm-md-table";
    wrapper.appendChild(tableEl);

    const pendingFocus = peekPendingTableFocus(view);
    const orderedContexts = getTableContextsInOrder(this.table);
    const orderedKeys = orderedContexts.map(tableContextKey);
    const contextIndex = new Map(
      orderedKeys.map((key, index) => [key, index] as const)
    );

    type CellController = {
      context: TableCommandContext;
      closeEditor: (nextValue?: string) => void;
      openEditor: (cursor?: number) => EditorView;
    };

    const cellControllers = new Map<string, CellController>();

    const getAdjacentContext = (
      context: TableCommandContext,
      delta: number
    ): TableCommandContext => {
      const key = tableContextKey(context);
      const currentIndex = contextIndex.get(key) ?? 0;
      const nextIndex =
        (currentIndex + delta + orderedContexts.length) % orderedContexts.length;
      return orderedContexts[nextIndex] ?? context;
    };

    const focusEditorWhenConnected = (
      editor: EditorView,
      cursor: number,
      attemptsRemaining = 4
    ) => {
      const applyFocus = () => {
        const nextCursor = Math.min(cursor, editor.state.doc.length);
        editor.focus();
        editor.dispatch({
          selection: { anchor: nextCursor },
          scrollIntoView: true,
        });
      };

      if (editor.dom.isConnected) {
        applyFocus();
        return;
      }

      if (attemptsRemaining <= 0) {
        return;
      }

      scheduleAnimationFrame(() => {
        focusEditorWhenConnected(editor, cursor, attemptsRemaining - 1);
      });
    };

    const focusLocalEditor = (context: TableCommandContext, cursor?: number) => {
      cellControllers.get(tableContextKey(context))?.openEditor(cursor);
    };

    const focusCell = (context: TableCommandContext, cursor?: number) => {
      const activeEditor = getFocusedTableCellEditor(view);
      const activeRoot = activeEditor?.dom.closest<HTMLElement>(
        TABLE_EDITOR_SELECTOR
      );
      if (activeEditor && activeRoot) {
        const activeKey = activeRoot.dataset.tableCellKey;
        if (activeKey === tableContextKey(context)) {
          activeEditor.focus();
          if (cursor != null) {
            const nextCursor = Math.min(cursor, activeEditor.state.doc.length);
            activeEditor.dispatch({
              selection: { anchor: nextCursor },
              scrollIntoView: true,
            });
          }
          return;
        }

        const activeController = activeKey
          ? cellControllers.get(activeKey)
          : null;
        const currentValue = activeEditor.state.doc.toString();
        const originalValue = activeRoot.dataset.originalValue ?? "";
        if (currentValue !== originalValue) {
          commitFocusedTableCellEditor(view, {
            context,
            cursor: cursor ?? currentValue.length,
          });
          return;
        }

        activeController?.closeEditor(currentValue);
      }

      focusLocalEditor(context, cursor);
    };

    const createCell = (
      value: string,
      section: TableCellSection,
      row: number,
      column: number
    ) => {
      const context: TableCommandContext = {
        tableFrom: this.table.from,
        tableTo: this.table.to,
        section,
        row,
        column,
      };

      const key = tableContextKey(context);
      const cell = document.createElement(
        section === "header" ? "th" : "td"
      ) as HTMLTableCellElement;
      cell.className =
        section === "header" ? "cm-md-table-header" : "cm-md-table-cell";
      cell.dataset.bedrockTableCell = "true";
      cell.dataset.tableFrom = String(this.table.from);
      cell.dataset.tableTo = String(this.table.to);
      cell.dataset.tableSection = section;
      cell.dataset.tableRow = String(row);
      cell.dataset.tableColumn = String(column);

      const display = document.createElement("div");
      display.className = "cm-md-table-cell-display";
      if (section === "header") {
        display.classList.add("cm-md-table-cell-display-header");
      }

      let currentValue = value;
      let editor: EditorView | null = null;

      const renderDisplay = (nextValue: string) => {
        currentValue = nextValue;
        display.innerHTML = nextValue ? markdownToInlineHtml(nextValue) : "";
        display.classList.toggle("cm-md-table-cell-display-empty", nextValue === "");
      };

      const closeEditor = (nextValue = currentValue) => {
        currentValue = nextValue;
        editor?.destroy();
        editor = null;
        cell.replaceChildren(display);
        renderDisplay(nextValue);
      };

      const openEditor = (cursor = currentValue.length) => {
        if (!editor) {
          const commitEditorValue = (
            focus:
              | {
                  context: TableCommandContext;
                  cursor: number;
                }
              | null,
            unchanged: () => void
          ) => {
            if (!editor) {
              return;
            }

            const nextValue = editor.state.doc.toString();
            const nextCursor = editor.state.selection.main.head;
            const originalValue =
              editor.dom.dataset.originalValue ?? currentValue;
            if (nextValue === originalValue) {
              closeEditor(nextValue);
              unchanged();
              return;
            }

            setTableCellValueCommand(view, context, nextValue, nextCursor, focus);
          };

          editor = new EditorView({
            state: EditorState.create({
              doc: currentValue,
              extensions: [
                markdown({ extensions: [GFM] }),
                createInlineMarkdownPlugin(),
                buildTableCellEditorTheme(section === "header"),
                EditorState.transactionFilter.of((transaction) => {
                  if (!transaction.docChanged) {
                    return transaction;
                  }

                  const nextText = transaction.newDoc.toString();
                  if (!nextText.includes("\n")) {
                    return transaction;
                  }

                  const sanitized = nextText.replace(/\s*\n+\s*/g, " ");
                  const anchor = Math.min(
                    transaction.newSelection.main.anchor,
                    sanitized.length
                  );
                  const head = Math.min(
                    transaction.newSelection.main.head,
                    sanitized.length
                  );

                  return [
                    {
                      changes: {
                        from: 0,
                        to: transaction.startState.doc.length,
                        insert: sanitized,
                      },
                      selection: { anchor, head },
                    },
                  ];
                }),
                EditorView.domEventHandlers({
                  keydown: (event) => {
                    const isPrimaryModifier =
                      (event.metaKey || event.ctrlKey) && !event.altKey;

                    if (isPrimaryModifier) {
                      if (event.key.toLowerCase() === "a" && !event.shiftKey) {
                        event.preventDefault();
                        editor?.dispatch({
                          selection: {
                            anchor: 0,
                            head: editor.state.doc.length,
                          },
                          scrollIntoView: true,
                        });
                        return true;
                      }
                      if (event.key.toLowerCase() === "b") {
                        event.preventDefault();
                        return runFocusedTableCellFormatCommand(view, "bold");
                      }
                      if (event.key.toLowerCase() === "i") {
                        event.preventDefault();
                        return runFocusedTableCellFormatCommand(view, "italic");
                      }
                      if (event.key.toLowerCase() === "k") {
                        event.preventDefault();
                        return runFocusedTableCellFormatCommand(view, "link");
                      }
                      if (event.key === "`") {
                        event.preventDefault();
                        return runFocusedTableCellFormatCommand(
                          view,
                          "inlineCode"
                        );
                      }
                      if (event.key.toLowerCase() === "x" && event.shiftKey) {
                        event.preventDefault();
                        return runFocusedTableCellFormatCommand(
                          view,
                          "strikethrough"
                        );
                      }
                    }

                    if (event.key === "Tab") {
                      event.preventDefault();
                      const nextContext = getAdjacentContext(
                        context,
                        event.shiftKey ? -1 : 1
                      );
                      commitEditorValue(
                        {
                          context: nextContext,
                          cursor: 0,
                        },
                        () => focusLocalEditor(nextContext, 0)
                      );
                      return true;
                    }

                    if (event.key === "Enter") {
                      event.preventDefault();
                      const nextCursor = editor?.state.selection.main.head ?? 0;
                      commitEditorValue(
                        {
                          context,
                          cursor: nextCursor,
                        },
                        () => openEditor(nextCursor)
                      );
                      return true;
                    }

                    return false;
                  },
                  focusout: (event) => {
                    const nextTarget = event.relatedTarget;
                    if (
                      nextTarget instanceof Node &&
                      editor?.dom.contains(nextTarget)
                    ) {
                      return false;
                    }

                    commitEditorValue(null, () => undefined);
                    return false;
                  },
                }),
              ],
            }),
          });
          editor.dom.classList.add("cm-md-table-editor");
          editor.dom.dataset.bedrockTableEditor = "true";
          editor.dom.dataset.tableCellKey = key;
          editor.dom.dataset.originalValue = currentValue;
          editor.dom.dataset.tableFrom = String(this.table.from);
          editor.dom.dataset.tableTo = String(this.table.to);
          editor.dom.dataset.tableSection = section;
          editor.dom.dataset.tableRow = String(row);
          editor.dom.dataset.tableColumn = String(column);

          const stopNestedEditorEvent = (event: Event) => {
            event.stopPropagation();
          };

          [
            "beforeinput",
            "input",
            "keydown",
            "keyup",
            "keypress",
            "mousedown",
            "mouseup",
            "click",
            "paste",
            "copy",
            "cut",
          ].forEach((eventName) => {
            editor?.dom.addEventListener(eventName, stopNestedEditorEvent);
          });
        }

        cell.replaceChildren(editor.dom);
        focusEditorWhenConnected(editor, cursor);

        return editor;
      };

      renderDisplay(currentValue);
      cell.appendChild(display);

      cell.addEventListener("mousedown", (event) => {
        if (event.button !== 0) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        focusCell(context);
      });

      cellControllers.set(key, {
        context,
        closeEditor,
        openEditor,
      });

      if (pendingFocus && isSameTableContext(pendingFocus, context)) {
        openEditor(pendingFocus.cursor);
      }

      return cell;
    };

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    this.table.header.forEach((value, column) => {
      headerRow.appendChild(createCell(value, "header", 0, column));
    });
    thead.appendChild(headerRow);
    tableEl.appendChild(thead);

    const tbody = document.createElement("tbody");
    this.table.rows.forEach((row, rowIndex) => {
      const bodyRow = document.createElement("tr");
      row.forEach((value, column) => {
        bodyRow.appendChild(createCell(value, "body", rowIndex, column));
      });
      tbody.appendChild(bodyRow);
    });
    tableEl.appendChild(tbody);

    const gap = document.createElement("div");
    gap.className = "cm-md-table-gap";
    gap.textContent = "\u00a0";
    gap.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    gap.addEventListener("click", () => {
      const activeEditor = getFocusedTableCellEditor(view);
      const activeRoot = activeEditor?.dom.closest<HTMLElement>(
        TABLE_EDITOR_SELECTOR
      );
      const activeKey = activeRoot?.dataset.tableCellKey;
      const activeController = activeKey
        ? cellControllers.get(activeKey)
        : null;
      const currentValue = activeEditor?.state.doc.toString() ?? "";
      const originalValue = activeRoot?.dataset.originalValue ?? "";

      if (activeEditor && currentValue !== originalValue) {
        commitFocusedTableCellEditor(view, null);
        scheduleAnimationFrame(() => {
          moveCursorBelowTableCommand(view, this.table.from);
          view.focus();
        });
        return;
      }

      if (activeEditor) {
        activeController?.closeEditor(currentValue);
      }

      moveCursorBelowTableCommand(view, this.table.from);
      view.focus();
    });
    wrapper.appendChild(gap);

    return wrapper;
  }

  ignoreEvent() {
    return true;
  }
}

type LineKind =
  | { type: "heading"; level: number; markerEnd: number }
  | { type: "blockquote"; markerEnd: number }
  | { type: "list"; markerEnd: number }
  | { type: "fenceDelimiter"; markerEnd: number }
  | { type: "fenceContent" }
  | { type: "horizontalRule" }
  | { type: "paragraph" };

const headingMatch = (text: string): LineKind | null => {
  const match = text.match(/^(#{1,6})\s+(.*)$/);
  if (!match) return null;
  const level = match[1].length;
  return { type: "heading", level, markerEnd: match[1].length + 1 };
};

const listMatch = (text: string): LineKind | null => {
  const match = text.match(/^\s*([*-]|\d+[.)])\s+/);
  if (!match) return null;
  return { type: "list", markerEnd: match[0].length };
};

const blockquoteMatch = (text: string): LineKind | null => {
  const match = text.match(/^\s*>+\s?/);
  if (!match) return null;
  return { type: "blockquote", markerEnd: match[0].length };
};

const fenceMatch = (text: string): LineKind | null => {
  const match = text.match(/^```/);
  if (!match) return null;
  return { type: "fenceDelimiter", markerEnd: match[0].length };
};

const horizontalRuleMatch = (text: string): LineKind | null => {
  if (text.match(/^(?:-{3,}|\*{3,}|_{3,})$/)) {
    return { type: "horizontalRule" };
  }
  return null;
};

const classifyLines = (lines: string[]): LineKind[] => {
  const kinds: LineKind[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inFence) {
      const fence = fenceMatch(line);
      if (fence) {
        kinds.push(fence);
        inFence = false;
      } else {
        kinds.push({ type: "fenceContent" });
      }
      continue;
    }

    const fence = fenceMatch(line);
    if (fence) {
      kinds.push(fence);
      inFence = true;
      continue;
    }

    const heading = headingMatch(line);
    if (heading) {
      kinds.push(heading);
      continue;
    }

    const list = listMatch(line);
    if (list) {
      kinds.push(list);
      continue;
    }

    const quote = blockquoteMatch(line);
    if (quote) {
      kinds.push(quote);
      continue;
    }

    const hr = horizontalRuleMatch(line);
    if (hr) {
      const isFirstLine = i === 0;
      const prevLine = isFirstLine ? null : lines[i - 1];
      const isPrevBlank = isFirstLine || prevLine?.trim() === "";

      if (isPrevBlank) {
        kinds.push(hr);
        continue;
      }
    }

    kinds.push({ type: "paragraph" });
  }
  return kinds;
};

const listRunFor = (kinds: LineKind[], start: number): [number, number] => {
  let end = start;
  while (end + 1 < kinds.length && kinds[end + 1].type === "list") {
    end += 1;
  }
  return [start, end];
};

const quoteRunFor = (kinds: LineKind[], start: number): [number, number] => {
  let end = start;
  while (end + 1 < kinds.length && kinds[end + 1].type === "blockquote") {
    end += 1;
  }
  return [start, end];
};

type InlineMarkdownPluginOptions = {
  getExcludedRanges?: (
    view: import("@codemirror/view").EditorView
  ) => Array<{ from: number; to: number }>;
  onBuild?: (view: import("@codemirror/view").EditorView) => void;
};

const createInlineMarkdownPlugin = (
  options: InlineMarkdownPluginOptions = {}
): Extension =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: import("@codemirror/view").EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: import("@codemirror/view").ViewUpdate): void {
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged
        ) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      private buildDecorations(
        view: import("@codemirror/view").EditorView
      ): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const pending: Array<{ from: number; to: number; deco: Decoration }> =
          [];
        const pushDeco = (from: number, to: number, deco: Decoration) => {
          pending.push({ from, to, deco });
        };

        const selectionTouches = (from: number, to: number): boolean => {
          for (const range of view.state.selection.ranges) {
            const a = Math.min(range.from, range.to);
            const b = Math.max(range.from, range.to);
            if (a === b) {
              if (a >= from && a <= to) return true;
              continue;
            }
            if (a <= to && b >= from) return true;
          }
          return false;
        };

        const excludedRanges = options.getExcludedRanges?.(view) ?? [];
        const isExcludedRange = (from: number, to: number) => {
          return excludedRanges.some((range) => from < range.to && to > range.from);
        };

        const addInlineMark = (
          from: number,
          to: number,
          cls: string,
          attrs?: { [key: string]: string }
        ) => {
          pushDeco(
            from,
            to,
            Decoration.mark({ class: cls, inclusive: false, attributes: attrs })
          );
        };

        const containerNames = new Set([
          "Emphasis",
          "StrongEmphasis",
          "InlineCode",
          "Link",
          "Image",
          "Strikethrough",
        ]);

        const findContainer = (node: SyntaxNode): SyntaxNode => {
          let current: SyntaxNode | null = node.parent;
          let outermost: SyntaxNode | null = null;
          while (current) {
            if (containerNames.has(current.type.name)) {
              outermost = current;
            }
            current = current.parent;
          }
          return outermost || node;
        };

        const stylingContainerNames = new Set([
          "Emphasis",
          "StrongEmphasis",
          "Strikethrough",
        ]);

        const findOutermostStylingContainer = (
          node: SyntaxNode
        ): SyntaxNode => {
          let current: SyntaxNode | null = node;
          let outermost = node;
          while (current) {
            if (stylingContainerNames.has(current.type.name)) {
              outermost = current;
              current = current.parent;
            } else {
              break;
            }
          }
          return outermost;
        };

        const hideIfInactive = (
          nodeFrom: number,
          nodeTo: number,
          containerFrom: number,
          containerTo: number
        ) => {
          if (selectionTouches(containerFrom, containerTo)) return;
          pushDeco(
            nodeFrom,
            nodeTo,
            Decoration.mark({ class: "cm-md-hide-marker", inclusive: false })
          );
        };

        const tree = syntaxTree(view.state);

        for (const range of view.visibleRanges) {
          tree.iterate({
            from: range.from,
            to: range.to,
            enter: (node) => {
              if (isExcludedRange(node.from, node.to)) {
                return;
              }

              switch (node.name) {
                case "StrongEmphasis": {
                  const container = findOutermostStylingContainer(node.node);
                  addInlineMark(container.from, container.to, "cm-md-strong");
                  break;
                }
                case "Emphasis": {
                  const container = findOutermostStylingContainer(node.node);
                  addInlineMark(container.from, container.to, "cm-md-em");
                  break;
                }
                case "Strikethrough": {
                  const container = findOutermostStylingContainer(node.node);
                  addInlineMark(container.from, container.to, "cm-md-strike");
                  break;
                }
                case "Link": {
                  addInlineMark(node.from, node.to, "cm-md-link cm-link", {
                    title: "Click to open link",
                  });
                  break;
                }
                case "InlineCode":
                  addInlineMark(node.from, node.to, "cm-md-inline-code");
                  break;
                case "StrongEmphasisMark":
                case "EmphasisMark":
                case "CodeMark":
                case "LinkMark":
                case "ImageMark":
                case "StrikethroughMark":
                case "URL": {
                  const container = findContainer(node.node);
                  hideIfInactive(
                    node.from,
                    node.to,
                    container.from,
                    container.to
                  );

                  if (node.name === "URL" && container.name !== "Link") {
                    addInlineMark(node.from, node.to, "cm-link", {
                      title: "Click to open link",
                    });
                  }
                  break;
                }
                default:
                  break;
              }
            },
          });
        }

        pending.sort((a, b) => a.from - b.from || a.to - b.to);
        for (const entry of pending) {
          builder.add(entry.from, entry.to, entry.deco);
        }

        const result = builder.finish();
        options.onBuild?.(view);
        return result;
      }
    },
    {
      decorations: (value) => value.decorations,
    }
  );

export const hybridMarkdown = (): Extension => {
  const buildTableDecorations = (
    doc: import("@codemirror/state").Text
  ): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>();
    for (const tableBlock of findTableBlocks(doc)) {
      builder.add(
        tableBlock.from,
        tableBlock.to,
        Decoration.replace({
          widget: new TableWidget(tableBlock),
          block: true,
          inclusive: false,
        })
      );
    }
    return builder.finish();
  };

  const tableWidgetField = StateField.define<DecorationSet>({
    create(state) {
      return buildTableDecorations(state.doc);
    },
    update(decorations, transaction) {
      if (!transaction.docChanged) {
        return decorations;
      }
      return buildTableDecorations(transaction.state.doc);
    },
    provide: (field) => EditorView.decorations.from(field),
  });

  const inlinePlugin = createInlineMarkdownPlugin({
    getExcludedRanges: (view) => findTableBlocks(view.state.doc),
    onBuild: (view) => {
      restorePendingTableFocus(view);
    },
  });

  const linePlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: import("@codemirror/view").EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: import("@codemirror/view").ViewUpdate): void {
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged
        ) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      private buildDecorations(
        view: import("@codemirror/view").EditorView
      ): DecorationSet {
        const doc = view.state.doc;
        const builder = new RangeSetBuilder<Decoration>();

        const selectionTouches = (from: number, to: number): boolean => {
          for (const range of view.state.selection.ranges) {
            const a = Math.min(range.from, range.to);
            const b = Math.max(range.from, range.to);
            if (a === b) {
              if (a >= from && a <= to) return true;
              continue;
            }
            if (a <= to && b >= from) return true;
          }
          return false;
        };
        const lines = [];
        for (let i = 1; i <= doc.lines; i += 1) {
          lines.push(doc.line(i).text);
        }
        const kinds = classifyLines(lines);
        const tableBlocks = findTableBlocks(doc);
        const tableStarts = new Map(
          tableBlocks.map((table) => [table.startLine, table] as const)
        );

        const addLineClass = (lineNumber: number, cls: string) => {
          const line = doc.line(lineNumber);
          if (selectionTouches(line.from, line.to)) return;
          builder.add(
            line.from,
            line.from,
            Decoration.line({ class: cls })
          );
        };

        const hideRange = (lineNumber: number, from: number, to: number) => {
          const line = doc.line(lineNumber);
          if (selectionTouches(line.from, line.to)) return;
          builder.add(
            line.from + from,
            line.from + to,
            Decoration.mark({ class: "cm-md-hide-marker", inclusive: false })
          );
        };

        for (let i = 0; i < kinds.length; i += 1) {
          const lineNo = i + 1;
          const tableBlock = tableStarts.get(lineNo);
          if (tableBlock) {
            i = tableBlock.endLine - 1;
            continue;
          }

          const kind = kinds[i];

          switch (kind.type) {
            case "heading": {
              addLineClass(
                lineNo,
                `cm-md-heading cm-md-atxheading${kind.level}`
              );
              hideRange(lineNo, 0, kind.markerEnd);
              break;
            }
            case "list": {
              const [start, end] = listRunFor(kinds, i);
              for (let ln = start + 1; ln <= end + 1; ln += 1) {
                addLineClass(ln, "cm-md-list");
                const text = lines[ln - 1] ?? "";
                const marker = listMatch(text);
                if (marker && "markerEnd" in marker) {
                  hideRange(ln, 0, marker.markerEnd);
                }
              }
              i = end;
              break;
            }
            case "blockquote": {
              const [start, end] = quoteRunFor(kinds, i);
              for (let ln = start + 1; ln <= end + 1; ln += 1) {
                addLineClass(ln, "cm-md-quote");
                const text = lines[ln - 1] ?? "";
                const marker = blockquoteMatch(text);
                if (marker && "markerEnd" in marker) {
                  hideRange(ln, 0, marker.markerEnd);
                }
              }
              i = end;
              break;
            }
            case "fenceDelimiter": {
              addLineClass(lineNo, "cm-md-code-block");
              hideRange(lineNo, 0, kind.markerEnd);
              break;
            }
            case "fenceContent": {
              addLineClass(lineNo, "cm-md-code-block");
              break;
            }
            case "horizontalRule": {
              const line = doc.line(lineNo);
              if (!selectionTouches(line.from, line.to)) {
                builder.add(
                  line.from,
                  line.to,
                  Decoration.replace({
                    widget: new HRWidget(),
                    inclusive: false,
                  })
                );
              } else {
                addLineClass(lineNo, "cm-md-hr-active");
              }
              break;
            }
            default:
              break;
          }
        }

        return builder.finish();
      }
    },
    {
      decorations: (value) => value.decorations,
    }
  );

  return [tableWidgetField, linePlugin, inlinePlugin];
};
