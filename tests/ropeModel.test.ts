import { strict as assert } from "assert";
import { RopeModel } from "../src/renderer/models/RopeModel";
import { CursorPosition } from "../src/shared/types";

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

runTest("basic insert/delete across lines", () => {
  const model = new RopeModel("hello\nworld");
  model.insert(0, 5, "\nrope");
  assert.equal(model.getAll(), "hello\nrope\nworld");

  model.delete(1, 4, 2); // delete "pe"
  assert.equal(model.getAll(), "hello\nro\nworld");
});

runTest("cursor conversions remain stable", () => {
  const text = "a\nbcd\nefgh\n";
  const model = new RopeModel(text);

  model.setCursor({ line: 2, char: 2 });
  const cursor = model.getCursor();
  assert.deepEqual(cursor, { line: 2, char: 2 });

  model.moveCursorUp();
  assert.deepEqual(model.getCursor(), { line: 1, char: 2 });

  model.moveCursorDown();
  assert.deepEqual(model.getCursor(), { line: 2, char: 2 });
});

runTest("getLine and getChar work across rope splits", () => {
  const longLine = "x".repeat(5000);
  const model = new RopeModel(`${longLine}\nyy\nz`);

  assert.equal(model.getLine(0)?.length, 5000);
  assert.equal(model.getLine(1), "yy");
  assert.equal(model.getChar(1, 1), "y");
});

runTest("undo/redo restores content and cursor", () => {
  const model = new RopeModel("abc");
  model.setCursor({ line: 0, char: 3 });
  model.insertChar("d");
  assert.equal(model.getAll(), "abcd");
  const afterInsert = model.getCursor();
  assert.deepEqual(afterInsert, { line: 0, char: 4 });

  model.undo();
  assert.equal(model.getAll(), "abc");
  assert.deepEqual(model.getCursor(), { line: 0, char: 4 - 1 });

  model.redo();
  assert.equal(model.getAll(), "abcd");
  assert.deepEqual(model.getCursor(), afterInsert);
});

runTest("getTextInRange returns expected slices", () => {
  const model = new RopeModel("foo\nbar\nbaz");
  const start: CursorPosition = { line: 0, char: 1 };
  const end: CursorPosition = { line: 2, char: 2 };
  assert.equal(model.getTextInRange(start, end), "oo\nbar\nba");
});

runTest("forEachChunk visits chunks in order", () => {
  const model = new RopeModel("chunk-one\nchunk-two");
  const visited: string[] = [];
  model.forEachChunk((text) => visited.push(text));
  assert.equal(visited.join(""), "chunk-one\nchunk-two");
});

if (process.exitCode && process.exitCode !== 0) {
  throw new Error("One or more rope tests failed.");
}
