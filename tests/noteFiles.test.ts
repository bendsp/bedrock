import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  atomicWriteFile,
  atomicWriteNote,
  readNote,
  revision,
  resolveNoteResource,
  readImage,
} from "../src/main/noteFiles";
async function run() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bedrock-note-files-"));
  try {
    const note = path.join(dir, "note.md");
    await fs.writeFile(note, "original", { mode: 0o664 });
    await fs.chmod(note, 0o664);
    await atomicWriteNote(note, "saved", revision("original"));
    assert.equal(await readNote(note), "saved");
    assert.equal((await fs.stat(note)).mode & 0o777, 0o664);
    await fs.writeFile(note, "external edit");
    await assert.rejects(
      atomicWriteNote(note, "would lose edit", revision("saved")),
      /outside Bedrock/,
    );
    assert.equal(await readNote(note), "external edit");
    assert.deepEqual(
      (await fs.readdir(dir)).filter((name) => name.endsWith(".tmp")),
      [],
    );
    await assert.rejects(
      atomicWriteFile(note, Buffer.from("replacement"), async () => {
        throw new Error("write cancelled");
      }),
      /cancelled/,
    );
    assert.equal(await readNote(note), "external edit");
    assert.deepEqual(
      (await fs.readdir(dir)).filter((name) => name.endsWith(".tmp")),
      [],
    );
    const encoded = path.join(dir, "encoded.md");
    await fs.writeFile(encoded, Buffer.from([99, 97, 102, 233]));
    await assert.rejects(readNote(encoded), /UTF-8/);
    assert.deepEqual(
      await fs.readFile(encoded),
      Buffer.from([99, 97, 102, 233]),
    );
    await fs.writeFile(encoded, Buffer.from("text", "utf16le"));
    await assert.rejects(readNote(encoded), /UTF-16/);
    await fs.writeFile(encoded, "\ufeff# Title");
    assert.equal(await readNote(encoded), "\ufeff# Title");
    const link = path.join(dir, "link.md");
    await fs.symlink(note, link);
    await atomicWriteNote(link, "through link", revision("external edit"));
    assert.equal((await fs.lstat(link)).isSymbolicLink(), true);
    assert.equal(await readNote(note), "through link");
    await assert.rejects(resolveNoteResource(note, dir, "../outside.png"));
    await assert.rejects(resolveNoteResource(note, dir, "file:///etc/passwd"));
    await assert.rejects(readImage(note), /PNG/);
    console.log(
      "✓ atomic saves preserve permissions, symlinks and external changes; resources reject unsafe paths",
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
