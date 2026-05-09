import assert from "node:assert/strict";
import {
  getDocumentStats,
  getSelectionStats,
} from "../src/renderer/lib/documentStats";

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

runTest("document stats count lines words chars and reading time", () => {
  const stats = getDocumentStats("One two\nthree");
  assert.deepEqual(stats, {
    words: 3,
    chars: 13,
    lines: 2,
    readingMinutes: 1,
  });
});

runTest("empty document stats still report one editable line", () => {
  const stats = getDocumentStats("");
  assert.deepEqual(stats, {
    words: 0,
    chars: 0,
    lines: 1,
    readingMinutes: 0,
  });
});

runTest("selection stats count selected words and characters", () => {
  const stats = getSelectionStats(" selected text ");
  assert.deepEqual(stats, {
    hasSelection: true,
    words: 2,
    chars: 15,
  });
});

runTest("empty selection stats report no selection", () => {
  const stats = getSelectionStats("");
  assert.deepEqual(stats, {
    hasSelection: false,
    words: 0,
    chars: 0,
  });
});

if (process.exitCode && process.exitCode !== 0) {
  throw new Error("One or more tests failed.");
}
