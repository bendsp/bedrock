import { strict as assert } from "assert";
import {
  continueOrderedListCommand,
  continueUnorderedListCommand,
  createSnippetCommand,
  toggleBlockquoteCommand,
  toggleFencedCodeBlockCommand,
  toggleOrderedListCommand,
  toggleTaskListCommand,
  toggleUnorderedListCommand,
} from "../src/renderer/editor/codemirror/commands";
import type { EditorView } from "@codemirror/view";

type Selection = { from: number; to: number };
type FakeLine = { number: number; from: number; to: number; text: string };

class FakeDoc {
  constructor(private readonly getText: () => string) {}

  get length(): number {
    return this.getText().length;
  }

  get lines(): number {
    return this.buildLines().length;
  }

  line(lineNumber: number): FakeLine {
    return this.buildLines()[lineNumber - 1];
  }

  lineAt(pos: number): FakeLine {
    const safePos = Math.max(0, Math.min(pos, this.length));
    return (
      this.buildLines().find(
        (line) => safePos >= line.from && safePos <= line.to
      ) ?? this.line(this.lines)
    );
  }

  sliceString(from: number, to: number): string {
    return this.getText().slice(from, to);
  }

  private buildLines(): FakeLine[] {
    const text = this.getText();
    const parts = text.split("\n");
    let offset = 0;
    return parts.map((part, index) => {
      const line = {
        number: index + 1,
        from: offset,
        to: offset + part.length,
        text: part,
      };
      offset = line.to + 1;
      return line;
    });
  }
}

class FakeView {
  public text: string;
  public state: { selection: { main: Selection }; doc: FakeDoc };

  constructor(text: string, selection: Selection = { from: 0, to: 0 }) {
    this.text = text;
    this.state = {
      selection: { main: selection },
      doc: new FakeDoc(() => this.text),
    };
  }

  dispatch(spec: {
    changes:
      | { from: number; to?: number; insert: string }
      | Array<{ from: number; to?: number; insert: string }>;
    selection?: { anchor: number; head?: number };
    scrollIntoView?: boolean;
  }): void {
    const changes = Array.isArray(spec.changes)
      ? spec.changes
      : [spec.changes];
    [...changes]
      .sort((left, right) => right.from - left.from)
      .forEach(({ from, to = from, insert }) => {
        this.text = `${this.text.slice(0, from)}${insert}${this.text.slice(to)}`;
      });
    if (spec.selection) {
      this.state.selection.main = {
        from: spec.selection.anchor,
        to: spec.selection.head ?? spec.selection.anchor,
      };
    }
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
  assert.deepEqual(view.state.selection.main, { from: 2, to: 2 });
});

runTest("italic shortcut inserts double asterisks and centers cursor", () => {
  const run = createSnippetCommand("**", 1);
  const view = new FakeView("");

  run(view as unknown as EditorView);

  assert.equal(view.text, "**");
  assert.deepEqual(view.state.selection.main, { from: 1, to: 1 });
});

runTest(
  "link shortcut inserts skeleton link and positions cursor in brackets",
  () => {
    const run = createSnippetCommand("[](url)", 1);
    const view = new FakeView("");

    run(view as unknown as EditorView);

    assert.equal(view.text, "[](url)");
    assert.deepEqual(view.state.selection.main, { from: 1, to: 1 });
  }
);

runTest("unordered list command toggles selected lines", () => {
  const view = new FakeView("one\ntwo", { from: 0, to: 7 });

  toggleUnorderedListCommand(view as unknown as EditorView);
  assert.equal(view.text, "- one\n- two");

  view.state.selection.main = { from: 0, to: view.text.length };
  toggleUnorderedListCommand(view as unknown as EditorView);
  assert.equal(view.text, "one\ntwo");
});

runTest("enter continues unordered list markers", () => {
  const view = new FakeView("- first", { from: 7, to: 7 });

  const handled = continueUnorderedListCommand(view as unknown as EditorView);

  assert.equal(handled, true);
  assert.equal(view.text, "- first\n- ");
  assert.deepEqual(view.state.selection.main, { from: 10, to: 10 });
});

runTest("enter exits an empty unordered list item", () => {
  const view = new FakeView("  -   ", { from: 6, to: 6 });

  const handled = continueUnorderedListCommand(view as unknown as EditorView);

  assert.equal(handled, true);
  assert.equal(view.text, "  ");
  assert.deepEqual(view.state.selection.main, { from: 2, to: 2 });
});

runTest("enter falls through outside unordered lists", () => {
  const view = new FakeView("plain", { from: 5, to: 5 });

  const handled = continueUnorderedListCommand(view as unknown as EditorView);

  assert.equal(handled, false);
  assert.equal(view.text, "plain");
});

runTest("enter falls through for task list items", () => {
  const view = new FakeView("- [ ] task", { from: 10, to: 10 });

  const handled = continueUnorderedListCommand(view as unknown as EditorView);

  assert.equal(handled, false);
  assert.equal(view.text, "- [ ] task");
});

runTest("enter falls through for fenced code lines shaped like bullets", () => {
  const view = new FakeView("```\n- flag\n```", { from: 10, to: 10 });

  const handled = continueUnorderedListCommand(view as unknown as EditorView);

  assert.equal(handled, false);
  assert.equal(view.text, "```\n- flag\n```");
});

runTest("enter falls through for indented code lines shaped like bullets", () => {
  const view = new FakeView("    - flag", { from: 10, to: 10 });

  const handled = continueUnorderedListCommand(view as unknown as EditorView);

  assert.equal(handled, false);
  assert.equal(view.text, "    - flag");
});

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
  assert.deepEqual(view.state.selection.main, { from: 12, to: 12 });
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
  assert.equal(view.text, "  ");
  assert.deepEqual(view.state.selection.main, { from: 2, to: 2 });
});

runTest("task list command toggles checklist markers", () => {
  const view = new FakeView("one\ntwo", { from: 0, to: 7 });

  toggleTaskListCommand(view as unknown as EditorView);
  assert.equal(view.text, "- [ ] one\n- [ ] two");

  view.state.selection.main = { from: 0, to: view.text.length };
  toggleTaskListCommand(view as unknown as EditorView);
  assert.equal(view.text, "one\ntwo");
});

runTest("blockquote command toggles selected lines", () => {
  const view = new FakeView("one\ntwo", { from: 0, to: 7 });

  toggleBlockquoteCommand(view as unknown as EditorView);
  assert.equal(view.text, "> one\n> two");

  view.state.selection.main = { from: 0, to: view.text.length };
  toggleBlockquoteCommand(view as unknown as EditorView);
  assert.equal(view.text, "one\ntwo");
});

runTest("code block command wraps and unwraps selected lines", () => {
  const view = new FakeView("const x = 1;", { from: 0, to: 12 });

  toggleFencedCodeBlockCommand(view as unknown as EditorView);
  assert.equal(view.text, "```\nconst x = 1;\n```");

  view.state.selection.main = { from: 0, to: view.text.length };
  toggleFencedCodeBlockCommand(view as unknown as EditorView);
  assert.equal(view.text, "const x = 1;");
});

if (process.exitCode && process.exitCode !== 0) {
  throw new Error("One or more tests failed.");
}
