import assert from "node:assert/strict";
import { UpdateBackend, UpdateController } from "../src/main/updateController";
import { selectRelease } from "../src/main/updateReleases";
const release = (version: string, nightly: boolean, extra = {}) => ({ tag_name: version, prerelease: nightly, draft: false,
  published_at: "2026-09-29T12:00:00Z", assets: [{ name: "latest-arm64-mac.yml" }], ...extra });
async function run() {
  const stable = release("1.5.2", false);
  const nightly = release("1.5.3-nightly.20260929.10", true);
  assert.equal(selectRelease([nightly, stable], "stable", "1.5.1", "darwin", "arm64")?.version, "1.5.2");
  assert.equal(selectRelease([nightly, stable], "nightly", "1.5.2", "darwin", "arm64")?.version, nightly.tag_name);
  assert.equal(selectRelease([stable], "stable", nightly.tag_name, "darwin", "arm64")?.downgrade, true);
  assert.equal(selectRelease([stable], "stable", "1.5.3", "darwin", "arm64"), null);
  assert.equal(selectRelease([stable], "stable", "1.5.2", "darwin", "arm64"), null);
  assert.throws(() => selectRelease([release("1.5.2", false, { draft: true })], "stable", "1.5.1", "darwin", "arm64"));
  assert.throws(() => selectRelease([stable], "stable", "1.5.1", "darwin", "x64"));
  assert.throws(() => selectRelease([release("1.5.2-beta.1", true)], "nightly", "1.5.1", "darwin", "arm64"));
  console.log("✓ channels exclude drafts and other prereleases, require matching artifacts, and allow only cross-channel downgrades");
  let installed = 0, checks = 0;
  let resolveDownload: (() => void) | null = null;
  let resolvePreference: (() => void) | null = null;
  let progress: ((value: number) => void) | null = null;
  const persisted: string[] = [];
  const backend: UpdateBackend = {
    async check(channel) { checks++; return selectRelease([nightly, stable], channel, "1.5.2", "darwin", "arm64"); },
    async download(_candidate, callback) { progress = callback; await new Promise<void>(resolve => { resolveDownload = resolve; }); },
    cancel() { resolveDownload?.(); }, install() { installed++; },
  };
  const controller = new UpdateController(backend, "1.5.2", "stable", async channel => { persisted.push(channel); }, () => undefined);
  await controller.selectChannel("nightly");
  await controller.check();
  const download = controller.download();
  await Promise.resolve();
  assert.throws(() => controller.install(false));
  await assert.rejects(controller.selectChannel("stable"));
  await controller.cancel();
  await download;
  assert.equal(controller.getStatus().phase, "idle");
  (progress as ((value: number) => void) | null)?.(99);
  assert.equal(controller.getStatus().progress, null);
  assert.throws(() => controller.install(false));
  await controller.check();
  const retry = controller.download();
  await Promise.resolve();
  (resolveDownload as (() => void) | null)?.();
  await retry;
  assert.equal(controller.getStatus().phase, "ready");
  assert.throws(() => controller.install(true), /Save/);
  await controller.selectChannel("stable");
  assert.throws(() => controller.install(false));
  await controller.check();
  assert.equal(controller.getStatus().phase, "current");
  assert.equal(installed, 0);
  assert.equal(checks, 3);
  assert.deepEqual(persisted, ["nightly", "stable"]);
  console.log("✓ cancelled or switched-channel downloads cannot install; dirty documents block restart");
  const reserved = new UpdateController(backend, "1.5.2", "stable", async () => new Promise<void>(resolve => { resolvePreference = resolve; }), () => undefined);
  const switching = reserved.selectChannel("nightly");
  assert.throws(() => reserved.check());
  (resolvePreference as (() => void) | null)?.();
  await switching;
  assert.equal(reserved.getStatus().channel, "nightly");
  const failed = new UpdateController({ ...backend, check: async () => { throw new Error("Offline"); } }, "1.5.2", "stable", async () => undefined, () => undefined);
  await failed.check();
  assert.equal(failed.getStatus().message, "Offline");
  assert.equal(failed.getStatus().phase, "error");
  const unwritable = new UpdateController(backend, "1.5.2", "stable", async () => { throw new Error("Read only"); }, () => undefined);
  await assert.rejects(unwritable.selectChannel("nightly"), /Read only/);
  assert.equal(unwritable.getStatus().channel, "stable");
  let aborted = false;
  const brokenInstall = new UpdateController({ ...backend, download: async () => undefined,
    install: () => { throw new Error("Installer failed"); }, abortInstall: () => { aborted = true; } },
  "1.5.2", "nightly", async () => undefined, () => undefined);
  await brokenInstall.check();
  await brokenInstall.download();
  brokenInstall.install(false);
  assert.equal(brokenInstall.getStatus().phase, "disabled");
  assert.equal(aborted, true);
  await assert.rejects(brokenInstall.selectChannel("stable"), /Restart Bedrock/);
  assert.throws(() => brokenInstall.install(false));
  console.log("✓ channel writes serialize operations; preference and installer failures cannot install stale updates");
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
