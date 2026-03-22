import { KeyBinding } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import {
  addTableColumn,
  addTableRow,
  createDefaultMarkdownTable,
  findTableBlockAtRange,
  getTableContextFromTarget,
  removeTableColumn,
  removeTableRow,
  serializeMarkdownTable,
  setPendingTableFocus,
  type MarkdownTable,
  type TableCommandContext,
  updateTableCell,
} from "./tables";

const TABLE_EDITOR_SELECTOR = '[data-bedrock-table-editor="true"]';

type TextSelectionRange = {
  start: number;
  end: number;
};

type TextEditResult = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

type TableCellFormat = "bold" | "italic" | "strikethrough" | "inlineCode";

const getWordRangeInText = (
  value: string,
  pos: number
): TextSelectionRange | null => {
  if (value.length === 0) {
    return null;
  }

  let index = Math.max(0, Math.min(pos, value.length));
  if ((index >= value.length || !isWordChar(value[index] ?? "")) && index > 0) {
    if (isWordChar(value[index - 1] ?? "")) {
      index -= 1;
    }
  }

  if (index < 0 || index >= value.length || !isWordChar(value[index] ?? "")) {
    return null;
  }

  let start = index;
  let end = index + 1;
  while (start > 0 && isWordChar(value[start - 1] ?? "")) {
    start -= 1;
  }
  while (end < value.length && isWordChar(value[end] ?? "")) {
    end += 1;
  }

  return { start, end };
};

const trimSelectionInText = (
  value: string,
  selectionStart: number,
  selectionEnd: number
): { text: string; start: number; end: number } => {
  let start = selectionStart;
  let end = selectionEnd;
  let text = value.slice(start, end);

  const trimmedStart = text.length - text.trimStart().length;
  const trimmedEnd = text.length - text.trimEnd().length;

  if (trimmedStart + trimmedEnd < text.length) {
    start += trimmedStart;
    end -= trimmedEnd;
    text = text.trim();
  }

  return { text, start, end };
};

const toggleTextWrap = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  before: string,
  after: string,
  emptySnippet: string,
  emptyCursorOffset: number
): TextEditResult => {
  if (selectionStart !== selectionEnd) {
    const { text, start, end } = trimSelectionInText(
      value,
      selectionStart,
      selectionEnd
    );
    const hasMarkers =
      start >= before.length &&
      value.slice(start - before.length, start) === before &&
      value.slice(end, end + after.length) === after;

    if (hasMarkers) {
      const nextValue =
        value.slice(0, start - before.length) +
        text +
        value.slice(end + after.length);
      const anchor = start - before.length;
      return {
        value: nextValue,
        selectionStart: anchor,
        selectionEnd: anchor + text.length,
      };
    }

    const insert = `${before}${text}${after}`;
    return {
      value: value.slice(0, start) + insert + value.slice(end),
      selectionStart: start + before.length,
      selectionEnd: start + before.length + text.length,
    };
  }

  const wordRange = getWordRangeInText(value, selectionStart);
  if (wordRange) {
    const text = value.slice(wordRange.start, wordRange.end);
    const hasMarkers =
      wordRange.start >= before.length &&
      value.slice(wordRange.start - before.length, wordRange.start) === before &&
      value.slice(wordRange.end, wordRange.end + after.length) === after;

    if (hasMarkers) {
      const nextValue =
        value.slice(0, wordRange.start - before.length) +
        text +
        value.slice(wordRange.end + after.length);
      const anchor = wordRange.start - before.length;
      return {
        value: nextValue,
        selectionStart: anchor,
        selectionEnd: anchor + text.length,
      };
    }

    const insert = `${before}${text}${after}`;
    return {
      value:
        value.slice(0, wordRange.start) + insert + value.slice(wordRange.end),
      selectionStart: wordRange.start + before.length,
      selectionEnd: wordRange.start + before.length + text.length,
    };
  }

  return {
    value:
      value.slice(0, selectionStart) +
      emptySnippet +
      value.slice(selectionEnd),
    selectionStart: selectionStart + emptyCursorOffset,
    selectionEnd: selectionStart + emptyCursorOffset,
  };
};

export const formatTableCellText = (
  format: TableCellFormat,
  value: string,
  selectionStart: number,
  selectionEnd: number
): TextEditResult => {
  switch (format) {
    case "bold":
      return toggleTextWrap(value, selectionStart, selectionEnd, "**", "**", "****", 2);
    case "italic":
      return toggleTextWrap(value, selectionStart, selectionEnd, "*", "*", "**", 1);
    case "strikethrough":
      return toggleTextWrap(value, selectionStart, selectionEnd, "~~", "~~", "~~~~", 2);
    case "inlineCode":
      return toggleTextWrap(value, selectionStart, selectionEnd, "`", "`", "``", 1);
  }
};

export const insertTableCellMarkdownLink = (
  value: string,
  selectionStart: number,
  selectionEnd: number
): TextEditResult => {
  const urlPlaceholder = "https://";

  if (selectionStart === selectionEnd) {
    const snippet = `[](${urlPlaceholder})`;
    return {
      value:
        value.slice(0, selectionStart) + snippet + value.slice(selectionEnd),
      selectionStart: selectionStart + 1,
      selectionEnd: selectionStart + 1,
    };
  }

  const { text, start, end } = trimSelectionInText(
    value,
    selectionStart,
    selectionEnd
  );
  const insert = `[${text}](${urlPlaceholder})`;
  const nextValue = value.slice(0, start) + insert + value.slice(end);
  const urlSelectionStart = start + 1 + text.length + 2;
  const urlSelectionEnd = urlSelectionStart + urlPlaceholder.length;

  return {
    value: nextValue,
    selectionStart: urlSelectionStart,
    selectionEnd: urlSelectionEnd,
  };
};

export const createSnippetCommand =
  (snippet: string, cursorOffset: number) =>
  (view: import("@codemirror/view").EditorView): boolean => {
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: snippet },
      selection: { anchor: from + cursorOffset },
      scrollIntoView: true,
    });
    return true;
  };

type WrapSelectionOptions = {
  before: string;
  after: string;
  /**
   * Optional node name to check for toggling (e.g. "StrongEmphasis").
   */
  nodeName?: string;
  /**
   * Inserted when there's no selection. Defaults to `${before}${after}`.
   */
  emptySnippet?: string;
  /**
   * Cursor position (relative to `from`) after inserting `emptySnippet`.
   * Defaults to `before.length`.
   */
  emptyCursorOffset?: number;
};

const findNodeInRange = (
  view: import("@codemirror/view").EditorView,
  from: number,
  to: number,
  nodeName: string
): SyntaxNode | null => {
  const tree = syntaxTree(view.state);
  // Check a bit inside the range to avoid boundary issues,
  // but also handle empty selections.
  const pos = from === to ? from : from + 1;
  let node = tree.resolveInner(pos, 1);
  while (node) {
    if (node.name === nodeName) {
      // Check if this node encompasses our selection/word range
      if (node.from <= from && node.to >= to) {
        return node;
      }
    }
    node = node.parent;
  }
  return null;
};

/**
 * Wraps the current selection with a prefix/suffix. If there's no selection,
 * inserts a snippet and places the cursor inside it.
 */
export const createWrapSelectionCommand =
  ({
    before,
    after,
    nodeName,
    emptySnippet = `${before}${after}`,
    emptyCursorOffset = before.length,
  }: WrapSelectionOptions) =>
  (view: import("@codemirror/view").EditorView): boolean => {
    let { from, to } = view.state.selection.main;

    // Toggle logic if nodeName is provided
    if (nodeName) {
      const node = findNodeInRange(view, from, to, nodeName);
      if (node) {
        // Find the markers. We assume they are at the very start and end of the node.
        // For standard markdown, this is usually true.
        const content = view.state.doc.sliceString(node.from, node.to);
        // We need to determine how many chars to remove from start and end.
        // If it's StrongEmphasis, it's usually 2. If Emphasis, it's 1.
        // We can use before.length and after.length as a guide.
        const markerBeforeLen = before.length;
        const markerAfterLen = after.length;

        const newText = content.slice(
          markerBeforeLen,
          content.length - markerAfterLen
        );
        view.dispatch({
          changes: { from: node.from, to: node.to, insert: newText },
          selection: {
            anchor: node.from,
            head: node.from + newText.length,
          },
          scrollIntoView: true,
        });
        return true;
      }
    }

    if (from === to) {
      view.dispatch({
        changes: { from, to, insert: emptySnippet },
        selection: { anchor: from + emptyCursorOffset },
        scrollIntoView: true,
      });
      return true;
    }

    let selectedText = view.state.doc.sliceString(from, to);

    // Trim whitespace from the selection so that markers "stick" to the text.
    const trimmedStart = selectedText.length - selectedText.trimStart().length;
    const trimmedEnd = selectedText.length - selectedText.trimEnd().length;

    // Only apply trimming if there's actual text remaining
    if (trimmedStart + trimmedEnd < selectedText.length) {
      from += trimmedStart;
      to -= trimmedEnd;
      selectedText = selectedText.trim();
    }

    const insert = `${before}${selectedText}${after}`;

    view.dispatch({
      changes: { from, to, insert },
      selection: {
        anchor: from + before.length,
        head: from + before.length + selectedText.length,
      },
      scrollIntoView: true,
    });
    return true;
  };

type WrapSelectionOrWordOptions = WrapSelectionOptions & {
  /**
   * When there is no selection, try to expand to the word at/near the cursor.
   * If no word is found, falls back to inserting `emptySnippet`.
   *
   * Defaults to true.
   */
  wrapWordWhenEmpty?: boolean;
};

const isWordChar = (ch: string): boolean => /[A-Za-z0-9_]/.test(ch);

const getWordRangeAt = (
  view: import("@codemirror/view").EditorView,
  pos: number
): { from: number; to: number } | null => {
  const doc = view.state.doc;
  const line = doc.lineAt(pos);
  const text = line.text;
  if (text.length === 0) {
    return null;
  }

  let idx = pos - line.from;
  // If the cursor is on whitespace/punctuation, but just after a word,
  // prefer the word immediately to the left (common when right-clicking).
  if ((idx >= text.length || !isWordChar(text[idx] ?? "")) && idx > 0) {
    if (isWordChar(text[idx - 1] ?? "")) {
      idx = idx - 1;
    }
  }

  if (idx < 0 || idx >= text.length || !isWordChar(text[idx] ?? "")) {
    return null;
  }

  let start = idx;
  let end = idx + 1;
  while (start > 0 && isWordChar(text[start - 1] ?? "")) {
    start--;
  }
  while (end < text.length && isWordChar(text[end] ?? "")) {
    end++;
  }

  return { from: line.from + start, to: line.from + end };
};

/**
 * Wraps the current selection with a prefix/suffix. If there's no selection,
 * tries to wrap the word at/near the cursor; if none, inserts `emptySnippet`.
 */
export const createWrapSelectionOrWordCommand =
  ({
    before,
    after,
    nodeName,
    emptySnippet = `${before}${after}`,
    emptyCursorOffset = before.length,
    wrapWordWhenEmpty = true,
  }: WrapSelectionOrWordOptions) =>
  (view: import("@codemirror/view").EditorView): boolean => {
    let { from, to } = view.state.selection.main;

    // Toggle logic if nodeName is provided
    if (nodeName) {
      // First check if the selection is already within the node
      let node = findNodeInRange(view, from, to, nodeName);

      // If no selection and we should wrap word, check if the word is already within the node
      if (!node && from === to && wrapWordWhenEmpty) {
        const wordRange = getWordRangeAt(view, from);
        if (wordRange) {
          node = findNodeInRange(view, wordRange.from, wordRange.to, nodeName);
        }
      }

      if (node) {
        const content = view.state.doc.sliceString(node.from, node.to);
        const markerBeforeLen = before.length;
        const markerAfterLen = after.length;
        const newText = content.slice(
          markerBeforeLen,
          content.length - markerAfterLen
        );
        view.dispatch({
          changes: { from: node.from, to: node.to, insert: newText },
          selection: {
            anchor: node.from,
            head: node.from + newText.length,
          },
          scrollIntoView: true,
        });
        return true;
      }
    }

    if (from !== to) {
      let selectedText = view.state.doc.sliceString(from, to);

      // Trim whitespace from the selection so that markers "stick" to the text.
      const trimmedStart =
        selectedText.length - selectedText.trimStart().length;
      const trimmedEnd = selectedText.length - selectedText.trimEnd().length;

      // Only apply trimming if there's actual text remaining
      if (trimmedStart + trimmedEnd < selectedText.length) {
        from += trimmedStart;
        to -= trimmedEnd;
        selectedText = selectedText.trim();
      }

      const insert = `${before}${selectedText}${after}`;
      view.dispatch({
        changes: { from, to, insert },
        selection: {
          anchor: from + before.length,
          head: from + before.length + selectedText.length,
        },
        scrollIntoView: true,
      });
      return true;
    }

    if (wrapWordWhenEmpty) {
      const wordRange = getWordRangeAt(view, from);
      if (wordRange) {
        const word = view.state.doc.sliceString(wordRange.from, wordRange.to);
        const insert = `${before}${word}${after}`;
        view.dispatch({
          changes: { from: wordRange.from, to: wordRange.to, insert },
          selection: {
            anchor: wordRange.from + before.length,
            head: wordRange.from + before.length + word.length,
          },
          scrollIntoView: true,
        });
        return true;
      }
    }

    view.dispatch({
      changes: { from, to, insert: emptySnippet },
      selection: { anchor: from + emptyCursorOffset },
      scrollIntoView: true,
    });
    return true;
  };

export const createMarkdownLinkCommand = (
  view: import("@codemirror/view").EditorView
): boolean => {
  let { from, to } = view.state.selection.main;
  const urlPlaceholder = "https://";

  if (from === to) {
    const snippet = `[](${urlPlaceholder})`;
    view.dispatch({
      changes: { from, to, insert: snippet },
      selection: { anchor: from + 1 },
      scrollIntoView: true,
    });
    return true;
  }

  let selectedText = view.state.doc.sliceString(from, to);

  // Trim whitespace from the selection so that markers "stick" to the text.
  const trimmedStart = selectedText.length - selectedText.trimStart().length;
  const trimmedEnd = selectedText.length - selectedText.trimEnd().length;

  // Only apply trimming if there's actual text remaining
  if (trimmedStart + trimmedEnd < selectedText.length) {
    from += trimmedStart;
    to -= trimmedEnd;
    selectedText = selectedText.trim();
  }

  const insert = `[${selectedText}](${urlPlaceholder})`;
  const urlStart = from + 1 + selectedText.length + 2; // "[" + text + "]("

  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: urlStart + urlPlaceholder.length },
    scrollIntoView: true,
  });
  return true;
};

export const getFocusedTableCellEditor = (
  view: import("@codemirror/view").EditorView
): HTMLInputElement | null => {
  const activeElement = view.dom.ownerDocument.activeElement;
  if (
    activeElement instanceof HTMLInputElement &&
    activeElement.matches(TABLE_EDITOR_SELECTOR) &&
    view.dom.contains(activeElement)
  ) {
    return activeElement;
  }

  return null;
};

const applyTextEditToInput = (
  input: HTMLInputElement,
  next: TextEditResult
): boolean => {
  input.value = next.value;
  try {
    input.setSelectionRange(next.selectionStart, next.selectionEnd);
  } catch {
    // Inputs can still be updated even if selection APIs are unavailable.
  }
  return true;
};

export const runFocusedTableCellFormatCommand = (
  view: import("@codemirror/view").EditorView,
  format: TableCellFormat | "link"
): boolean => {
  const input = getFocusedTableCellEditor(view);
  if (!input) {
    return false;
  }

  const selectionStart = input.selectionStart ?? input.value.length;
  const selectionEnd = input.selectionEnd ?? selectionStart;
  const next =
    format === "link"
      ? insertTableCellMarkdownLink(input.value, selectionStart, selectionEnd)
      : formatTableCellText(format, input.value, selectionStart, selectionEnd);

  return applyTextEditToInput(input, next);
};

export const insertHorizontalRuleCommand = (
  view: import("@codemirror/view").EditorView
): boolean => {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const isLastLine = line.number === view.state.doc.lines;

  let insert = "";
  let fromPos = 0;
  let toPos = 0;

  // If we're on an empty line, check if the previous line is also blank.
  if (line.text.trim() === "") {
    const isFirstLine = line.number === 1;
    const prevLineBlank =
      isFirstLine || view.state.doc.line(line.number - 1).text.trim() === "";

    fromPos = line.from;
    toPos = line.to;

    if (prevLineBlank) {
      insert = "---";
    } else {
      // Need a blank line before
      insert = "\n---";
    }
  } else {
    // Insert on a new line after the current line, ensuring a blank line before the rule
    fromPos = line.to;
    toPos = line.to;
    insert = "\n\n---";
  }

  // If it's the last line, we MUST add a newline to move the cursor to a new line after the rule
  if (isLastLine) {
    insert += "\n";
  }

  // The anchor should be at the start of the next line.
  // If we added a newline (isLastLine), it's at the end of the insertion.
  // If we didn't (not last line), we move past the existing newline.
  const anchor = fromPos + insert.length + (isLastLine ? 0 : 1);

  view.dispatch({
    changes: { from: fromPos, to: toPos, insert },
    selection: { anchor },
    scrollIntoView: true,
  });

  return true;
};

const replaceTableInView = (
  view: import("@codemirror/view").EditorView,
  tableFrom: number,
  tableTo: number,
  nextTable: MarkdownTable,
  focus:
    | {
        context: TableCommandContext;
        cursor: number;
      }
    | null = null
): boolean => {
  const insert = serializeMarkdownTable(nextTable);
  if (focus) {
    setPendingTableFocus(
      view,
      {
        ...focus.context,
        tableFrom,
        tableTo: tableFrom + insert.length,
      },
      focus.cursor
    );
  }
  view.dispatch({
    changes: { from: tableFrom, to: tableTo, insert },
    selection: { anchor: tableFrom },
    scrollIntoView: true,
  });
  return true;
};

const replaceActiveTableCellValue = (
  view: import("@codemirror/view").EditorView,
  context: TableCommandContext,
  value: string,
  focus:
    | {
        context: TableCommandContext;
        cursor: number;
      }
    | null
): boolean => {
  const table = findTableBlockAtRange(view.state.doc, context.tableFrom);
  if (!table) {
    return false;
  }

  const nextTable = updateTableCell(table, context, value);
  return replaceTableInView(view, table.from, table.to, nextTable, focus);
};

export const commitFocusedTableCellEditor = (
  view: import("@codemirror/view").EditorView,
  focus:
    | {
        context: TableCommandContext;
        cursor: number;
      }
    | null = null
): boolean => {
  const input = getFocusedTableCellEditor(view);
  if (!input) {
    return false;
  }

  const context = getTableContextFromTarget(input);
  if (!context) {
    return false;
  }

  return replaceActiveTableCellValue(view, context, input.value, focus);
};

export const insertTableCommand = (
  view: import("@codemirror/view").EditorView
): boolean => {
  const table = createDefaultMarkdownTable();
  const markdown = serializeMarkdownTable(table);
  const { from, to } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);

  let insert = markdown;
  let insertFrom = from;
  let insertTo = to;

  if (from === to) {
    if (line.text.trim() === "") {
      insertFrom = line.from;
      insertTo = line.to;
    } else {
      insertFrom = line.to;
      insertTo = line.to;
      insert = `\n\n${markdown}`;
    }
  }

  view.dispatch({
    changes: { from: insertFrom, to: insertTo, insert },
    selection: { anchor: insertFrom },
    scrollIntoView: true,
  });

  return true;
};

export const setTableCellValueCommand = (
  view: import("@codemirror/view").EditorView,
  context: TableCommandContext,
  value: string,
  cursor = value.length,
  focus:
    | {
        context: TableCommandContext;
        cursor: number;
      }
    | null = {
        context,
        cursor,
      }
): boolean => {
  return replaceActiveTableCellValue(view, context, value, focus);
};

export const addTableRowAboveCommand = (
  view: import("@codemirror/view").EditorView,
  context: TableCommandContext
): boolean => {
  if (context.section !== "body") {
    return false;
  }

  const table = findTableBlockAtRange(view.state.doc, context.tableFrom);
  if (!table) {
    return false;
  }

  const nextTable = addTableRow(table, context.row);
  return replaceTableInView(
    view,
    table.from,
    table.to,
    nextTable,
    {
      context: { ...context, row: context.row },
      cursor: 0,
    }
  );
};

export const addTableRowBelowCommand = (
  view: import("@codemirror/view").EditorView,
  context: TableCommandContext
): boolean => {
  const table = findTableBlockAtRange(view.state.doc, context.tableFrom);
  if (!table) {
    return false;
  }

  const nextRowIndex =
    context.section === "header" ? 0 : Math.min(context.row + 1, table.rows.length);
  const nextTable = addTableRow(table, nextRowIndex);

  return replaceTableInView(
    view,
    table.from,
    table.to,
    nextTable,
    {
      context: {
        ...context,
        section: "body",
        row: nextRowIndex,
      },
      cursor: 0,
    }
  );
};

export const removeTableRowCommand = (
  view: import("@codemirror/view").EditorView,
  context: TableCommandContext
): boolean => {
  if (context.section !== "body") {
    return false;
  }

  const table = findTableBlockAtRange(view.state.doc, context.tableFrom);
  if (!table) {
    return false;
  }

  const nextTable = removeTableRow(table, context.row);
  if (!nextTable) {
    return false;
  }

  const nextRow = Math.max(0, Math.min(context.row, nextTable.rows.length - 1));
  return replaceTableInView(
    view,
    table.from,
    table.to,
    nextTable,
    {
      context: {
        ...context,
        section: nextTable.rows.length > 0 ? "body" : "header",
        row: nextTable.rows.length > 0 ? nextRow : 0,
      },
      cursor: 0,
    }
  );
};

export const addTableColumnLeftCommand = (
  view: import("@codemirror/view").EditorView,
  context: TableCommandContext
): boolean => {
  const table = findTableBlockAtRange(view.state.doc, context.tableFrom);
  if (!table) {
    return false;
  }

  const nextTable = addTableColumn(table, context.column);
  return replaceTableInView(
    view,
    table.from,
    table.to,
    nextTable,
    {
      context: {
        ...context,
        column: context.column,
      },
      cursor: 0,
    }
  );
};

export const addTableColumnRightCommand = (
  view: import("@codemirror/view").EditorView,
  context: TableCommandContext
): boolean => {
  const table = findTableBlockAtRange(view.state.doc, context.tableFrom);
  if (!table) {
    return false;
  }

  const nextTable = addTableColumn(table, context.column + 1);
  return replaceTableInView(
    view,
    table.from,
    table.to,
    nextTable,
    {
      context: {
        ...context,
        column: context.column + 1,
      },
      cursor: 0,
    }
  );
};

export const removeTableColumnCommand = (
  view: import("@codemirror/view").EditorView,
  context: TableCommandContext
): boolean => {
  const table = findTableBlockAtRange(view.state.doc, context.tableFrom);
  if (!table) {
    return false;
  }

  const nextTable = removeTableColumn(table, context.column);
  if (!nextTable) {
    return false;
  }

  const nextColumn = Math.max(
    0,
    Math.min(context.column, nextTable.header.length - 1)
  );

  return replaceTableInView(
    view,
    table.from,
    table.to,
    nextTable,
    {
      context: {
        ...context,
        column: nextColumn,
      },
      cursor: 0,
    }
  );
};

export const snippetKeyBinding = (
  key: string,
  snippet: string,
  cursorOffset: number
): KeyBinding => ({
  key,
  preventDefault: true,
  run: createSnippetCommand(snippet, cursorOffset),
});

export const wrapSelectionKeyBinding = (
  key: string,
  options: WrapSelectionOptions
): KeyBinding => ({
  key,
  preventDefault: true,
  run: createWrapSelectionCommand(options),
});
