export interface CursorPosition {
  line: number;
  char: number;
}

export type RenderMode = "hybrid" | "raw";

// File Operation Types
export type DiscardAction = "open" | "close" | "new";

export interface OpenFileResult {
  filePath: string;
  content: string;
}

export interface OpenSpecificFilePayload {
  filePath: string;
}

export interface SaveFilePayload {
  filePath?: string;
  content: string;
}

export interface SaveFileResult {
  filePath: string;
}

export interface DiscardPromptPayload {
  action: DiscardAction;
  fileName?: string;
}

export interface BedrockRuntimeInfo {
  appVersion: string;
  environment: string;
  release: string;
  sentryDsn: string | null;
  telemetryEnabled: boolean;
  e2eMode: boolean;
}

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "error";

export type UpdaterCheckSource = "startup" | "manual";

export interface UpdaterSnapshot {
  status: UpdaterStatus;
  availableVersion: string | null;
  downloadedVersion: string | null;
  releaseNotes: string | null;
  errorMessage: string | null;
  source: UpdaterCheckSource | null;
}

export interface ManualUpdateCheckResult {
  kind:
    | "started"
    | "not-available"
    | "already-in-progress"
    | "already-ready"
    | "unsupported"
    | "error";
  message?: string;
}

export type BedrockTestUpdaterEvent =
  | { type: "update-available" }
  | {
      type: "update-downloaded";
      version: string;
      releaseNotes?: string | null;
    }
  | { type: "update-not-available" }
  | { type: "error"; message: string };

export interface BedrockTestConfig {
  nextOpenPath?: string | null;
  nextSavePath?: string | null;
  discardResponse?: boolean | null;
}

export interface BedrockTestState extends BedrockTestConfig {
  lastDiscardPrompt: DiscardPromptPayload | null;
  updaterSnapshot: UpdaterSnapshot | null;
  updaterInstallRequested: boolean;
  lastManualUpdateCheckResult: ManualUpdateCheckResult | null;
}

export type ExportFormat = "html" | "pdf";

export interface ExportFilePayload {
  content: string;
  format: ExportFormat;
  defaultFileName?: string;
}

export interface IElectronAPI {
  openFile: () => Promise<OpenFileResult | null>;
  saveFile: (payload: SaveFilePayload) => Promise<SaveFileResult | null>;
  confirmDiscardChanges: (payload: DiscardPromptPayload) => Promise<boolean>;
  notifyDirtyState: (isDirty: boolean) => void;
  openDevTools: () => void;
  getAppVersion: () => Promise<string>;
  getRuntimeInfo: () => Promise<BedrockRuntimeInfo>;
  openExternal: (url: string) => Promise<void>;
  onFind: (callback: () => void) => () => void;
  exportFile: (payload: ExportFilePayload) => Promise<boolean>;
  readFile: (filePath: string) => Promise<OpenFileResult | null>;
  consumePendingExternalOpenFiles: () => Promise<OpenSpecificFilePayload[]>;
  onExternalOpenFile: (
    callback: (payload: OpenSpecificFilePayload) => void
  ) => () => void;
  getUpdaterState: () => Promise<UpdaterSnapshot>;
  checkForUpdates: () => Promise<ManualUpdateCheckResult>;
  installUpdate: () => Promise<boolean>;
  onUpdaterState: (callback: (snapshot: UpdaterSnapshot) => void) => () => void;
  onCheckForUpdatesRequest: (callback: () => void) => () => void;
  notifyRendererReady: () => void;
  test?: {
    configure: (config: BedrockTestConfig) => Promise<BedrockTestState | null>;
    getState: () => Promise<BedrockTestState | null>;
    reset: () => Promise<BedrockTestState | null>;
    simulateExternalOpen: (filePath: string) => Promise<boolean>;
    getUpdaterState: () => Promise<UpdaterSnapshot | null>;
    setUpdaterState: (
      snapshot: Partial<UpdaterSnapshot>
    ) => Promise<UpdaterSnapshot | null>;
    emitUpdaterEvent: (
      event: BedrockTestUpdaterEvent
    ) => Promise<UpdaterSnapshot | null>;
  };
}
