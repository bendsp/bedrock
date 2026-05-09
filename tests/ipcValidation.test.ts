import { strict as assert } from "assert";
import {
  MAX_MARKDOWN_FILE_BYTES,
  normalizeExportFilePayload,
  normalizeSaveFilePayload,
  safeExportBaseName,
} from "../src/main/ipcValidation";

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

runTest("save payload validation rejects malformed file paths", () => {
  assert.equal(normalizeSaveFilePayload({ content: "ok", filePath: "" }), null);
  assert.equal(
    normalizeSaveFilePayload({ content: "ok", filePath: 123 }),
    null
  );
});

runTest("save payload validation rejects oversized content", () => {
  const oversized = "x".repeat(MAX_MARKDOWN_FILE_BYTES + 1);

  assert.equal(normalizeSaveFilePayload({ content: oversized }), null);
});

runTest("save payload validation accepts valid content", () => {
  assert.deepEqual(normalizeSaveFilePayload({ content: "ok" }), {
    content: "ok",
    filePath: undefined,
  });
});

runTest("export payload validation rejects unsupported formats", () => {
  assert.equal(
    normalizeExportFilePayload({ content: "<p>ok</p>", format: "docx" }),
    null
  );
});

runTest("export default names are sanitized to a base filename", () => {
  assert.equal(safeExportBaseName("../notes:bad?.html"), "notes-bad-");
  assert.equal(safeExportBaseName(""), "Exported");
});

if (process.exitCode && process.exitCode !== 0) {
  throw new Error("One or more tests failed.");
}
