import { blockPreviews } from "./markdownWidgets";
import {
  markdownDocument,
  refreshMarkdownContext,
  getMarkdownContext,
} from "./markdownContext";
import { linkClickHandler, followRenderedLink } from "./links";
import {
  hydrateMarkdownImages,
  disposeMarkdownImages,
} from "../../lib/markdownImages";
import {
  EditorState,
  StateField,
  Transaction,
  Range,
  Compartment,
  Prec,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
  keymap,
  drawSelection,
  ViewPlugin,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { defaultKeymap, undo, redo } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { safeMarkdownHtml, MarkdownEnvironment } from "../../lib/markdown";
import { noteMarkdown } from "./markdownLanguage";
import { markdownDecorations } from "./markdownDecorations";
import {
  tableAtPosition,
  tableAt,
  tableCommand,
  navigateTable,
  encodeTableCell,
  pasteTableCells,
  selectTableCell,
  tableCellChange,
} from "./tables";
import {
  activeTableCells,
  tableCellOwners,
  tableFocusers,
} from "./tableCellContext";

type Table = NonNullable<ReturnType<typeof tableAtPosition>>;
type TableModel = {
  table: Table;
  references: string;
  environment: MarkdownEnvironment;
  source: string;
};
const controllers = new WeakMap<HTMLElement, TableEditor>();
const visibleTables = new WeakMap<EditorView, Set<TableEditor>>();

type ActiveCell = {
  row: number;
  column: number;
  editor: EditorView;
  host: HTMLElement;
  lock: Compartment;
  bindings: Compartment;
};

/** One embedded CodeMirror instance per active table; inactive cells are inexpensive HTML. */
class TableEditor {
  readonly dom = document.createElement("div");
  private readonly grid = document.createElement("table");
  private active: ActiveCell | null = null;
  private syncing = false;
  private shape = "";
  private cells = new Map<string, HTMLElement>();
  private html = new WeakMap<HTMLElement, string>();

  constructor(
    private outer: EditorView,
    private model: TableModel,
  ) {
    this.dom.className = "cm-rich-table";
    this.dom.contentEditable = "false";
    this.dom.setAttribute("aria-label", "Editable Markdown table");
    this.dom.append(this.grid);
    controllers.set(this.dom, this);
    const set = visibleTables.get(outer) ?? new Set();
    set.add(this);
    visibleTables.set(outer, set);
    tableFocusers.set(outer, () => {
      for (const table of visibleTables.get(outer) ?? [])
        if (table.focusSelected()) return true;
      return false;
    });
    this.update(model);
  }

  private cellContext(row: number, column: number) {
    return {
      tableFrom: this.model.table.node.from,
      row,
      column,
      select: (nextRow: number, nextColumn: number) => {
        this.activate(nextRow, nextColumn, true);
        return true;
      },
    };
  }

  private position(row: number, column: number) {
    const table = this.model.table,
      line = this.outer.state.doc.line(table.first + row),
      cell = table.rows[row];
    return {
      from: line.from + (cell.editStarts[column] ?? line.text.length),
      to: line.from + (cell.editEnds[column] ?? line.text.length),
    };
  }

  private source(row: number, column: number) {
    const range = this.position(row, column);
    return this.outer.state.doc.sliceString(range.from, range.to);
  }

  update(model: TableModel) {
    const restoreCellFocus = this.active?.editor.hasFocus ?? false;
    const contextChanged = this.model.references !== model.references;
    this.model = model;
    const { table } = model;
    const width = table.rows[0].cells.length;
    const shape = `${table.rows.length}:${width}`;
    if (this.shape !== shape) {
      this.closeCell();
      for (const host of this.cells.values()) disposeMarkdownImages(host);
      this.grid.replaceChildren();
      this.cells.clear();
      this.shape = shape;
      if (restoreCellFocus) queueMicrotask(() => this.focusSelected());
      for (let row = 0; row < table.rows.length; row++) {
        if (row === 1) continue;
        const tr = this.grid.insertRow();
        for (let column = 0; column < width; column++) {
          const td = document.createElement(row === 0 ? "th" : "td");
          const host = document.createElement("div");
          host.className = "cm-table-cell";
          host.tabIndex = 0;
          host.setAttribute("role", "textbox");
          host.setAttribute(
            "aria-label",
            `${row === 0 ? "Header" : `Row ${row - 1}`} column ${column + 1}`,
          );
          host.addEventListener("mousedown", (event) => {
            if (followRenderedLink(event, this.outer)) return;
            if (this.active?.host === host) return;
            event.preventDefault();
            this.activate(row, column, true);
            const editor = this.active?.editor;
            const position = editor?.posAtCoords({
              x: event.clientX,
              y: event.clientY,
            });
            if (editor && position != null)
              editor.dispatch({ selection: { anchor: position } });
          });
          host.addEventListener("click", (event) => {
            if (event.target instanceof Element && event.target.closest("a"))
              event.preventDefault();
          });
          host.addEventListener("focus", () => {
            if (this.active?.host !== host) this.activate(row, column, true);
          });
          host.addEventListener("contextmenu", () => {
            if (this.active?.host !== host) this.activate(row, column, false);
          });
          td.append(host);
          tr.append(td);
          this.cells.set(`${row}:${column}`, host);
        }
      }
    }
    for (const [key, host] of this.cells) {
      const [row, column] = key.split(":").map(Number);
      const alignment = table.rows[1].cells[column] ?? "---";
      host
        .closest("th, td")
        ?.setAttribute(
          "align",
          alignment.endsWith(":")
            ? alignment.startsWith(":")
              ? "center"
              : "right"
            : "left",
        );
      host.style.textAlign = alignment.endsWith(":")
        ? alignment.startsWith(":")
          ? "center"
          : "right"
        : "left";
      if (this.active?.host === host) continue;
      const source = this.source(row, column);
      if (this.html.get(host) !== source + model.references) {
        disposeMarkdownImages(host);
        host.innerHTML =
          safeMarkdownHtml(source, true, model.environment) || "<br>";
        hydrateMarkdownImages(
          host,
          () => this.outer.requestMeasure(),
          this.outer,
        );
        this.html.set(host, source + model.references);
      }
    }
    if (contextChanged && this.active)
      this.active.editor.dispatch({ effects: refreshMarkdownContext.of(null) });
    this.syncSelection();
    this.dom.classList.toggle(
      "cm-rich-table-quoted",
      table.prefixes[0].includes(">"),
    );
  }

  private syncSelection() {
    if (this.active) {
      const { row, column, editor } = this.active;
      const source = this.source(row, column);
      const range = this.position(row, column);
      activeTableCells.set(this.outer, {
        editor,
        ...range,
        ...this.cellContext(row, column),
        focus: () => editor.focus(),
      });
      const selection = this.outer.state.selection.main;
      if (selection.from >= range.from && selection.to <= range.to) {
        const anchor = Math.min(source.length, selection.anchor - range.from),
          head = Math.min(source.length, selection.head - range.from);
        if (
          editor.state.doc.toString() !== source ||
          editor.state.selection.main.anchor !== anchor ||
          editor.state.selection.main.head !== head
        ) {
          this.syncing = true;
          editor.dispatch({
            changes:
              editor.state.doc.toString() === source
                ? undefined
                : { from: 0, to: editor.state.doc.length, insert: source },
            selection: { anchor, head },
          });
          this.syncing = false;
        }
      }
    }
  }

  syncLock() {
    if (!this.active) return;
    const readOnly = this.outer.state.facet(EditorState.readOnly);
    if (this.active.editor.state.facet(EditorState.readOnly) !== readOnly) {
      this.active.editor.dispatch({
        effects: this.active.lock.reconfigure([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
      });
    }
  }

  syncKeymap() {
    this.active?.editor.dispatch({
      effects: this.active.bindings.reconfigure(
        keymap.of(this.outer.state.facet(keymap).flat()),
      ),
    });
  }

  focusSelected(): boolean {
    if (this.outer.state.facet(EditorState.readOnly)) return false;
    const table = this.model.table,
      pos = this.outer.state.selection.main.head;
    if (pos < table.node.from || pos > table.node.to) return false;
    if (this.active) {
      const range = this.position(this.active.row, this.active.column);
      if (pos >= range.from && pos <= range.to) {
        this.active.editor.focus();
        return true;
      }
    }
    const current = tableAtPosition(this.outer.state, pos);
    if (!current) return false;
    const row = current.row === 1 ? 0 : current.row;
    this.activate(row, current.column, false);
    this.active?.editor.focus();
    return true;
  }

  private activate(row: number, column: number, select: boolean) {
    if (
      !this.outer.state.facet(EditorState.readOnly) &&
      this.outer.state.facet(EditorView.editable)
    ) {
      const host = this.cells.get(`${row}:${column}`);
      if (!host) return;
      if (this.active?.host !== host) {
        this.closeCell();
        disposeMarkdownImages(host);
        host.replaceChildren();
        this.html.delete(host);
        const source = this.source(row, column);
        const lock = new Compartment(),
          bindings = new Compartment();
        const cellEditor = new EditorView({
          parent: host,
          state: EditorState.create({
            doc: source,
            extensions: [
              lock.of([
                EditorState.readOnly.of(
                  this.outer.state.facet(EditorState.readOnly),
                ),
                EditorView.editable.of(
                  this.outer.state.facet(EditorView.editable),
                ),
              ]),
              EditorState.transactionFilter.of((tr) =>
                tr.docChanged &&
                this.outer.state.facet(EditorState.readOnly) &&
                !this.syncing
                  ? []
                  : tr,
              ),
              markdown({ extensions: [GFM, noteMarkdown] }),
              markdownDocument.of(() => this.outer.state),
              blockPreviews,
              markdownDecorations,
              linkClickHandler,
              drawSelection(),
              EditorView.lineWrapping,
              EditorView.contentAttributes.of({
                "aria-label": host.getAttribute("aria-label") ?? "Table cell",
                "data-table-cell": "true",
              }),
              EditorView.theme({
                "&": { background: "transparent", fontSize: "inherit" },
                ".cm-content": { padding: "0", minHeight: "1.5em" },
                ".cm-line": { padding: "0" },
                ".cm-scroller": { fontFamily: "inherit", overflow: "visible" },
                "&.cm-focused": { outline: "none" },
              }),
              EditorView.domEventHandlers({
                paste: (event) => {
                  const text = event.clipboardData?.getData("text/plain");
                  if (!text?.includes("\t")) return false;
                  event.preventDefault();
                  pasteTableCells(this.outer, text);
                  this.focusSelected();
                  return true;
                },
              }),
              keymap.of([
                { key: "ArrowDown", run: () => this.arrow("down") },
                { key: "ArrowUp", run: () => this.arrow("up") },
                { key: "ArrowLeft", run: () => this.arrow("left") },
                { key: "ArrowRight", run: () => this.arrow("right") },
                { key: "Tab", run: () => this.move(1) },
                { key: "Shift-Tab", run: () => this.move(-1) },
                { key: "Enter", run: () => this.nextRow() },
                {
                  key: "Shift-Enter",
                  run: (view) => {
                    view.dispatch(view.state.replaceSelection("<br>"));
                    return true;
                  },
                },
                { key: "Escape", run: () => this.leave() },
              ]),
              bindings.of(keymap.of(this.outer.state.facet(keymap).flat())),
              keymap.of([
                { key: "Mod-z", run: () => undo(this.outer) },
                { key: "Mod-Shift-z", run: () => redo(this.outer) },
                { key: "Mod-y", run: () => redo(this.outer) },
              ]),
              keymap.of(defaultKeymap),
            ],
          }),
          dispatchTransactions: (transactions, editor) => {
            editor.update(transactions);
            if (
              this.syncing ||
              !this.active ||
              !transactions.some((tr) => tr.docChanged || tr.selection)
            )
              return;
            const range = this.position(this.active.row, this.active.column);
            const text = editor.state.doc.toString(),
              source = encodeTableCell(text);
            const changed = transactions.some((tr) => tr.docChanged);
            const edit = changed
              ? tableCellChange(
                  this.outer.state,
                  this.model.table,
                  this.active.row,
                  this.active.column,
                  source,
                )
              : null;
            const contentFrom = edit?.contentFrom ?? range.from;
            const selection = editor.state.selection.main;
            const anchor =
              contentFrom +
              encodeTableCell(text.slice(0, selection.anchor)).length;
            const head =
              contentFrom +
              encodeTableCell(text.slice(0, selection.head)).length;
            this.outer.dispatch({
              changes: edit?.changes,
              selection: { anchor, head },
              annotations: changed
                ? Transaction.userEvent.of(
                    transactions
                      .find((tr) => tr.docChanged)
                      ?.annotation(Transaction.userEvent) ?? "input",
                  )
                : undefined,
            });
          },
        });
        tableCellOwners.set(cellEditor, this.outer);
        this.active = { row, column, editor: cellEditor, host, lock, bindings };
      }
      if (!this.active) return;
      const range = this.position(row, column),
        editor = this.active.editor;
      activeTableCells.set(this.outer, {
        editor,
        ...range,
        ...this.cellContext(row, column),
        focus: () => editor.focus(),
      });
      if (select)
        this.outer.dispatch({
          selection: { anchor: range.from, head: range.to },
        });
      this.syncSelection();
      editor.focus();
    }
  }

  contains(position: number) {
    return this.model.table.node.from === position;
  }

  enter(forward: boolean, x?: number) {
    const row =
      forward || this.model.table.rows.length === 2
        ? 0
        : this.model.table.rows.length - 1;
    let column = 0;
    if (x !== undefined) {
      let distance = Infinity;
      for (let col = 0; col < this.model.table.rows[0].cells.length; col++) {
        const box = this.cells.get(`${row}:${col}`)?.getBoundingClientRect();
        if (!box) continue;
        const next = Math.max(box.left - x, x - box.right, 0);
        if (next < distance) {
          distance = next;
          column = col;
        }
      }
    }
    this.place(row, column, forward, x);
    return true;
  }

  private place(row: number, column: number, forward: boolean, x?: number) {
    const range = this.position(row, column);
    this.outer.dispatch({
      selection: { anchor: forward ? range.from : range.to },
    });
    this.activate(row, column, false);
    const editor = this.active?.editor;
    if (editor && x !== undefined) {
      const edge = editor.coordsAtPos(forward ? 0 : editor.state.doc.length);
      if (edge) {
        const anchor = editor.posAtCoords({
          x,
          y: (edge.top + edge.bottom) / 2,
        });
        if (anchor !== null)
          editor.dispatch({ selection: { anchor }, scrollIntoView: true });
      }
    }
    editor?.dispatch({ scrollIntoView: true });
  }

  private arrow(direction: "up" | "down" | "left" | "right") {
    if (!this.active) return false;
    const { editor, row, column } = this.active;
    const selection = editor.state.selection.main;
    if (!selection.empty && (direction === "left" || direction === "right"))
      return false;
    const forward = direction === "down" || direction === "right";
    const vertical = direction === "down" || direction === "up";
    const edge = forward ? editor.state.doc.length : 0;
    // Leave wrapped content only from its first or last visual line.
    if (
      (vertical
        ? editor.moveToLineBoundary(selection, forward, true).head
        : selection.head) !== edge
    )
      return false;
    const width = this.model.table.rows[0].cells.length;
    let nextRow = row,
      nextColumn = column;
    if (vertical)
      nextRow = forward ? (row === 0 ? 2 : row + 1) : row === 2 ? 0 : row - 1;
    else {
      nextColumn += forward ? 1 : -1;
      if (nextColumn >= width) {
        nextColumn = 0;
        nextRow = row === 0 ? 2 : row + 1;
      }
      if (nextColumn < 0) {
        nextColumn = width - 1;
        nextRow = row === 2 ? 0 : row - 1;
      }
    }
    if (nextRow < 0 || nextRow >= this.model.table.rows.length) {
      // Arrow navigation never creates rows or changes the document at its edges.
      if (
        (!forward && this.model.table.first === 1) ||
        (forward && this.model.table.node.to === this.outer.state.doc.length)
      )
        return true;
      return this.leave(!forward);
    }
    const x = vertical ? editor.coordsAtPos(selection.head)?.left : undefined;
    this.place(nextRow, nextColumn, forward, x);
    return true;
  }

  private move(direction: 1 | -1) {
    const table = this.model.table;
    const last =
      this.active?.row === table.rows.length - 1 &&
      this.active?.column === table.rows[0].cells.length - 1;
    if (!navigateTable(direction)(this.outer)) return this.leave(direction < 0);
    if (last && direction > 0) {
      const added = tableAtPosition(
        this.outer.state,
        this.outer.state.selection.main.head,
      );
      if (added) {
        const line = this.outer.state.doc.line(added.first + added.row);
        this.outer.dispatch({
          selection: { anchor: line.from + added.rows[added.row].starts[0] },
        });
      }
    }
    this.focusSelected();
    return true;
  }
  private nextRow() {
    const table = tableAt(this.outer);
    if (!table) return false;
    const row = table.row === 0 ? 2 : table.row + 1;
    if (row >= table.rows.length) tableCommand("row.add")(this.outer);
    else selectTableCell(this.outer, row, table.column);
    this.focusSelected();
    return true;
  }
  private leave(before = false) {
    const { table } = this.model;
    let pos = before
      ? Math.max(0, this.outer.state.doc.line(table.first).from - 1)
      : table.node.to + 1;
    this.closeCell();
    if (pos > this.outer.state.doc.length) {
      this.outer.dispatch({ changes: { from: table.node.to, insert: "\n" } });
      pos = this.outer.state.doc.length;
    }
    this.outer.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    this.outer.focus();
    return true;
  }
  private closeCell() {
    if (!this.active) return;
    const cell = this.active;
    this.active = null;
    if (activeTableCells.get(this.outer)?.editor === cell.editor)
      activeTableCells.delete(this.outer);
    cell.editor.destroy();
    disposeMarkdownImages(cell.host);
    cell.host.innerHTML =
      safeMarkdownHtml(
        this.model.table.rows[cell.row]?.cells[cell.column] ?? "",
        true,
        this.model.environment,
      ) || "<br>";
    hydrateMarkdownImages(
      cell.host,
      () => this.outer.requestMeasure(),
      this.outer,
    );
    this.html.delete(cell.host);
  }
  destroy() {
    const focused = this.active?.editor.hasFocus;
    this.closeCell();
    for (const host of this.cells.values()) disposeMarkdownImages(host);
    visibleTables.get(this.outer)?.delete(this);
    if (focused)
      queueMicrotask(() => {
        if (
          this.outer.dom.isConnected &&
          !tableAtPosition(
            this.outer.state,
            this.outer.state.selection.main.head,
          )
        )
          this.outer.focus();
      });
  }
}

class TableWidget extends WidgetType {
  constructor(readonly model: TableModel) {
    super();
  }
  eq(other: TableWidget) {
    return (
      this.model.source === other.model.source &&
      this.model.references === other.model.references &&
      this.model.table.node.from === other.model.table.node.from
    );
  }
  toDOM(view: EditorView) {
    return new TableEditor(view, this.model).dom;
  }
  updateDOM(dom: HTMLElement) {
    controllers.get(dom)?.update(this.model);
    return true;
  }
  destroy(dom: HTMLElement) {
    controllers.get(dom)?.destroy();
  }
  ignoreEvent() {
    return true;
  }
}
function tables(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const { signature: references, environment } = getMarkdownContext(state);
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Table")
        return node.name === "Document" || node.node.type.is("BlockContext")
          ? undefined
          : false;
      const table = tableAtPosition(state, node.from + 1);
      if (!table) return false;
      const model = {
        table,
        references,
        environment,
        source: state.doc.sliceString(node.from, node.to),
      };
      decorations.push(
        Decoration.replace({
          block: true,
          widget: new TableWidget(model),
        }).range(state.doc.line(table.first).from, node.to),
      );
      return false;
    },
  });
  return Decoration.set(decorations, true);
}
const tableField = StateField.define<DecorationSet>({
  create: tables,
  update: (value, tr) =>
    tr.docChanged || syntaxTree(tr.startState) !== syntaxTree(tr.state)
      ? tables(tr.state)
      : value,
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});
function enterTable(view: EditorView, forward: boolean) {
  if (tableCellOwners.has(view) || view.state.facet(EditorState.readOnly))
    return false;
  const selection = view.state.selection.main;
  if (!selection.empty) return false;
  const next = view.moveVertically(selection, forward);
  let destination: Table | null = null;
  view.state
    .field(tableField)
    .between(
      Math.min(selection.head, next.head),
      Math.max(selection.head, next.head),
      (from, to, decoration) => {
        if (
          forward
            ? from > selection.head && from <= next.head
            : to < selection.head && to >= next.head
        )
          destination = (decoration.spec.widget as TableWidget).model.table;
      },
    );
  if (!destination) return false;
  const table: Table = destination;
  const controller = [...(visibleTables.get(view) ?? [])].find((candidate) =>
    candidate.contains(table.node.from),
  );
  if (controller)
    return controller.enter(forward, view.coordsAtPos(selection.head)?.left);
  const row = forward || table.rows.length === 2 ? 0 : table.rows.length - 1;
  const line = view.state.doc.line(table.first + row);
  view.dispatch({
    selection: { anchor: line.from + table.rows[row].editStarts[0] },
    scrollIntoView: true,
  });
  return true;
}

export const richTables = [
  tableField,
  Prec.high(
    keymap.of([
      { key: "ArrowDown", run: (view) => enterTable(view, true) },
      { key: "ArrowUp", run: (view) => enterTable(view, false) },
    ]),
  ),
  ViewPlugin.fromClass(
    class {
      update(update: import("@codemirror/view").ViewUpdate) {
        if (update.startState.facet(keymap) !== update.state.facet(keymap)) {
          for (const table of visibleTables.get(update.view) ?? [])
            table.syncKeymap();
        }
        if (
          update.startState.facet(EditorState.readOnly) !==
          update.state.facet(EditorState.readOnly)
        ) {
          for (const table of visibleTables.get(update.view) ?? [])
            table.syncLock();
        }
        if (update.selectionSet || update.docChanged) {
          // Focus cannot be moved from inside CodeMirror's synchronous update.
          const view = update.view;
          queueMicrotask(() => {
            if (view.hasFocus || activeTableCells.get(view)?.editor.hasFocus) {
              for (const table of visibleTables.get(view) ?? [])
                if (table.focusSelected()) break;
            }
          });
        }
      }
    },
  ),
];
