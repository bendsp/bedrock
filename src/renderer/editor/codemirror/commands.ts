import { KeyBinding } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

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

export const insertHorizontalRuleCommand = (
  view: import("@codemirror/view").EditorView
): boolean => {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);

  // If we're on an empty line, just insert it.
  // Otherwise, insert it on a new line.
  if (line.text.trim() === "") {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: "---" },
      selection: { anchor: line.from + 3 },
      scrollIntoView: true,
    });
  } else {
    // Insert on a new line after the current line
    view.dispatch({
      changes: { from: line.to, insert: "\n---\n" },
      selection: { anchor: line.to + 5 }, // \n + --- + \n
      scrollIntoView: true,
    });
  }
  return true;
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
