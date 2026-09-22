import { syntaxTree } from "@codemirror/language";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  markdown,
  insertNewlineContinueMarkup,
} from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { history, undo } from "@codemirror/commands";
import { noteMarkdown } from "../src/renderer/editor/codemirror/markdownLanguage";
import {
  createWrapSelectionOrWordCommand,
  headingCommand,
  toggleOrderedListCommand,
  toggleTaskListCommand,
  insertFootnoteCommand,
  toggleFencedCodeBlockCommand,
  toggleTaskCheckCommand,
} from "../src/renderer/editor/codemirror/commands";
import {
  insertTable,
  tableCommand,
  navigateTable,
  splitTableRow,
  pasteTableCells,
  parseClipboardTable,
  encodeTableCell,
  tableCellChange,
  tableAtPosition,
} from "../src/renderer/editor/codemirror/tables";

function editor(doc: string, anchor = doc.length, head = anchor) {
  let state = EditorState.create({
    doc,
    selection: { anchor, head },
    extensions: [markdown({ extensions: [GFM, noteMarkdown] }), history()],
  });
  // Commands consume a real EditorState and dispatch real transactions; no DOM is needed.
  const target = {
    get state() {
      return state;
    },
    dispatch(spec: Parameters<EditorState["update"]>[0]) {
      state = state.update(spec).state;
    },
  };
  return target as EditorView;
}
const run = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`, error);
    process.exitCode = 1;
  }
};
const bold = createWrapSelectionOrWordCommand({
  before: "**",
  after: "**",
  nodeName: "StrongEmphasis",
});
const code = createWrapSelectionOrWordCommand({
  before: "`",
  after: "`",
  nodeName: "InlineCode",
});
run("formatting wraps Unicode words and undo restores the exact source", () => {
  const view = editor("café", 2);
  bold(view);
  assert.equal(view.state.doc.toString(), "**café**");
  undo(view);
  assert.equal(view.state.doc.toString(), "café");
});
run(
  "inline code uses a longer delimiter when the selection contains backticks",
  () => {
    const view = editor("use `x`", 0, 7);
    code(view);
    assert.equal(view.state.doc.toString(), "`` use `x` ``");
    code(view);
    assert.equal(view.state.doc.toString(), "use `x`");
  },
);
run("list transformations replace the previous list marker", () => {
  const view = editor("- alpha\n- beta", 0, 14);
  toggleOrderedListCommand(view);
  assert.equal(view.state.doc.toString(), "1. alpha\n2. beta");
  toggleTaskListCommand(view);
  assert.equal(view.state.doc.toString(), "- [ ] alpha\n- [ ] beta");
});
run(
  "Markdown Enter continues tasks and numbered lists but leaves fenced text alone",
  () => {
    const task = editor("- [x] finished");
    assert.equal(insertNewlineContinueMarkup(task), true);
    assert.equal(task.state.doc.toString(), "- [x] finished\n- [ ] ");
    const list = editor("3. third");
    insertNewlineContinueMarkup(list);
    assert.equal(list.state.doc.toString(), "3. third\n4. ");
    const fenced = editor("~~~\n1. literal");
    assert.equal(insertNewlineContinueMarkup(fenced), false);
  },
);
run(
  "headings change levels without stacking markers and toggle back to a paragraph",
  () => {
    const view = editor("# Title");
    headingCommand(2)(view);
    assert.equal(view.state.doc.toString(), "## Title");
    headingCommand(2)(view);
    assert.equal(view.state.doc.toString(), "Title");
  },
);
run("table parsing preserves escaped pipes and empty cells", () => {
  assert.deepEqual(splitTableRow("| a \\| b |  |").cells, ["a \\| b", ""]);
  assert.deepEqual(splitTableRow("a | b").cells, ["a", "b"]);
});
run(
  "table commands preserve content while adding columns, aligning and navigating",
  () => {
    const view = editor("");
    insertTable(view);
    tableCommand("column.add")(view);
    assert.equal(
      view.state.doc.toString().split("\n")[0],
      "| Column 1 |  | Column 2 |",
    );
    tableCommand("align.right")(view);
    assert.ok(view.state.doc.toString().includes("---:"));
    navigateTable(1)(view);
    assert.ok(view.state.selection.main.from > 0);
    tableCommand("column.delete")(view);
    assert.equal(splitTableRow(view.state.doc.line(1).text).cells.length, 2);
  },
);
run("footnote insertion avoids existing identifiers", () => {
  const view = editor("first[^1]\n\n[^1]: existing\n\nsecond");
  insertFootnoteCommand(view);
  assert.ok(view.state.doc.toString().includes("second[^2]"));
  assert.ok(view.state.doc.toString().includes("[^2]: Footnote text"));
});

run("empty-line formatting places typing after the inserted marker", () => {
  for (const [command, prefix] of [
    [headingCommand(2), "## "],
    [toggleOrderedListCommand, "1. "],
    [toggleTaskListCommand, "- [ ] "],
  ] as const) {
    const view = editor("");
    command(view);
    view.dispatch(view.state.replaceSelection("Typed"));
    assert.equal(view.state.doc.toString(), prefix + "Typed");
  }
});
run(
  "headings preserve multiline quote containers and remove setext underlines",
  () => {
    const view = editor("> first\n> second");
    headingCommand(2)(view);
    assert.equal(view.state.doc.toString(), "> first\n> ## second");
    const setext = editor("> Hello\n> World\n> =====");
    headingCommand(2)(setext);
    assert.equal(setext.state.doc.toString(), "> ## Hello World");
    headingCommand(0)(setext);
    assert.equal(setext.state.doc.toString(), "> Hello World");
  },
);
run(
  "quoted tables keep their container and escaped terminal pipes remain cells",
  () => {
    assert.deepEqual(splitTableRow("a | b \\|").cells, ["a", "b \\|"]);
    const source = "> | A | B |\n> | --- | --- |\n> | a | b |";
    const view = editor(source);
    tableCommand("format")(view);
    assert.equal(view.state.doc.toString(), source);
  },
);

run("nested code blocks unwrap without removing their list item", () => {
  const view = editor("- ```\n  x\n  ```\n- y", 9);
  toggleFencedCodeBlockCommand(view);
  assert.equal(view.state.doc.toString(), "- x\n- y");
});
run(
  "task checking supports ordered and quoted tasks and leaves code literal",
  () => {
    const view = editor("> 1. [ ] one\n> 2. [x] two", 0, 25);
    toggleTaskCheckCommand(view);
    assert.equal(view.state.doc.toString(), "> 1. [x] one\n> 2. [x] two");
    const code = editor("```\n- [ ] literal\n```");
    assert.equal(toggleTaskCheckCommand(code), false);
  },
);
run(
  "aligning an overflow table cell cannot corrupt the header delimiter",
  () => {
    const view = editor("a | b\n--- | ---\none | two | three");
    tableCommand("align.right")(view);
    assert.ok(syntaxTree(view.state).toString().includes("Table("));
    assert.equal(splitTableRow(view.state.doc.line(2).text).cells.length, 2);
    assert.ok(view.state.doc.toString().includes("three"));
  },
);
run(
  "TSV paste expands a table and safely encodes pipes and cell line breaks",
  () => {
    assert.deepEqual(
      parseClipboardTable('"A\tB"\t"line 1\nline 2"\r\nC\tD\r\n'),
      [
        ["A\tB", "line 1\nline 2"],
        ["C", "D"],
      ],
    );
    const view = editor("");
    insertTable(view);
    pasteTableCells(view, "Name\tValue\tExtra\nA | B\t42\tx");
    assert.equal(view.state.doc.line(1).text, "| Name | Value | Extra |");
    assert.equal(view.state.doc.line(3).text, "| A \\| B | 42 | x |");
    assert.ok(syntaxTree(view.state).toString().includes("Table("));
  },
);
run(
  "display math owns its block even when its content resembles Markdown",
  () => {
    const view = editor("$$\n- x\n\n# y\n$$");
    const tree = syntaxTree(view.state);
    assert.ok(tree.toString().includes("DisplayMath("));
    assert.ok(!tree.toString().includes("BulletList"));
    const quote = editor("> $$\n> x^2\n> $$");
    const math = syntaxTree(quote.state).topNode.firstChild?.getChild(
      "DisplayMath",
    );
    assert.ok(math);
    assert.deepEqual(
      math
        .getChildren("MathText")
        .map((node) => quote.state.doc.sliceString(node.from, node.to)),
      ["x^2"],
    );
  },
);
run("footnote definitions parse their inline formatting", () => {
  const view = editor("Text[^note]\n\n[^note]: **Bold** definition.");
  const tree = syntaxTree(view.state).toString();
  assert.ok(tree.includes("FootnoteDefinition(FootnoteMark,StrongEmphasis"));
});

run("terminal backslashes cannot escape structural table pipes", () => {
  for (let count = 1; count <= 5; count++) {
    const encoded = encodeTableCell("a" + "\\".repeat(count));
    assert.equal(encodeTableCell(encoded), encoded);
    const view = editor(`|${encoded}|b|\n|-|-|\n|x|y|`);
    assert.equal(syntaxTree(view.state).topNode.firstChild?.name, "Table");
  }
});
run(
  "table row and column moves preserve headers, alignment, containers and undo",
  () => {
    const source =
      "> | A | B |\n> | :--- | ---: |\n> | one | two |\n> | three | four |";
    const view = editor(source, source.indexOf("one"));
    tableCommand("row.moveDown")(view);
    assert.equal(view.state.doc.line(3).text, "> | three | four |");
    tableCommand("column.moveRight")(view);
    assert.equal(view.state.doc.line(1).text, "> | B | A |");
    assert.equal(view.state.doc.line(2).text, "> | ---: | :--- |");
    assert.equal(view.state.doc.line(4).text, "> | two | one |");
    tableCommand("delete")(view);
    assert.equal(view.state.doc.toString(), "");
    undo(view);
    assert.equal(syntaxTree(view.state).topNode.firstChild?.name, "Blockquote");
  },
);

run(
  "clearing borderless table cells preserves columns, source spacing and undo",
  () => {
    for (const source of [
      "A | B\n--- | ---\nx | y",
      "A|B\n-|-\nx|y",
      "> A | B\n> --- | ---\n> x | y",
      "| A | B\n| --- | ---\n| x | y",
      "A | B |\n--- | --- |\nx | y |",
    ])
      for (const row of [0, 2])
        for (const column of [0, 1]) {
          const view = editor(source, source.indexOf("A"));
          const table = tableAtPosition(view.state, source.indexOf("A"));
          assert.ok(table);
          const edit = tableCellChange(view.state, table, row, column, "");
          view.dispatch({
            changes: edit.changes,
            selection: { anchor: edit.contentFrom },
          });
          const updated = tableAtPosition(view.state, edit.contentFrom);
          assert.ok(updated, view.state.doc.toString());
          assert.equal(updated.rows[row].cells.length, 2);
          assert.equal(updated.rows[row].cells[column], "");
          assert.equal(
            updated.rows[row].cells[1 - column],
            row === 0 ? (column === 0 ? "B" : "A") : column === 0 ? "y" : "x",
          );
          undo(view);
          assert.equal(view.state.doc.toString(), source);
        }
  },
);

run(
  "YAML frontmatter owns its metadata without changing ordinary opening rules",
  () => {
    for (const source of [
      "---\ntitle: **Plain text**\ntags: [note]\n---\n\n# Heading",
      "---\n---\n\nBody",
    ]) {
      const view = editor(source);
      assert.equal(
        syntaxTree(view.state).topNode.firstChild?.name,
        "Frontmatter",
      );
    }
    assert.equal(
      syntaxTree(editor("---\n\nBody").state).topNode.firstChild?.name,
      "HorizontalRule",
    );
  },
);

run(
  "footnotes keep indented paragraphs after blank separators inside the definition",
  () => {
    const source =
      "Text[^n].\n\n[^n]: First paragraph.\n\n    Second **bold** paragraph.\n\n# Following heading";
    const view = editor(source);
    const tree = syntaxTree(view.state);
    const definition = tree.topNode.getChild("FootnoteDefinition");
    assert.ok(definition?.getChild("StrongEmphasis"));
    assert.equal(
      view.state.doc.sliceString(definition.from, definition.to),
      "[^n]: First paragraph.\n\n    Second **bold** paragraph.",
    );
    assert.equal(tree.topNode.lastChild?.name, "ATXHeading1");
  },
);
