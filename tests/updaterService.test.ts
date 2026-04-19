import { strict as assert } from "assert";
import { BedrockRuntimeInfo } from "../src/shared/types";
import {
  FakeAutoUpdater,
  UpdaterService,
  defaultUpdaterSnapshot,
} from "../src/main/updaterService";

const runtimeInfo: BedrockRuntimeInfo = {
  appVersion: "1.3.3",
  environment: "test",
  release: "bedrock@1.3.3",
  sentryDsn: null,
  telemetryEnabled: false,
  e2eMode: true,
};

const runTest = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
};

const createService = () => {
  const updater = new FakeAutoUpdater();
  const service = new UpdaterService({
    runtimeInfo,
    updater,
    supported: true,
    feedUrl: "https://update.electronjs.org/bendsp/bedrock/darwin-arm64/1.3.3",
  });

  return { updater, service };
};

void runTest("manual check resolves no update available and resets to idle", async () => {
  const { updater, service } = createService();
  const resultPromise = service.checkForUpdates();

  assert.equal(service.getState().status, "checking");
  assert.equal(updater.checkCalls, 1);

  updater.emit("update-not-available");

  const result = await resultPromise;
  assert.deepEqual(result, {
    kind: "not-available",
    message: "You’re up to date.",
  });
  assert.deepEqual(service.getState(), defaultUpdaterSnapshot());
});

void runTest("manual check transitions through downloading to ready", async () => {
  const { updater, service } = createService();
  const resultPromise = service.checkForUpdates();

  updater.emit("update-available");

  const result = await resultPromise;
  assert.equal(result.kind, "started");
  assert.equal(service.getState().status, "downloading");
  assert.equal(service.getState().source, "manual");

  updater.emit(
    "update-downloaded",
    undefined,
    "Notes",
    "1.3.4",
    new Date(),
    "https://example.com/download"
  );

  assert.deepEqual(service.getState(), {
    status: "ready",
    availableVersion: "1.3.4",
    downloadedVersion: "1.3.4",
    releaseNotes: "Notes",
    errorMessage: null,
    source: "manual",
  });
});

void runTest("manual check surfaces updater errors", async () => {
  const { updater, service } = createService();
  const resultPromise = service.checkForUpdates();

  updater.emit("error", new Error("network down"));

  const result = await resultPromise;
  assert.deepEqual(result, {
    kind: "error",
    message: "network down",
  });
  assert.equal(service.getState().status, "error");
  assert.equal(service.getState().errorMessage, "network down");
});

void runTest("duplicate manual checks are rejected while already checking", async () => {
  const { service } = createService();
  const firstPromise = service.checkForUpdates();
  const secondResult = await service.checkForUpdates();

  assert.deepEqual(secondResult, {
    kind: "already-in-progress",
    message: "Bedrock is already checking for or downloading an update.",
  });

  service.emitTestEvent({ type: "update-not-available" });
  await firstPromise;
});

void runTest("install update only succeeds from ready state", async () => {
  const { service } = createService();

  assert.equal(service.installUpdate(), false);

  service.setTestState({
    status: "ready",
    downloadedVersion: "1.3.4",
    availableVersion: "1.3.4",
    source: "manual",
  });

  assert.equal(service.installUpdate(), true);
  assert.equal(service.getTestMeta()?.updaterInstallRequested, true);
});

if (process.exitCode && process.exitCode !== 0) {
  throw new Error("One or more tests failed.");
}
