import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";

export type ActiveFormats = {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  inlineCode: boolean;
};

/**
 * Detect active Markdown formatting at the current selection.
 */
export function getActiveFormats(view: EditorView): ActiveFormats {
  const tree = syntaxTree(view.state);
  const currentSel = view.state.selection.main;
  const checkPos =
    currentSel.from === currentSel.to ? currentSel.from : currentSel.from + 1;

  let bold = false;
  let italic = false;
  let strikethrough = false;
  let inlineCode = false;

  let node = tree.resolveInner(checkPos, 1);
  while (node) {
    if (node.name === "StrongEmphasis") bold = true;
    if (node.name === "Emphasis") italic = true;
    if (node.name === "Strikethrough") strikethrough = true;
    if (node.name === "InlineCode") inlineCode = true;
    node = node.parent;
  }

  return { bold, italic, strikethrough, inlineCode };
}
