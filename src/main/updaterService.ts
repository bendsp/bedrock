import { EventEmitter } from "node:events";
import {
  BedrockRuntimeInfo,
  BedrockTestUpdaterEvent,
  ManualUpdateCheckResult,
  UpdaterCheckSource,
  UpdaterSnapshot,
} from "../shared/types";

export type UpdaterStateListener = (snapshot: UpdaterSnapshot) => void;

export type FeedAutoUpdater = EventEmitter & {
  setFeedURL: (options: { url: string; serverType?: "json" | "default" }) => void;
  checkForUpdates: () => void;
  quitAndInstall: () => void;
};

type UpdaterServiceOptions = {
  runtimeInfo: BedrockRuntimeInfo;
  updater: FeedAutoUpdater;
  supported: boolean;
  feedUrl: string | null;
  onTelemetryException?: (error: unknown, extra?: Record<string, unknown>) => void;
  onTelemetryMessage?: (message: string, extra?: Record<string, unknown>) => void;
};

export const defaultUpdaterSnapshot = (): UpdaterSnapshot => ({
  status: "idle",
  availableVersion: null,
  downloadedVersion: null,
  releaseNotes: null,
  errorMessage: null,
  source: null,
});

const createErrorResult = (message: string): ManualUpdateCheckResult => ({
  kind: "error",
  message,
});

export class FakeAutoUpdater extends EventEmitter implements FeedAutoUpdater {
  public feedUrl: string | null = null;
  public installRequested = false;
  public checkCalls = 0;

  setFeedURL(options: { url: string }): void {
    this.feedUrl = options.url;
  }

  checkForUpdates(): void {
    this.checkCalls += 1;
  }

  quitAndInstall(): void {
    this.installRequested = true;
  }

  reset(): void {
    this.installRequested = false;
    this.checkCalls = 0;
  }
}

export class UpdaterService {
  private readonly runtimeInfo: BedrockRuntimeInfo;
  private readonly updater: FeedAutoUpdater;
  private readonly listeners = new Set<UpdaterStateListener>();
  private readonly supported: boolean;
  private readonly feedUrl: string | null;
  private readonly onTelemetryException?: (
    error: unknown,
    extra?: Record<string, unknown>
  ) => void;
  private readonly onTelemetryMessage?: (
    message: string,
    extra?: Record<string, unknown>
  ) => void;
  private snapshot = defaultUpdaterSnapshot();
  private startupCheckStarted = false;
  private activeCheckSource: UpdaterCheckSource | null = null;
  private pendingManualCheck:
    | {
        resolve: (result: ManualUpdateCheckResult) => void;
      }
    | null = null;
  private lastManualUpdateCheckResult: ManualUpdateCheckResult | null = null;
  private readonly testUpdater: FakeAutoUpdater | null;

  constructor(options: UpdaterServiceOptions) {
    this.runtimeInfo = options.runtimeInfo;
    this.updater = options.updater;
    this.supported = options.supported;
    this.feedUrl = options.feedUrl;
    this.onTelemetryException = options.onTelemetryException;
    this.onTelemetryMessage = options.onTelemetryMessage;
    this.testUpdater =
      options.updater instanceof FakeAutoUpdater ? options.updater : null;

    if (this.supported && this.feedUrl) {
      this.updater.setFeedURL({
        url: this.feedUrl,
        ...(process.platform === "darwin" ? { serverType: "json" as const } : {}),
      });
    }

    this.attachUpdaterListeners();
  }

  private attachUpdaterListeners(): void {
    this.updater.on("error", (error: Error) => {
      const message = error.message || "An unknown updater error occurred.";

      this.onTelemetryException?.(error, {
        operation: "updater.check",
        source: this.activeCheckSource ?? "unknown",
      });

      if (this.activeCheckSource === "manual") {
        this.setSnapshot({
          status: "error",
          errorMessage: message,
        });
        this.resolveManualCheck({
          kind: "error",
          message,
        });
        return;
      }

      this.setSnapshot(defaultUpdaterSnapshot());
      this.activeCheckSource = null;
    });

    this.updater.on("update-available", () => {
      this.setSnapshot({
        status: "downloading",
        availableVersion: null,
        downloadedVersion: null,
        releaseNotes: null,
        errorMessage: null,
      });

      if (this.activeCheckSource === "manual") {
        this.resolveManualCheck({
          kind: "started",
          message: "Update available. Downloading in the background.",
        });
      }
    });

    this.updater.on(
      "update-downloaded",
      (
        _event: Event | undefined,
        releaseNotes: string,
        releaseName: string
      ) => {
        const version = releaseName || null;
        this.setSnapshot({
          status: "ready",
          availableVersion: version,
          downloadedVersion: version,
          releaseNotes: releaseNotes || null,
          errorMessage: null,
        });

        if (this.activeCheckSource === "manual") {
          this.resolveManualCheck({
            kind: "started",
            message: "Update downloaded and ready to install.",
          });
        } else {
          this.activeCheckSource = null;
        }
      }
    );

    this.updater.on("update-not-available", () => {
      this.setSnapshot(defaultUpdaterSnapshot());

      if (this.activeCheckSource === "manual") {
        this.resolveManualCheck({
          kind: "not-available",
          message: "You’re up to date.",
        });
      } else {
        this.activeCheckSource = null;
      }
    });
  }

  private setSnapshot(next: Partial<UpdaterSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...next,
      source:
        "source" in next
          ? next.source ?? null
          : this.activeCheckSource ?? this.snapshot.source,
    };
    this.emitState();
  }

  private emitState(): void {
    for (const listener of this.listeners) {
      listener({ ...this.snapshot });
    }
  }

  private resolveManualCheck(result: ManualUpdateCheckResult): void {
    this.lastManualUpdateCheckResult = result;
    const pending = this.pendingManualCheck;
    this.pendingManualCheck = null;
    this.activeCheckSource = this.snapshot.status === "ready" ? this.snapshot.source : null;
    pending?.resolve(result);
  }

  getState(): UpdaterSnapshot {
    return { ...this.snapshot };
  }

  subscribe(listener: UpdaterStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  startStartupCheck(): void {
    if (!this.supported || this.runtimeInfo.e2eMode || this.startupCheckStarted) {
      return;
    }
    this.startupCheckStarted = true;
    if (this.snapshot.status !== "idle") {
      return;
    }

    this.activeCheckSource = "startup";
    this.setSnapshot({
      status: "checking",
      errorMessage: null,
      source: "startup",
    });

    try {
      this.updater.checkForUpdates();
    } catch (error) {
      this.onTelemetryException?.(error, {
        operation: "updater.check",
        source: "startup",
      });
      this.setSnapshot(defaultUpdaterSnapshot());
      this.activeCheckSource = null;
    }
  }

  async checkForUpdates(): Promise<ManualUpdateCheckResult> {
    if (!this.supported || !this.feedUrl) {
      return {
        kind: "unsupported",
        message:
          "Self-updates are only available in packaged Bedrock builds on macOS and Windows.",
      };
    }

    if (this.snapshot.status === "ready") {
      return {
        kind: "already-ready",
        message: "An update is already downloaded and ready to install.",
      };
    }

    if (this.snapshot.status === "checking" || this.snapshot.status === "downloading") {
      return {
        kind: "already-in-progress",
        message: "Bedrock is already checking for or downloading an update.",
      };
    }

    this.activeCheckSource = "manual";
    this.setSnapshot({
      status: "checking",
      errorMessage: null,
      source: "manual",
    });

    return await new Promise<ManualUpdateCheckResult>((resolve) => {
      this.pendingManualCheck = { resolve };

      try {
        this.updater.checkForUpdates();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to check for updates right now.";
        this.onTelemetryException?.(error, {
          operation: "updater.check",
          source: "manual",
        });
        this.setSnapshot({
          status: "error",
          errorMessage: message,
          source: "manual",
        });
        this.resolveManualCheck(createErrorResult(message));
      }
    });
  }

  installUpdate(): boolean {
    if (this.snapshot.status !== "ready") {
      return false;
    }

    try {
      this.updater.quitAndInstall();
      this.onTelemetryMessage?.("Updater install requested", {
        operation: "updater.install",
        version: this.snapshot.downloadedVersion,
      });
      return true;
    } catch (error) {
      this.onTelemetryException?.(error, {
        operation: "updater.install",
        version: this.snapshot.downloadedVersion,
      });
      return false;
    }
  }

  getTestMeta():
    | {
        updaterSnapshot: UpdaterSnapshot;
        updaterInstallRequested: boolean;
        lastManualUpdateCheckResult: ManualUpdateCheckResult | null;
      }
    | null {
    if (!this.testUpdater) {
      return null;
    }

    return {
      updaterSnapshot: this.getState(),
      updaterInstallRequested: this.testUpdater.installRequested,
      lastManualUpdateCheckResult: this.lastManualUpdateCheckResult,
    };
  }

  setTestState(snapshot: Partial<UpdaterSnapshot>): UpdaterSnapshot | null {
    if (!this.testUpdater) {
      return null;
    }

    this.snapshot = {
      ...defaultUpdaterSnapshot(),
      ...snapshot,
    };
    this.activeCheckSource = this.snapshot.source;
    this.emitState();
    return this.getState();
  }

  resetTestState(): UpdaterSnapshot | null {
    if (!this.testUpdater) {
      return null;
    }

    this.testUpdater.reset();
    this.lastManualUpdateCheckResult = null;
    this.pendingManualCheck = null;
    this.activeCheckSource = null;
    this.snapshot = defaultUpdaterSnapshot();
    this.emitState();
    return this.getState();
  }

  emitTestEvent(event: BedrockTestUpdaterEvent): UpdaterSnapshot | null {
    if (!this.testUpdater) {
      return null;
    }

    if (event.type === "update-available") {
      this.testUpdater.emit("update-available");
    } else if (event.type === "update-downloaded") {
      this.testUpdater.emit(
        "update-downloaded",
        undefined,
        event.releaseNotes ?? "",
        event.version,
        new Date(),
        this.feedUrl ?? ""
      );
    } else if (event.type === "update-not-available") {
      this.testUpdater.emit("update-not-available");
    } else {
      this.testUpdater.emit("error", new Error(event.message));
    }

    return this.getState();
  }
}
