import { strict as assert } from "assert";
import { DocumentModel } from "../src/renderer/models/DocumentModel";
import { renderMarkdownLines } from "../src/renderer/services/markdownRenderer";
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

runTest("insert newline splits text and advances cursor", () => {
  const model = new DocumentModel("hello");
  model.setCursor({ line: 0, char: 5 });

  model.insertChar("\n");

  assert.equal(model.getAll(), "hello\n");
  assert.deepEqual(model.getCursor(), { line: 1, char: 0 });
});

runTest("backspace at line start joins with previous line", () => {
  const model = new DocumentModel("hello\nworld");
  model.setCursor({ line: 1, char: 0 });

  model.deleteChar();

  assert.equal(model.getAll(), "helloworld");
  assert.deepEqual(model.getCursor(), { line: 0, char: 5 });
});

runTest("vertical movement clamps to last remembered column", () => {
  const model = new DocumentModel("short\nmuchlonger");
  const target: CursorPosition = { line: 0, char: 5 };
  model.setCursor(target);

  model.moveCursorDown();
  assert.deepEqual(model.getCursor(), { line: 1, char: 5 });

  model.moveCursorUp();
  assert.deepEqual(model.getCursor(), target);
});

runTest("renderMarkdownLines preserves fenced code blocks", () => {
  const lines = renderMarkdownLines("```js\nconsole.log(1)\n```");

  assert.equal(lines.length, 3);
  assert(lines[0].includes("code-fence"), "fence delimiter is styled");
  assert(lines[1].includes("inline-editor__codeblock"), "code line is styled");
  assert(lines[1].includes("console.log(1)"), "code content is present");
});

if (process.exitCode && process.exitCode !== 0) {
  throw new Error("One or more tests failed.");
}

