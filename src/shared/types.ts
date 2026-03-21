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

export interface BedrockTestConfig {
  nextOpenPath?: string | null;
  nextSavePath?: string | null;
  discardResponse?: boolean | null;
}

export interface BedrockTestState extends BedrockTestConfig {
  lastDiscardPrompt: DiscardPromptPayload | null;
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
  test?: {
    configure: (config: BedrockTestConfig) => Promise<BedrockTestState | null>;
    getState: () => Promise<BedrockTestState | null>;
    reset: () => Promise<BedrockTestState | null>;
  };
}
