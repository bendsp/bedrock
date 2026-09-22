import { EditorState, TransactionSpec } from "@codemirror/state";
import {
  markdown,
  insertNewlineContinueMarkup as continueUnorderedListCommand,
  insertNewlineContinueMarkup as continueOrderedListCommand,
  insertNewlineContinueMarkup as continueBlockquoteCommand,
} from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { strict as assert } from "assert";
import {
  createSnippetCommand,
  toggleBlockquoteCommand,
  toggleFencedCodeBlockCommand,
  toggleOrderedListCommand,
  toggleTaskCheckCommand,
  toggleTaskListCommand,
  toggleUnorderedListCommand,
} from "../src/renderer/editor/codemirror/commands";
import type { EditorView } from "@codemirror/view";

type Selection = { from: number; to: number };
class FakeView {
  state: EditorState;
  constructor(text: string, selection: Selection = { from: 0, to: 0 }) {
    this.state = EditorState.create({
      doc: text,
      selection: { anchor: selection.from, head: selection.to },
      extensions: [markdown({ extensions: [GFM] })],
    });
  }
  get text() {
    return this.state.doc.toString();
  }
  dispatch = (spec: TransactionSpec) => {
    this.state = this.state.update(spec).state;
  };
  select(selection: Selection) {
    this.dispatch({
      selection: { anchor: selection.from, head: selection.to },
    });
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

runTest("bold shortcut inserts paired asterisks and centers cursor", () => {
  const run = createSnippetCommand("****", 2);
  const view = new FakeView("");

  run(view as unknown as EditorView);

  assert.equal(view.text, "****");
  assert.equal(view.state.selection.main.from, 2);
});

runTest("italic shortcut inserts double asterisks and centers cursor", () => {
  const run = createSnippetCommand("**", 1);
  const view = new FakeView("");

  run(view as unknown as EditorView);

  assert.equal(view.text, "**");
  assert.equal(view.state.selection.main.from, 1);
});

runTest(
  "link shortcut inserts skeleton link and positions cursor in brackets",
  () => {
    const run = createSnippetCommand("[](url)", 1);
    const view = new FakeView("");

    run(view as unknown as EditorView);

    assert.equal(view.text, "[](url)");
    assert.equal(view.state.selection.main.from, 1);
  },
);

runTest("unordered list command toggles selected lines", () => {
  const view = new FakeView("one\ntwo", { from: 0, to: 7 });

  toggleUnorderedListCommand(view as unknown as EditorView);
  assert.equal(view.text, "- one\n- two");

  view.select({ from: 0, to: view.text.length });
  toggleUnorderedListCommand(view as unknown as EditorView);
  assert.equal(view.text, "one\ntwo");
});

runTest("enter continues unordered list markers", () => {
  const view = new FakeView("- first", { from: 7, to: 7 });

  const handled = continueUnorderedListCommand(view as unknown as EditorView);

  assert.equal(handled, true);
  assert.equal(view.text, "- first\n- ");
  assert.equal(view.state.selection.main.from, 10);
});

runTest("enter exits an empty unordered list item", () => {
  const view = new FakeView("  -   ", { from: 6, to: 6 });

  const handled = continueUnorderedListCommand(view as unknown as EditorView);

  assert.equal(handled, true);
  assert.equal(view.text, "");
  assert.equal(view.state.selection.main.from, 0);
});

runTest("enter falls through outside unordered lists", () => {
  const view = new FakeView("plain", { from: 5, to: 5 });

  const handled = continueUnorderedListCommand(view as unknown as EditorView);

  assert.equal(handled, false);
  assert.equal(view.text, "plain");
});

runTest("enter falls through for fenced code lines shaped like bullets", () => {
  const view = new FakeView("```\n- flag\n```", { from: 10, to: 10 });

  const handled = continueUnorderedListCommand(view as unknown as EditorView);

  assert.equal(handled, false);
  assert.equal(view.text, "```\n- flag\n```");
});

runTest(
  "enter falls through for indented code lines shaped like bullets",
  () => {
    const view = new FakeView("    - flag", { from: 10, to: 10 });

    const handled = continueUnorderedListCommand(view as unknown as EditorView);

    assert.equal(handled, false);
    assert.equal(view.text, "    - flag");
  },
);

runTest("line prefix commands preserve indentation when toggled off", () => {
  const view = new FakeView("  - nested", { from: 0, to: 10 });

  toggleUnorderedListCommand(view as unknown as EditorView);

  assert.equal(view.text, "  nested");
});

runTest("ordered list command numbers selected lines", () => {
  const view = new FakeView("one\ntwo", { from: 0, to: 7 });

  toggleOrderedListCommand(view as unknown as EditorView);

  assert.equal(view.text, "1. one\n2. two");
});

runTest("enter continues ordered list numbers", () => {
  const view = new FakeView("7. first", { from: 8, to: 8 });

  const handled = continueOrderedListCommand(view as unknown as EditorView);

  assert.equal(handled, true);
  assert.equal(view.text, "7. first\n8. ");
  assert.equal(view.state.selection.main.from, 12);
});

runTest("enter preserves ordered list delimiter style", () => {
  const view = new FakeView("2) first", { from: 8, to: 8 });

  const handled = continueOrderedListCommand(view as unknown as EditorView);

  assert.equal(handled, true);
  assert.equal(view.text, "2) first\n3) ");
});

runTest("enter exits an empty ordered list item", () => {
  const view = new FakeView("  3.   ", { from: 7, to: 7 });

  const handled = continueOrderedListCommand(view as unknown as EditorView);

  assert.equal(handled, true);
  assert.equal(view.text, "");
  assert.equal(view.state.selection.main.from, 0);
});

runTest("task list command toggles checklist markers", () => {
  const view = new FakeView("one\ntwo", { from: 0, to: 7 });

  toggleTaskListCommand(view as unknown as EditorView);
  assert.equal(view.text, "- [ ] one\n- [ ] two");

  view.select({ from: 0, to: view.text.length });
  toggleTaskListCommand(view as unknown as EditorView);
  assert.equal(view.text, "one\ntwo");
});

runTest("task check command toggles unchecked tasks on", () => {
  const view = new FakeView("- [ ] one\n- [x] two", { from: 0, to: 19 });

  const handled = toggleTaskCheckCommand(view as unknown as EditorView);

  assert.equal(handled, true);
  assert.equal(view.text, "- [x] one\n- [x] two");
});

runTest("task check command toggles checked tasks off", () => {
  const view = new FakeView("- [x] one\n- [X] two", { from: 0, to: 19 });

  const handled = toggleTaskCheckCommand(view as unknown as EditorView);

  assert.equal(handled, true);
  assert.equal(view.text, "- [ ] one\n- [ ] two");
});

runTest("task check command falls through outside task lines", () => {
  const view = new FakeView("- one", { from: 0, to: 5 });

  const handled = toggleTaskCheckCommand(view as unknown as EditorView);

  assert.equal(handled, false);
  assert.equal(view.text, "- one");
});

runTest("blockquote command toggles selected lines", () => {
  const view = new FakeView("one\ntwo", { from: 0, to: 7 });

  toggleBlockquoteCommand(view as unknown as EditorView);
  assert.equal(view.text, "> one\n> two");

  view.select({ from: 0, to: view.text.length });
  toggleBlockquoteCommand(view as unknown as EditorView);
  assert.equal(view.text, "one\ntwo");
});

runTest("enter continues blockquotes", () => {
  const view = new FakeView("> quote", { from: 7, to: 7 });

  const handled = continueBlockquoteCommand(view as unknown as EditorView);

  assert.equal(handled, true);
  assert.equal(view.text, "> quote\n> ");
  assert.equal(view.state.selection.main.from, 10);
});

runTest("enter preserves spaced nested blockquote markers", () => {
  const view = new FakeView("> > nested", { from: 10, to: 10 });

  const handled = continueBlockquoteCommand(view as unknown as EditorView);

  assert.equal(handled, true);
  assert.equal(view.text, "> > nested\n> > ");
  assert.equal(view.state.selection.main.from, 15);
});

runTest("two empty quote lines exit the blockquote", () => {
  const view = new FakeView("> first\n> \n> ", { from: 13, to: 13 });
  assert.equal(continueBlockquoteCommand(view as unknown as EditorView), true);
  assert.equal(view.text, "> first\n\n");
});

runTest("enter falls through for fenced code lines shaped like quotes", () => {
  const view = new FakeView("```\n> flag\n```", { from: 10, to: 10 });

  const handled = continueBlockquoteCommand(view as unknown as EditorView);

  assert.equal(handled, false);
  assert.equal(view.text, "```\n> flag\n```");
});

runTest(
  "enter falls through for indented code lines shaped like quotes",
  () => {
    const view = new FakeView("    > flag", { from: 10, to: 10 });

    const handled = continueBlockquoteCommand(view as unknown as EditorView);

    assert.equal(handled, false);
    assert.equal(view.text, "    > flag");
  },
);

runTest("enter falls through outside blockquotes", () => {
  const view = new FakeView("plain", { from: 5, to: 5 });

  const handled = continueBlockquoteCommand(view as unknown as EditorView);

  assert.equal(handled, false);
  assert.equal(view.text, "plain");
});

runTest("code block command wraps and unwraps selected lines", () => {
  const view = new FakeView("const x = 1;", { from: 0, to: 12 });

  toggleFencedCodeBlockCommand(view as unknown as EditorView);
  assert.equal(view.text, "```\nconst x = 1;\n```");

  view.select({ from: 0, to: view.text.length });
  toggleFencedCodeBlockCommand(view as unknown as EditorView);
  assert.equal(view.text, "const x = 1;");
});

runTest("code block command inserts editable empty fenced block", () => {
  const view = new FakeView("", { from: 0, to: 0 });

  toggleFencedCodeBlockCommand(view as unknown as EditorView);

  assert.equal(view.text, "```\n\n```");
  assert.equal(view.state.selection.main.from, 4);
});

runTest(
  "code block command preserves indentation for empty fenced blocks",
  () => {
    const view = new FakeView("  ", { from: 2, to: 2 });

    toggleFencedCodeBlockCommand(view as unknown as EditorView);

    assert.equal(view.text, "  ```\n  \n  ```");
    assert.equal(view.state.selection.main.from, 8);
  },
);

if (process.exitCode && process.exitCode !== 0) {
  throw new Error("One or more tests failed.");
}
