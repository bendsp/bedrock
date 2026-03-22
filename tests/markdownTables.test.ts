import { strict as assert } from "assert";
import { Text } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  addTableColumnRightCommand,
  insertTableCommand,
  removeTableColumnCommand,
  removeTableRowCommand,
  setTableCellValueCommand,
} from "../src/renderer/editor/codemirror/commands";
import {
  createDefaultMarkdownTable,
  findTableBlocks,
  parseMarkdownTable,
  serializeMarkdownTable,
  type TableCommandContext,
} from "../src/renderer/editor/codemirror/tables";

type Selection = { from: number; to: number };

class FakeView {
  public text: string;
  public state: {
    selection: { main: Selection };
    doc: Text;
  };

  constructor(text: string, selection: Selection = { from: 0, to: 0 }) {
    this.text = text;
    this.state = {
      selection: { main: selection },
      doc: Text.of(text.split("\n")),
    };
  }

  dispatch(spec: {
    changes: { from: number; to?: number; insert: string };
    selection?: { anchor: number; head?: number };
  }): void {
    const { from, to = from, insert } = spec.changes;
    this.text = `${this.text.slice(0, from)}${insert}${this.text.slice(to)}`;
    this.state.doc = Text.of(this.text.split("\n"));

    const anchor = spec.selection?.anchor ?? from + insert.length;
    const head = spec.selection?.head ?? anchor;
    this.state.selection.main = {
      from: anchor,
      to: head,
    };
  }
}

const runTest = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
};

const getFirstTableContext = (text: string): TableCommandContext => {
  const block = findTableBlocks(Text.of(text.split("\n")))[0];
  if (!block) {
    throw new Error("Expected a table block");
  }

  return {
    tableFrom: block.from,
    tableTo: block.to,
    section: "body",
    row: 0,
    column: 0,
  };
};

runTest("default table round-trips through Markdown serialization", () => {
  const markdown = serializeMarkdownTable(createDefaultMarkdownTable());
  const parsed = parseMarkdownTable(markdown);

  assert.deepEqual(parsed, createDefaultMarkdownTable());
});

runTest("table parsing unescapes literal pipes in cells", () => {
  const parsed = parseMarkdownTable(
    "| Column 1 |\n| -------- |\n| left \\| right |"
  );

  assert.deepEqual(parsed?.rows[0], ["left | right"]);
});

runTest("insert table command inserts the default 3-column table", () => {
  const view = new FakeView("");

  insertTableCommand(view as unknown as EditorView);

  assert.match(view.text, /^\| Column 1/);
  assert.match(view.text, /\| {0,}\| {0,}\| {0,}\|/);
});

runTest("cell edits rewrite only the targeted table block", () => {
  const initial = [
    "Before",
    serializeMarkdownTable(createDefaultMarkdownTable()),
    "After",
  ].join("\n\n");
  const view = new FakeView(initial);
  const context = getFirstTableContext(view.text);

  setTableCellValueCommand(view as unknown as EditorView, context, "Edited", 6);

  assert.match(view.text, /^Before/);
  assert.match(view.text, /After$/);
  assert.match(view.text, /\| Edited/);
});

runTest("table column commands preserve surrounding document content", () => {
  const initial = [
    "Alpha",
    serializeMarkdownTable(createDefaultMarkdownTable()),
    "Omega",
  ].join("\n\n");
  const view = new FakeView(initial);
  const context = getFirstTableContext(view.text);

  addTableColumnRightCommand(view as unknown as EditorView, context);

  assert.match(view.text, /^Alpha/);
  assert.match(view.text, /Omega$/);
  const table = parseMarkdownTable(view.text.split("\n\n")[1] ?? "");
  assert.equal(table?.header.length, 4);
});

runTest("remove row command rejects header-row contexts", () => {
  const view = new FakeView(serializeMarkdownTable(createDefaultMarkdownTable()));
  const bodyContext = getFirstTableContext(view.text);
  const headerContext: TableCommandContext = {
    ...bodyContext,
    section: "header",
    row: 0,
  };

  const handled = removeTableRowCommand(
    view as unknown as EditorView,
    headerContext
  );

  assert.equal(handled, false);
});

runTest("remove column command rejects single-column tables", () => {
  const singleColumn = serializeMarkdownTable({
    header: ["Only"],
    rows: [["Value"]],
  });
  const view = new FakeView(singleColumn);
  const context = getFirstTableContext(view.text);

  const handled = removeTableColumnCommand(
    view as unknown as EditorView,
    context
  );

  assert.equal(handled, false);
});

if (process.exitCode && process.exitCode !== 0) {
  throw new Error("One or more tests failed.");
}
