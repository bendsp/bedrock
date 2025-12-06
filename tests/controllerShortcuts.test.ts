import { strict as assert } from "assert";
import type React from "react";
import { EditorController } from "../src/renderer/controllers/EditorController";
import { DocumentModel } from "../src/renderer/models/DocumentModel";
import { RopeModel } from "../src/renderer/models/RopeModel";
import { CursorPosition, EditorView, RenderMode } from "../src/shared/types";

interface KeyboardEventInit {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

const createKeyboardEvent = ({
  key,
  ctrlKey = false,
  metaKey = false,
  shiftKey = false,
}: KeyboardEventInit) =>
  ({
    key,
    ctrlKey,
    metaKey,
    shiftKey,
    altKey: false,
    preventDefault: (): void => {
      /* noop */
    },
  } as unknown as React.KeyboardEvent<HTMLTextAreaElement>);

class TestView implements EditorView {
  public lastRender = "";
  public lastCursor: CursorPosition = { line: 0, char: 0 };
  public renderMode: RenderMode = "hybrid";

  render(text: string): void {
    this.lastRender = text;
  }

  setCursorPosition(position: CursorPosition): void {
    this.lastCursor = position;
  }

  setRenderMode(mode: RenderMode): void {
    this.renderMode = mode;
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
  const model = new DocumentModel("");
  const view = new TestView();
  const controller = new EditorController(model, view);

  controller.handleKeyDown(
    createKeyboardEvent({ key: "b", ctrlKey: true, metaKey: false })
  );

  assert.equal(model.getAll(), "****");
  assert.deepEqual(model.getCursor(), { line: 0, char: 2 });
});

runTest("italic shortcut inserts double asterisks and centers cursor", () => {
  const model = new DocumentModel("");
  const view = new TestView();
  const controller = new EditorController(model, view);

  controller.handleKeyDown(
    createKeyboardEvent({ key: "i", ctrlKey: true, metaKey: false })
  );

  assert.equal(model.getAll(), "**");
  assert.deepEqual(model.getCursor(), { line: 0, char: 1 });
});

runTest(
  "link shortcut inserts skeleton link and positions cursor in brackets",
  () => {
    const model = new DocumentModel("");
    const view = new TestView();
    const controller = new EditorController(model, view);

    controller.handleKeyDown(
      createKeyboardEvent({ key: "k", ctrlKey: true, metaKey: false })
    );

    assert.equal(model.getAll(), "[](url)");
    assert.deepEqual(model.getCursor(), { line: 0, char: 1 });
  }
);

runTest("toggle render mode cycles between hybrid and raw", () => {
  const model = new DocumentModel("");
  const view = new TestView();
  const controller = new EditorController(model, view);

  assert.equal(view.renderMode, "hybrid");

  controller.handleKeyDown(
    createKeyboardEvent({ key: "m", ctrlKey: true, shiftKey: true })
  );
  assert.equal(view.renderMode, "raw");

  controller.handleKeyDown(
    createKeyboardEvent({ key: "m", ctrlKey: true, shiftKey: true })
  );
  assert.equal(view.renderMode, "hybrid");
});

runTest("arrow keys preserve cursor memory with RopeModel", () => {
  const model = new RopeModel("abcdefghijk\nx\nmnopqrstuvwx");
  const view = new TestView();
  const controller = new EditorController(model, view);

  model.setCursor({ line: 0, char: 10 });

  controller.handleKeyDown(createKeyboardEvent({ key: "ArrowDown" }));
  assert.deepEqual(model.getCursor(), { line: 1, char: 1 });

  controller.handleKeyDown(createKeyboardEvent({ key: "ArrowDown" }));
  assert.deepEqual(model.getCursor(), { line: 2, char: 10 });

  controller.handleKeyDown(createKeyboardEvent({ key: "ArrowUp" }));
  assert.deepEqual(model.getCursor(), { line: 1, char: 1 });

  controller.handleKeyDown(createKeyboardEvent({ key: "ArrowUp" }));
  assert.deepEqual(model.getCursor(), { line: 0, char: 10 });
});

if (process.exitCode && process.exitCode !== 0) {
  throw new Error("One or more tests failed.");
}
