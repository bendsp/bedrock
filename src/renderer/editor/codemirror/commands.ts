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
    const { from, to } = view.state.selection.main;

    if (from === to) {
      view.dispatch({
        changes: { from, to, insert: emptySnippet },
        selection: { anchor: from + emptyCursorOffset },
        scrollIntoView: true,
      });
      return true;
    }

    const selectedText = view.state.doc.sliceString(from, to);
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

export const createMarkdownLinkCommand = (
  view: import("@codemirror/view").EditorView
): boolean => {
  const { from, to } = view.state.selection.main;
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

  const selectedText = view.state.doc.sliceString(from, to);
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
