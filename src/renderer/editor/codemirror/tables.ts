import { activeTableCells } from "./tableCellContext";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { syntaxTree } from "@codemirror/language";

export type TableRow = {
  cells: string[];
  starts: number[];
  ends: number[];
  editStarts: number[];
  editEnds: number[];
  leadingPipe: boolean;
  trailingPipe: boolean;
};
/** GFM pipes must be escaped even in inline code. Keep source offsets for cell navigation. */
export function splitTableRow(text: string): TableRow {
  const pipes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === "|") pipes.push(i);
  }
  const left =
    pipes[0] === text.length - text.trimStart().length
      ? (pipes.shift() ?? -1) + 1
      : 0;
  const right =
    pipes.length && pipes[pipes.length - 1] === text.trimEnd().length - 1
      ? (pipes.pop() ?? text.length)
      : text.length;
  const bounds = [left - 1, ...pipes, right];
  const starts: number[] = [],
    ends: number[] = [],
    cells: string[] = [],
    editStarts: number[] = [],
    editEnds: number[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const raw = text.slice(bounds[i] + 1, bounds[i + 1]);
    const start =
      bounds[i] +
      1 +
      (raw.trim()
        ? raw.length - raw.trimStart().length
        : Math.min(1, raw.length));
    starts.push(start);
    ends.push(start + raw.trim().length);
    cells.push(raw.trim());
    const editStart = bounds[i] + 1 + (raw.startsWith(" ") ? 1 : 0);
    editStarts.push(editStart);
    editEnds.push(
      Math.max(editStart, bounds[i + 1] - (raw.endsWith(" ") ? 1 : 0)),
    );
  }
  return {
    cells,
    starts,
    ends,
    editStarts,
    editEnds,
    leadingPipe: left > 0,
    trailingPipe: right < text.length,
  };
}
export function tableAtPosition(state: EditorState, position: number) {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(position, 1);
  while (node && node.name !== "Table") node = node.parent;
  if (!node) return null;
  const doc = state.doc;
  const first = doc.lineAt(node.from).number,
    last = doc.lineAt(node.to).number;
  const rowNodes = new Map<number, SyntaxNode>();
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (["TableHeader", "TableDelimiter", "TableRow"].includes(child.name))
      rowNodes.set(doc.lineAt(child.from).number, child);
  }
  const rows = [];
  const prefixes: string[] = [];
  for (let n = first; n <= last; n++) {
    const line = doc.line(n);
    const child = rowNodes.get(n);
    const offset = child ? child.from - line.from : 0;
    prefixes.push(line.text.slice(0, offset));
    const row = splitTableRow(line.text.slice(offset));
    rows.push({
      ...row,
      starts: row.starts.map((pos) => pos + offset),
      ends: row.ends.map((pos) => pos + offset),
      editStarts: row.editStarts.map((pos) => pos + offset),
      editEnds: row.editEnds.map((pos) => pos + offset),
    });
  }
  const line = doc.lineAt(position);
  const row = line.number - first;
  const column = Math.min(
    rows[0].cells.length - 1,
    Math.max(
      0,
      rows[row].editStarts.filter((start) => start <= position - line.from)
        .length - 1,
    ),
  );
  return { node, first, last, rows, row, column, prefixes };
}
export const tableAt = (view: EditorView) => {
  const cell = activeTableCells.get(view),
    selection = view.state.selection.main;
  if (cell && selection.from >= cell.from && selection.to <= cell.to) {
    const table = tableAtPosition(view.state, cell.tableFrom);
    if (table) return { ...table, row: cell.row, column: cell.column };
  }
  return tableAtPosition(view.state, selection.head);
};

/** Keep empty edge cells unambiguous without rewriting untouched cell contents. */
export function tableCellChange(
  state: EditorState,
  table: NonNullable<ReturnType<typeof tableAtPosition>>,
  row: number,
  column: number,
  source: string,
) {
  const line = state.doc.line(table.first + row),
    cell = table.rows[row];
  if (column >= cell.cells.length) {
    // Missing GFM cells stay virtual until the user actually types into one.
    const added = Array<string>(column + 1 - cell.cells.length).fill("");
    added[added.length - 1] = source;
    const insert = `${cell.trailingPipe ? "" : " |"} ${added.join(" | ")} |`;
    return {
      changes: { from: line.to, insert },
      contentFrom: line.to + insert.length - source.length - 2,
    };
  }
  const from = line.from + cell.editStarts[column],
    to = line.from + cell.editEnds[column];
  if (cell.leadingPipe && cell.trailingPipe)
    return { changes: { from, to, insert: source }, contentFrom: from };
  const start = line.from + table.prefixes[row].length;
  const leading = cell.leadingPipe ? "" : "| ",
    trailing = cell.trailingPipe ? "" : " |";
  return {
    changes: {
      from: start,
      to: line.to,
      insert:
        leading +
        state.doc.sliceString(start, from) +
        source +
        state.doc.sliceString(to, line.to) +
        trailing,
    },
    contentFrom: from + leading.length,
  };
}
const rowText = (cells: string[]) => `| ${cells.join(" | ")} |`;
function updateTable(
  view: EditorView,
  cells: string[][],
  row: number,
  column: number,
): boolean {
  const table = tableAt(view);
  if (!table) return false;
  const lines = cells.map(
    (row, index) => (table.prefixes[index === 0 ? 0 : 1] ?? "") + rowText(row),
  );
  row = Math.max(0, Math.min(row, lines.length - 1));
  column = Math.max(0, Math.min(column, cells[0].length - 1));
  const position =
    view.state.doc.line(table.first).from +
    lines.slice(0, row).reduce((sum, line) => sum + line.length + 1, 0) +
    (table.prefixes[row === 0 ? 0 : 1]?.length ?? 0) +
    splitTableRow(rowText(cells[row])).starts[column];
  view.dispatch({
    changes: {
      from: view.state.doc.line(table.first).from,
      to: table.node.to,
      insert: lines.join("\n"),
    },
    selection: { anchor: position },
    userEvent: "input",
    scrollIntoView: true,
  });
  return true;
}
export const insertTable = (view: EditorView): boolean => {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const prefix = line.text.trim() ? "\n\n" : "";
  const from = line.text.trim() ? line.to : line.from;
  const source = `${prefix}| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n`;
  view.dispatch({
    changes: { from, insert: source },
    selection: {
      anchor: from + prefix.length + 2,
      head: from + prefix.length + 10,
    },
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
};
export const tableCommand =
  (
    action:
      | "row.add"
      | "row.addAbove"
      | "row.delete"
      | "row.moveUp"
      | "row.moveDown"
      | "column.add"
      | "column.addLeft"
      | "column.delete"
      | "column.moveLeft"
      | "column.moveRight"
      | "delete"
      | "align.left"
      | "align.center"
      | "align.right"
      | "format",
  ) =>
  (view: EditorView): boolean => {
    const table = tableAt(view);
    if (!table) return false;
    if (action === "delete") {
      const from = view.state.doc.line(table.first).from;
      view.dispatch({
        changes: {
          from,
          to: Math.min(view.state.doc.length, table.node.to + 1),
        },
        selection: { anchor: from },
        userEvent: "delete.table",
      });
      return true;
    }
    const cells = table.rows.map((row) => [...row.cells]);
    const width = cells[0].length;
    for (const row of cells) {
      while (row.length < width) row.push("");
    }
    let { row, column } = table;
    if (action === "row.add" || action === "row.addAbove") {
      row = Math.max(2, row + (action === "row.add" ? 1 : 0));
      cells.splice(row, 0, Array(width).fill(""));
    }
    if (action === "row.delete") {
      if (row < 2) return false;
      cells.splice(row, 1);
      row = Math.min(row, cells.length - 1);
      if (row === 1) row = 0;
    }
    if (action === "row.moveUp" || action === "row.moveDown") {
      const next = row + (action === "row.moveUp" ? -1 : 1);
      if (row < 2 || next < 2 || next >= cells.length) return false;
      [cells[row], cells[next]] = [cells[next], cells[row]];
      row = next;
    }
    if (action === "column.add" || action === "column.addLeft") {
      if (action === "column.add") column++;
      cells.forEach((r, i) => r.splice(column, 0, i === 1 ? "---" : ""));
    }
    if (action === "column.delete") {
      if (width <= 1) return false;
      cells.forEach((r) => r.splice(column, 1));
      column--;
    }
    if (action === "column.moveLeft" || action === "column.moveRight") {
      const next = column + (action === "column.moveLeft" ? -1 : 1);
      if (next < 0 || next >= width) return false;
      for (const cellsInRow of cells)
        [cellsInRow[column], cellsInRow[next]] = [
          cellsInRow[next],
          cellsInRow[column],
        ];
      column = next;
    }
    if (action.startsWith("align."))
      cells[1][column] =
        action === "align.left"
          ? ":---"
          : action === "align.center"
            ? ":---:"
            : "---:";
    return updateTable(view, cells, row, column);
  };
export const navigateTable =
  (direction: 1 | -1) =>
  (view: EditorView): boolean => {
    const table = tableAt(view);
    if (!table) return false;
    let { row, column } = table;
    column += direction;
    if (column >= table.rows[0].cells.length) {
      column = 0;
      row++;
      if (row === 1) row++;
    }
    if (column < 0) {
      column = table.rows[0].cells.length - 1;
      row--;
      if (row === 1) row--;
    }
    if (row < 0) return false;
    if (row >= table.rows.length) return tableCommand("row.add")(view);
    return selectTableCell(view, row, column);
  };

/** GFM uses one physical line per row. Literal pipes and cell line breaks must stay inside the cell. */
export function encodeTableCell(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i],
      next = text[i + 1];
    if (char === "\n" || char === "\r") {
      result += "<br>";
      if (char === "\r" && next === "\n") i++;
      continue;
    }
    if (
      char === "\\" &&
      (next === undefined || next === "\n" || next === "\r")
    ) {
      result += "\\\\";
      continue;
    }
    if (char === "\\" && next !== undefined) {
      result += char + text[++i];
      continue;
    }
    result += char === "|" ? "\\|" : char;
  }
  return result;
}

/** Clipboard TSV is a grid; quoted fields may contain tabs, newlines and escaped quotes. */
export function parseClipboardTable(text: string): string[][] {
  const rows: string[][] = [[]];
  let value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && (quoted || value === "")) {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (char === "\t" || char === "\n" || char === "\r")) {
      rows[rows.length - 1].push(value);
      value = "";
      if (char !== "\t") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        rows.push([]);
      }
    } else value += char;
  }
  rows[rows.length - 1].push(value);
  if (
    rows.length > 1 &&
    rows[rows.length - 1].length === 1 &&
    rows[rows.length - 1][0] === ""
  )
    rows.pop();
  return rows;
}

export function pasteTableCells(view: EditorView, text: string): boolean {
  const table = tableAt(view);
  if (!table) return false;
  const values = parseClipboardTable(text);
  const cells = table.rows.map((row) => [...row.cells]);
  const width = Math.max(
    cells[0].length,
    table.column + Math.max(...values.map((row) => row.length)),
  );
  for (let row = 0; row < cells.length; row++)
    while (cells[row].length < width) cells[row].push(row === 1 ? "---" : "");
  let row = table.row === 1 ? 0 : table.row;
  for (const valuesRow of values) {
    while (cells.length <= row) cells.push(Array(width).fill(""));
    valuesRow.forEach((value, index) => {
      cells[row][table.column + index] = encodeTableCell(value);
    });
    row++;
    if (row === 1) row++;
  }
  return updateTable(
    view,
    cells,
    table.row === 1 ? 0 : table.row,
    table.column,
  );
}

export function selectTableCell(
  view: EditorView,
  row: number,
  column: number,
): boolean {
  let table = tableAt(view);
  if (!table) return false;
  if (!table.rows[row] || column < 0 || column >= table.rows[0].cells.length)
    return false;
  const active = activeTableCells.get(view);
  if (active && active.tableFrom === table.node.from)
    return active.select(row, column);
  if (table.rows[row].starts[column] === undefined) {
    tableCommand("format")(view);
    table = tableAt(view);
    if (!table) return false;
  }
  const line = view.state.doc.line(table.first + row),
    cell = table.rows[row];
  const from = cell.starts[column],
    to = cell.ends[column];
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  view.dispatch({
    selection: { anchor: line.from + from, head: line.from + to },
    scrollIntoView: true,
  });
  return true;
}
