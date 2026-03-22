import { Text } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export type TableCellSection = "header" | "body";

export type MarkdownTable = {
  header: string[];
  rows: string[][];
};

export type TableBlock = MarkdownTable & {
  from: number;
  to: number;
  startLine: number;
  endLine: number;
};

export type TableCommandContext = {
  tableFrom: number;
  tableTo: number;
  section: TableCellSection;
  row: number;
  column: number;
};

type PendingTableFocus = TableCommandContext & {
  cursor: number;
};

const TABLE_CELL_SELECTOR = '[data-bedrock-table-cell="true"]';
const pendingTableFocus = new WeakMap<EditorView, PendingTableFocus>();

const normalizeCellText = (value: string): string => {
  return value.trim().replace(/\\\|/g, "|");
};

const splitTableCells = (line: string): string[] | null => {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) {
    return null;
  }

  const cells: string[] = [];
  let current = "";

  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];

    if (ch === "\\" && i + 1 < trimmed.length) {
      current += ch + trimmed[i + 1];
      i += 1;
      continue;
    }

    if (ch === "|") {
      cells.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  cells.push(current);

  if (trimmed.startsWith("|")) {
    cells.shift();
  }
  if (trimmed.endsWith("|")) {
    cells.pop();
  }

  const normalized = cells.map((cell) => normalizeCellText(cell));
  return normalized.length >= 1 ? normalized : null;
};

const isSeparatorCell = (value: string): boolean => {
  return /^:?-{3,}:?$/.test(value.trim());
};

const isFenceDelimiter = (line: string): boolean => {
  return /^```/.test(line.trim());
};

const parseTableRange = (lines: string[]): MarkdownTable | null => {
  if (lines.length < 2) {
    return null;
  }

  const header = splitTableCells(lines[0]);
  const separator = splitTableCells(lines[1]);
  if (!header || !separator || header.length !== separator.length) {
    return null;
  }

  if (separator.some((cell) => !isSeparatorCell(cell))) {
    return null;
  }

  const rows: string[][] = [];
  for (const line of lines.slice(2)) {
    const row = splitTableCells(line);
    if (!row || row.length !== header.length) {
      return null;
    }
    rows.push(row);
  }

  return { header, rows };
};

export const parseMarkdownTable = (markdown: string): MarkdownTable | null => {
  return parseTableRange(markdown.split("\n"));
};

export const findTableBlocks = (doc: Text): TableBlock[] => {
  const blocks: TableBlock[] = [];
  let inFence = false;

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);

    if (isFenceDelimiter(line.text)) {
      inFence = !inFence;
      continue;
    }

    if (inFence || lineNumber >= doc.lines) {
      continue;
    }

    const header = splitTableCells(line.text);
    const separatorLine = doc.line(lineNumber + 1);
    const separator = splitTableCells(separatorLine.text);

    if (
      !header ||
      !separator ||
      header.length !== separator.length ||
      separator.some((cell) => !isSeparatorCell(cell))
    ) {
      continue;
    }

    const tableLines = [line.text, separatorLine.text];
    let endLine = lineNumber + 1;

    for (let nextLine = lineNumber + 2; nextLine <= doc.lines; nextLine += 1) {
      const candidateLine = doc.line(nextLine);
      const candidateRow = splitTableCells(candidateLine.text);
      if (!candidateRow || candidateRow.length !== header.length) {
        break;
      }

      tableLines.push(candidateLine.text);
      endLine = nextLine;
    }

    const parsed = parseTableRange(tableLines);
    if (!parsed) {
      continue;
    }

    blocks.push({
      ...parsed,
      from: line.from,
      to: doc.line(endLine).to,
      startLine: lineNumber,
      endLine,
    });

    lineNumber = endLine;
  }

  return blocks;
};

export const findTableBlockAtRange = (
  doc: Text,
  from: number
): TableBlock | null => {
  return findTableBlocks(doc).find((block) => block.from === from) ?? null;
};

const escapeCell = (value: string): string => {
  return value.replace(/\|/g, "\\|");
};

const padCell = (value: string, width: number): string => {
  return value.padEnd(width, " ");
};

export const serializeMarkdownTable = (table: MarkdownTable): string => {
  const escapedHeader = table.header.map(escapeCell);
  const escapedRows = table.rows.map((row) => row.map(escapeCell));
  const widths = escapedHeader.map((cell, column) => {
    const maxBodyWidth = escapedRows.reduce((max, row) => {
      return Math.max(max, row[column]?.length ?? 0);
    }, 0);

    return Math.max(3, cell.length, maxBodyWidth);
  });

  const renderRow = (row: string[]): string => {
    return `| ${row
      .map((cell, column) => padCell(cell, widths[column]))
      .join(" | ")} |`;
  };

  const separator = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
  const lines = [renderRow(escapedHeader), separator];

  for (const row of escapedRows) {
    lines.push(renderRow(row));
  }

  return lines.join("\n");
};

export const createDefaultMarkdownTable = (): MarkdownTable => ({
  header: ["Column 1", "Column 2", "Column 3"],
  rows: [
    ["", "", ""],
    ["", "", ""],
  ],
});

export const updateTableCell = (
  table: MarkdownTable,
  context: TableCommandContext,
  value: string
): MarkdownTable => {
  if (context.section === "header") {
    return {
      ...table,
      header: table.header.map((cell, index) =>
        index === context.column ? value : cell
      ),
    };
  }

  return {
    ...table,
    rows: table.rows.map((row, rowIndex) =>
      rowIndex === context.row
        ? row.map((cell, columnIndex) =>
            columnIndex === context.column ? value : cell
          )
        : row
    ),
  };
};

export const addTableRow = (
  table: MarkdownTable,
  rowIndex: number
): MarkdownTable => {
  const nextRows = [...table.rows];
  nextRows.splice(rowIndex, 0, new Array(table.header.length).fill(""));
  return { ...table, rows: nextRows };
};

export const removeTableRow = (
  table: MarkdownTable,
  rowIndex: number
): MarkdownTable | null => {
  if (rowIndex < 0 || rowIndex >= table.rows.length) {
    return null;
  }

  return {
    ...table,
    rows: table.rows.filter((_, index) => index !== rowIndex),
  };
};

export const addTableColumn = (
  table: MarkdownTable,
  columnIndex: number
): MarkdownTable => {
  return {
    header: [
      ...table.header.slice(0, columnIndex),
      "",
      ...table.header.slice(columnIndex),
    ],
    rows: table.rows.map((row) => [
      ...row.slice(0, columnIndex),
      "",
      ...row.slice(columnIndex),
    ]),
  };
};

export const removeTableColumn = (
  table: MarkdownTable,
  columnIndex: number
): MarkdownTable | null => {
  if (table.header.length <= 1) {
    return null;
  }

  return {
    header: table.header.filter((_, index) => index !== columnIndex),
    rows: table.rows.map((row) => row.filter((_, index) => index !== columnIndex)),
  };
};

export const getTableContextFromTarget = (
  target: EventTarget | null
): TableCommandContext | null => {
  const element =
    target instanceof Element
      ? target.closest<HTMLElement>(TABLE_CELL_SELECTOR)
      : null;

  if (!element) {
    return null;
  }

  const tableFrom = Number(element.dataset.tableFrom);
  const tableTo = Number(element.dataset.tableTo);
  const row = Number(element.dataset.tableRow);
  const column = Number(element.dataset.tableColumn);
  const section = element.dataset.tableSection;

  if (
    !Number.isFinite(tableFrom) ||
    !Number.isFinite(tableTo) ||
    !Number.isFinite(row) ||
    !Number.isFinite(column) ||
    (section !== "header" && section !== "body")
  ) {
    return null;
  }

  return {
    tableFrom,
    tableTo,
    row,
    column,
    section,
  };
};

export const setPendingTableFocus = (
  view: EditorView,
  context: TableCommandContext,
  cursor: number
): void => {
  pendingTableFocus.set(view, { ...context, cursor });
};

export const restorePendingTableFocus = (view: EditorView): void => {
  const pending = pendingTableFocus.get(view);
  if (!pending) {
    return;
  }

  const schedule =
    globalThis.requestAnimationFrame ??
    ((callback: FrameRequestCallback) =>
      globalThis.setTimeout(() => callback(0), 0));

  schedule(() => {
    const latest = pendingTableFocus.get(view);
    if (!latest) {
      return;
    }

    const selector = `${TABLE_CELL_SELECTOR}[data-table-from="${latest.tableFrom}"][data-table-section="${latest.section}"][data-table-row="${latest.row}"][data-table-column="${latest.column}"]`;
    const input = view.dom.querySelector<HTMLInputElement>(selector);
    if (!input) {
      return;
    }

    input.focus();
    const cursor = Math.min(latest.cursor, input.value.length);
    try {
      input.setSelectionRange(cursor, cursor);
    } catch {
      // Inputs without a selection API can still be focused safely.
    }
    pendingTableFocus.delete(view);
  });
};
