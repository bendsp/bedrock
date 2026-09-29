import { updateSmokeFeed } from "./updateSmoke";
import { updateTestBackend, UpdateTestScenario } from "./updateTestBackend";
import { app, net, autoUpdater as nativeUpdater } from "electron";
import { MacUpdater, NsisUpdater, AppUpdater, CancellationToken } from "electron-updater";
import { promises as fs } from "node:fs";
import path from "node:path";
import { eq } from "semver";
import { UpdateChannel, UpdateStatus } from "../shared/updates";
import { UpdateBackend, UpdateCandidate, UpdateController } from "./updateController";
import { selectRelease, versionChannel } from "./updateReleases";
import { atomicWriteFile } from "./noteFiles";

class ElectronUpdateBackend implements UpdateBackend {
  private updater: AppUpdater;
  private cancellation: CancellationToken | null = null;
  private cancelled = false;
  private installListeners: ReturnType<typeof nativeUpdater.listeners> = [];
  constructor(private readonly failed: (error: Error) => void) {
    this.updater = process.platform === "darwin" ? new MacUpdater() : new NsisUpdater();
    this.updater.autoDownload = false;
    // On macOS this also defers native staging until the explicit install action.
    this.updater.autoInstallOnAppQuit = false;
    this.updater.disableDifferentialDownload = true;
    this.updater.on("error", error => this.failed(error));
  }
  async check(channel: UpdateChannel): Promise<UpdateCandidate | null> {
    const smokeFeed = updateSmokeFeed();
    const url = smokeFeed ? `${smokeFeed}${channel}/releases.json` : channel === "stable" ? "https://api.github.com/repos/bendsp/bedrock/releases/latest" :
      "https://api.github.com/repos/bendsp/bedrock/releases?per_page=100";
    const response = await net.fetch(url, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ?
      "Update checks are temporarily rate-limited. Try again later." : `Unable to check updates (${response.status}). Try again later.`);
    const text = await response.text();
    if (text.length > 4 * 1024 * 1024) throw new Error("Release response is too large.");
    const result = JSON.parse(text);
    const candidate = selectRelease(channel === "stable" ? [result] : result, channel, app.getVersion(), process.platform, process.arch);
    return candidate && smokeFeed ? { ...candidate, feedUrl: `${smokeFeed}${channel}/` } : candidate;
  }
  async download(candidate: UpdateCandidate, progress: (percent: number) => void): Promise<void> {
    this.cancelled = false;
    this.updater.setFeedURL({ provider: "generic", url: candidate.feedUrl, channel: `latest-${process.arch}`, useMultipleRangeRequest: false });
    this.updater.allowPrerelease = candidate.channel === "nightly";
    this.updater.allowDowngrade = candidate.downgrade;
    const result = await this.updater.checkForUpdates();
    if (!result || !eq(result.updateInfo.version, candidate.version)) throw new Error("The update changed. Check again before downloading.");
    if (this.cancelled) throw new Error("Download cancelled.");
    this.cancellation = new CancellationToken();
    const listener = (event: { percent: number }) => progress(event.percent);
    this.updater.on("download-progress", listener);
    try { await this.updater.downloadUpdate(this.cancellation); }
    finally { this.cancellation = null; this.updater.removeListener("download-progress", listener); }
  }
  cancel() { this.cancelled = true; this.cancellation?.cancel(); }
  install() {
    const before = nativeUpdater.listeners("update-downloaded");
    this.updater.quitAndInstall(false, true);
    this.installListeners = nativeUpdater.listeners("update-downloaded").filter(listener => !before.includes(listener));
  }
  abortInstall() {
    for (const listener of this.installListeners) nativeUpdater.removeListener("update-downloaded", listener as (...args: unknown[]) => void);
    this.installListeners = [];
  }
}

export async function createUpdates(emit: (status: UpdateStatus) => void, disabled: string | null, scenario?: UpdateTestScenario): Promise<UpdateController> {
  const preference = path.join(app.getPath("userData"), "updates.json");
  let channel: UpdateChannel = versionChannel(scenario?.version ?? app.getVersion());
  try {
    const saved = JSON.parse(await fs.readFile(preference, "utf8"));
    if (saved.channel === "stable" || saved.channel === "nightly") channel = saved.channel;
  } catch (error) {
    if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== "ENOENT") disabled = "Unable to read update preferences. Check access to your app settings folder.";
  }
  const backend: UpdateBackend = scenario ? updateTestBackend(scenario) : disabled ? {
    check: async () => null, download: async () => undefined, cancel: () => undefined, install: () => undefined,
  } : new ElectronUpdateBackend(error => {
    if (controller?.getStatus().phase === "installing") controller.failed(error);
  });
  const controller = new UpdateController(backend, scenario?.version ?? app.getVersion(), channel,
    async selected => { await atomicWriteFile(preference, JSON.stringify({ channel: selected }) + "\n"); }, emit, disabled);
  return controller;
}
