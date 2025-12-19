import { strict as assert } from "assert";
import { createSnippetCommand } from "../src/renderer/editor/codemirror/commands";
import type { EditorView } from "@codemirror/view";

type Selection = { from: number; to: number };

class FakeView {
  public text: string;
  public state: { selection: { main: Selection } };

  constructor(text: string, selection: Selection = { from: 0, to: 0 }) {
    this.text = text;
    this.state = { selection: { main: selection } };
  }

  dispatch(spec: {
    changes: { from: number; to?: number; insert: string };
    selection: { anchor: number };
  }): void {
    const { from, to = from, insert } = spec.changes;
    this.text = `${this.text.slice(0, from)}${insert}${this.text.slice(to)}`;
    this.state.selection.main = {
      from: spec.selection.anchor,
      to: spec.selection.anchor,
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

if (process.exitCode && process.exitCode !== 0) {
  throw new Error("One or more tests failed.");
}
