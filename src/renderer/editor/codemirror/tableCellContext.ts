import type { EditorView } from "@codemirror/view";

export type CellContext = {
  editor: EditorView;
  from: number;
  to: number;
  focus: () => void;
  tableFrom: number;
  row: number;
  column: number;
  select: (row: number, column: number) => boolean;
};
export const tableFocusers = new WeakMap<EditorView, () => boolean>();
export const activeTableCells = new WeakMap<EditorView, CellContext>();
export const tableCellOwners = new WeakMap<EditorView, EditorView>();

export function activeTableCell(view: EditorView): EditorView | null {
  const cell = activeTableCells.get(view);
  const { from, to } = view.state.selection.main;
  return cell && from >= cell.from && to <= cell.to ? cell.editor : null;
}
export function focusMarkdownEditor(view: EditorView) {
  if (tableFocusers.get(view)?.()) return;
  const cell = activeTableCells.get(view);
  if (cell && activeTableCell(view)) cell.focus();
  else view.focus();
}
