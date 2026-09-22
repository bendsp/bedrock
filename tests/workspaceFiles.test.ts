import { resolveNoteResource } from "../src/main/noteFiles";
import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  importImages,
  parseImageBatch,
  searchWorkspace,
  workspaceNote,
} from "../src/main/workspaceFiles";

async function run() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "bedrock-files-"));
  try {
    const root = path.join(temporary, "Bedrock");
    await fs.mkdir(path.join(root, "Projects"), { recursive: true });
    const note = path.join(root, "Projects", "Notes.md");
    await fs.writeFile(note, "A rare marmalade word");
    await fs.writeFile(path.join(root, "Other.md"), "Ordinary text");
    await fs.mkdir(path.join(root, ".private"));
    await fs.writeFile(path.join(root, ".private", "Hidden.md"), "marmalade");
    await fs.writeFile(path.join(temporary, "Outside.md"), "marmalade");
    await fs.symlink(temporary, path.join(root, "Linked"), "dir");
    const names = await searchWorkspace(root, "projects notes", []);
    assert.deepEqual(
      names.files.map((file) => file.relativePath),
      ["Projects/Notes.md"],
    );
    const contents = await searchWorkspace(root, "marmalade", []);
    assert.deepEqual(
      contents.files.map((file) => file.relativePath),
      ["Projects/Notes.md"],
    );
    assert(contents.files[0].excerpt?.includes("marmalade"));
    assert.equal(
      (await searchWorkspace(root, "", [note])).files[0].name,
      "Notes.md",
    );
    assert.equal(
      (await searchWorkspace(root, "", [], () => true)).files.length,
      0,
    );
    await assert.rejects(() => workspaceNote(root, "../Outside.md"));
    await assert.rejects(() => workspaceNote(root, "Linked/Outside.md"));
    console.log(
      "✓ quick-open searches names and contents, ranks recents, cancels, and excludes outside/hidden notes",
    );

    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
      "base64",
    );
    const batch = parseImageBatch([{ name: "Screenshot.png", bytes }]);
    const [first, second] = await Promise.all([
      importImages(root, note, batch),
      importImages(root, note, batch),
    ]);
    assert.notEqual(first[0].relativePath, second[0].relativePath);
    assert(first[0].relativePath.startsWith("../Attachments/"));
    assert.deepEqual(
      await fs.readFile(
        path.resolve(path.dirname(note), first[0].relativePath),
      ),
      bytes,
    );
    assert.throws(() =>
      parseImageBatch([
        { name: "evil.png", bytes: Buffer.from("<svg onload='alert(1)'>") },
      ]),
    );
    assert.throws(() =>
      parseImageBatch([
        { name: "big.png", bytes: Buffer.alloc(11 * 1024 * 1024) },
      ]),
    );
    assert.throws(() =>
      parseImageBatch(Array(11).fill({ name: "image.png", bytes })),
    );
    await assert.rejects(() =>
      importImages(root, path.join(temporary, "Outside.md"), batch),
    );
    const alias = path.join(root, "Alias.md");
    await fs.symlink(note, alias);
    const aliasImages = await importImages(root, alias, batch);
    assert(aliasImages[0].relativePath.startsWith("../Attachments/"));
    assert.deepEqual(
      await fs.readFile(
        await resolveNoteResource(alias, root, aliasImages[0].relativePath),
      ),
      bytes,
    );
    const moved = path.join(temporary, "Moved Bedrock");
    await fs.rename(root, moved);
    assert.deepEqual(
      await fs.readFile(path.resolve(moved, "Projects", first[0].relativePath)),
      bytes,
    );
    console.log(
      "✓ imported images use unique workspace files and remain portable when the root folder moves",
    );
    await fs.rm(path.join(moved, "Attachments"), { recursive: true });
    await fs.symlink(temporary, path.join(moved, "Attachments"), "dir");
    await assert.rejects(() =>
      importImages(moved, path.join(moved, "Projects", "Notes.md"), batch),
    );
    console.log(
      "✓ image imports reject unsupported, oversized, outside-note and symlink destinations",
    );
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
