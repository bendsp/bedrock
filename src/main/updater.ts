import { app, autoUpdater } from "electron";
import packageJson from "../../package.json";
import { BedrockRuntimeInfo } from "../shared/types";
import {
  captureMainTelemetryException,
  captureMainTelemetryMessage,
} from "./observability";
import { FakeAutoUpdater, FeedAutoUpdater, UpdaterService } from "./updaterService";

const isSupportedPlatform = (platform: NodeJS.Platform): boolean => {
  return platform === "darwin" || platform === "win32";
};

const isWindowsSquirrelFirstRun = (): boolean => {
  return process.platform === "win32" && process.argv.includes("--squirrel-firstrun");
};

const parseRepositoryInfo = (): { owner: string; name: string } | null => {
  const repository = packageJson.repository;
  const rawUrl =
    typeof repository === "string"
      ? repository
      : repository && typeof repository.url === "string"
      ? repository.url
      : null;

  if (!rawUrl) {
    return null;
  }

  const match = rawUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
  if (!match || !match[1] || !match[2]) {
    return null;
  }

  return {
    owner: match[1],
    name: match[2],
  };
};

const buildFeedUrl = (): string | null => {
  const repo = parseRepositoryInfo();
  if (!repo) {
    return null;
  }

  return `https://update.electronjs.org/${repo.owner}/${repo.name}/${process.platform}-${process.arch}/${app.getVersion()}`;
};

export const createUpdaterService = (
  runtimeInfo: BedrockRuntimeInfo
): UpdaterService => {
  const testUpdater = runtimeInfo.e2eMode ? new FakeAutoUpdater() : null;
  const supported = runtimeInfo.e2eMode
    ? true
    : app.isPackaged &&
      isSupportedPlatform(process.platform) &&
      !isWindowsSquirrelFirstRun();

  return new UpdaterService({
    runtimeInfo,
    updater: (testUpdater ?? autoUpdater) as FeedAutoUpdater,
    supported,
    feedUrl: supported ? buildFeedUrl() : null,
    onTelemetryException: captureMainTelemetryException,
    onTelemetryMessage: captureMainTelemetryMessage,
  });
};
