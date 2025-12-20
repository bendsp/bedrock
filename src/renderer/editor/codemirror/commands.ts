import { KeyBinding } from "@codemirror/view";

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
   * Inserted when there's no selection. Defaults to `${before}${after}`.
   */
  emptySnippet?: string;
  /**
   * Cursor position (relative to `from`) after inserting `emptySnippet`.
   * Defaults to `before.length`.
   */
  emptyCursorOffset?: number;
};

/**
 * Wraps the current selection with a prefix/suffix. If there's no selection,
 * inserts a snippet and places the cursor inside it.
 */
export const createWrapSelectionCommand =
  ({
    before,
    after,
    emptySnippet = `${before}${after}`,
    emptyCursorOffset = before.length,
  }: WrapSelectionOptions) =>
  (view: import("@codemirror/view").EditorView): boolean => {
    let { from, to } = view.state.selection.main;

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
    emptySnippet = `${before}${after}`,
    emptyCursorOffset = before.length,
    wrapWordWhenEmpty = true,
  }: WrapSelectionOrWordOptions) =>
  (view: import("@codemirror/view").EditorView): boolean => {
    let { from, to } = view.state.selection.main;

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
  const urlPlaceholder = "url";

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
    selection: { anchor: urlStart, head: urlStart + urlPlaceholder.length },
    scrollIntoView: true,
  });
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
