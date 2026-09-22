import { strict as assert } from "assert";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { WorkspaceStore } from "../src/main/workspace";

const run = async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "bedrock-workspace-test-"));
  try {
    const profile = path.join(temporary, "profile");
    const first = path.join(temporary, "Documents", "Bedrock");
    const second = path.join(temporary, "other");
    const store = new WorkspaceStore(profile, first);
    assert.equal((await store.getInfo()).rootPath, null);
    await assert.rejects(() => store.createNote(), /Choose a root/);
    await store.selectRoot(first);
    await fs.writeFile(path.join(first, "Untitled.md"), "Keep my existing note");
    const [one, two] = await Promise.all([store.createNote(), store.createNote()]);
    assert.equal(path.basename(one.filePath), "Untitled 2.md");
    assert.equal(path.basename(two.filePath), "Untitled 3.md");
    assert.equal(await fs.readFile(path.join(first, "Untitled.md"), "utf8"), "Keep my existing note");
    await store.rememberFile(one.filePath);
    const reloaded = new WorkspaceStore(profile, first);
    const info = await reloaded.getInfo();
    assert.equal(info.rootPath, await fs.realpath(first));
    assert.deepEqual(info.recentFiles.map((file) => path.basename(file.filePath)), ["Untitled 2.md", "Untitled 3.md"]);
    const data = await fs.readFile(path.join(first, ".bedrock", "recent-files.json"), "utf8");
    assert(data.includes('"path": "Untitled 2.md"'));
    assert(!data.includes(first));
    console.log("✓ workspace creation, exclusive note naming, and portable recent-file persistence");

    await store.selectRoot(second);
    assert.equal((await store.getInfo()).recentFiles.length, 0);
    assert.equal(path.dirname((await store.createNote()).filePath), await fs.realpath(second));
    await store.selectRoot(first);
    assert.equal((await store.getInfo()).recentFiles.length, 2);
    assert.equal(await fs.readFile(one.filePath, "utf8"), "");
    console.log("✓ switching roots preserves each folder and its own recent files");

    await fs.rm(path.join(first, ".bedrock"), { recursive: true });
    const recovered = await store.createNote();
    assert.equal((await store.getInfo()).recentFiles[0].filePath, recovered.filePath);
    await fs.rm(path.join(first, ".bedrock"), { recursive: true });
    await fs.writeFile(path.join(first, ".bedrock"), "Not a directory");
    const available = await store.createNote();
    assert.equal(await fs.readFile(available.filePath, "utf8"), "");
    await fs.unlink(path.join(first, ".bedrock"));
    console.log("✓ missing history is recreated and failed history does not orphan a created note");

    const outside = path.join(temporary, "outside-metadata");
    await fs.mkdir(outside);
    await fs.symlink(outside, path.join(first, ".bedrock"));
    await assert.rejects(() => store.getInfo(), /data folder/);
    assert.deepEqual(await fs.readdir(outside), []);
    await fs.unlink(path.join(first, ".bedrock"));

    const invalid = path.join(temporary, "invalid");
    await fs.mkdir(path.join(invalid, ".bedrock"), { recursive: true });
    const invalidData = path.join(invalid, ".bedrock", "recent-files.json");
    await fs.writeFile(invalidData, "not json");
    await store.selectRoot(invalid);
    assert.equal((await store.getInfo()).rootPath, await fs.realpath(invalid));
    assert.ok((await store.getInfo()).warning);
    assert.equal((await store.getInfo()).recentFiles.length, 0);
    assert.equal(await fs.readFile(invalidData, "utf8"), "not json");
    await store.selectRoot(first);
    await fs.rename(first, `${first}-moved`);
    await assert.rejects(() => store.getInfo());
    await assert.rejects(() => fs.stat(first));
    await store.selectRoot(second);
    assert.equal((await store.getInfo()).rootPath, await fs.realpath(second));
    console.log("✓ invalid metadata and missing roots fail without overwriting data; another root recovers");
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
};

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
