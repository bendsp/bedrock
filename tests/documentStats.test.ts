import assert from "node:assert/strict";
import {
  getDocumentStats,
  getSelectionStats,
} from "../src/renderer/lib/documentStats";

{
  const stats = getDocumentStats("One two\nthree");
  assert.deepEqual(stats, {
    words: 3,
    chars: 13,
    lines: 2,
    readingMinutes: 1,
  });
}

{
  const stats = getDocumentStats("");
  assert.deepEqual(stats, {
    words: 0,
    chars: 0,
    lines: 1,
    readingMinutes: 0,
  });
}

{
  const stats = getSelectionStats(" selected text ");
  assert.deepEqual(stats, {
    hasSelection: true,
    words: 2,
    chars: 15,
  });
}

{
  const stats = getSelectionStats("");
  assert.deepEqual(stats, {
    hasSelection: false,
    words: 0,
    chars: 0,
  });
}
