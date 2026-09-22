import assert from "node:assert/strict";
import { redactTelemetry } from "../src/shared/telemetryPrivacy";

const event = {
  message: "private note",
  user: { username: "private user" },
  request: { url: "file:///private/note.md" },
  contexts: { device: { name: "private machine" } },
  server_name: "private host",
  breadcrumbs: [{ message: "private note" }],
  extra: {
    filePath: "/private/note.md",
    content: "private note",
    operation: "file:save",
  },
  tags: { process: "main", filePath: "/private/note.md" },
  exception: {
    values: [
      {
        value: "private note",
        stacktrace: {
          frames: [
            {
              filename: "/private/folder/index.js",
              abs_path: "/private/folder/index.js",
              vars: { content: "private note" },
              context_line: "private note",
            },
          ],
        },
      },
    ],
  },
};
const result = redactTelemetry(event);
assert.equal(JSON.stringify(result).includes("private"), false);
assert.equal(result.extra.operation, "file:save");
assert.equal(
  result.exception.values[0].stacktrace.frames[0].filename,
  "index.js",
);
console.log(
  "✓ telemetry removes note data, identity, context and stack locals",
);
