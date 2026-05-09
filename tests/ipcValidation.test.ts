import { strict as assert } from "assert";
import {
  MAX_EXPORT_HTML_BYTES,
  MAX_MARKDOWN_FILE_BYTES,
  normalizeExportFilePayload,
  normalizeSaveFilePayload,
  safeExportBaseName,
  validateExportFilePayload,
  validateSaveFilePayload,
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

runTest("save payload validation reports specific errors", () => {
  assert.deepEqual(validateSaveFilePayload({ content: 12 }), {
    ok: false,
    message: "Save content must be text.",
  });
  assert.deepEqual(validateSaveFilePayload({ content: "ok", filePath: "" }), {
    ok: false,
    message: "Save file path must be a non-empty string.",
  });
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

runTest("export payload validation rejects oversized content", () => {
  const oversized = "x".repeat(MAX_EXPORT_HTML_BYTES + 1);

  assert.equal(
    normalizeExportFilePayload({ content: oversized, format: "html" }),
    null
  );
  assert.deepEqual(
    validateExportFilePayload({ content: oversized, format: "html" }),
    { ok: false, message: "Export content is too large." }
  );
});

runTest("export payload validation rejects non-string default names", () => {
  assert.equal(
    normalizeExportFilePayload({
      content: "<p>ok</p>",
      format: "html",
      defaultFileName: 12,
    }),
    null
  );
});

runTest("export payload validation accepts valid payloads", () => {
  assert.deepEqual(
    normalizeExportFilePayload({
      content: "<p>ok</p>",
      format: "pdf",
      defaultFileName: "Notes",
    }),
    {
      content: "<p>ok</p>",
      format: "pdf",
      defaultFileName: "Notes",
    }
  );
});

runTest("export default names are sanitized to a base filename", () => {
  assert.equal(safeExportBaseName("../notes:bad?.html"), "notes-bad-");
  assert.equal(safeExportBaseName("CON.pdf"), "CON-file");
  assert.equal(safeExportBaseName("notes. "), "notes");
  assert.equal(safeExportBaseName(""), "Exported");
});

if (process.exitCode && process.exitCode !== 0) {
  throw new Error("One or more tests failed.");
}
