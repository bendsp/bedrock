import { strict as assert } from "assert";
import { cursorFromAbsoluteOffset } from "../src/renderer/utils/cursor";

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

runTest("maps absolute offsets to line/char positions", () => {
  const content = "hello\nworld\n";

  assert.deepEqual(cursorFromAbsoluteOffset(content, 0), { line: 0, char: 0 });
  assert.deepEqual(cursorFromAbsoluteOffset(content, 4), { line: 0, char: 4 });
  assert.deepEqual(cursorFromAbsoluteOffset(content, 5), { line: 0, char: 5 });
  assert.deepEqual(cursorFromAbsoluteOffset(content, 6), { line: 1, char: 0 });
  assert.deepEqual(cursorFromAbsoluteOffset(content, 10), {
    line: 1,
    char: 4,
  });
});

runTest("clamps offsets before start and after end", () => {
  const content = "short";

  assert.deepEqual(cursorFromAbsoluteOffset(content, -5), { line: 0, char: 0 });
  assert.deepEqual(cursorFromAbsoluteOffset(content, 999), {
    line: 0,
    char: 5,
  });
});
