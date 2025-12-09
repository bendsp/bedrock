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

export const snippetKeyBinding = (
  key: string,
  snippet: string,
  cursorOffset: number
): KeyBinding => ({
  key,
  preventDefault: true,
  run: createSnippetCommand(snippet, cursorOffset),
});
