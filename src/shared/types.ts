export interface CursorPosition {
  line: number;
  char: number;
}

export interface SelectionStats {
  hasSelection: boolean;
  words: number;
  chars: number;
}

export type RenderMode = "hybrid" | "raw";

// File Operation Types
export type DiscardAction = "open" | "close" | "new" | "home";

export interface RecentFile {
  filePath: string;
  openedAt: string;
}

export interface WorkspaceInfo {
  warning?: string;
  rootPath: string | null;
  suggestedRootPath: string;
  recentFiles: RecentFile[];
}

export interface OpenFileResult {
  filePath: string;
  content: string;
}

export interface OpenSpecificFilePayload {
  filePath: string;
  fragment?: string;
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
  workspaceDelayMs?: number;
  nextRootPath?: string | null;
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

export interface ImportedImage {
  relativePath: string;
  alt: string;
}
export interface WorkspaceSearchResult {
  files: Array<{ relativePath: string; name: string; excerpt?: string }>;
  truncated: boolean;
}
export interface ImageImportRequest {
  documentPath: string;
  images: Array<{ name: string; bytes: Uint8Array }>;
}

export interface IElectronAPI {
  searchWorkspace: (query: string) => Promise<WorkspaceSearchResult>;
  openWorkspaceNote: (relativePath: string) => Promise<OpenFileResult>;
  importImages: (request: ImageImportRequest) => Promise<ImportedImage[]>;
  pasteImage: (documentPath: string) => Promise<ImportedImage[]>;
  resolveImage: (path: string) => Promise<string | null>;
  openNoteLink: (path: string) => Promise<boolean>;
  getWorkspace: () => Promise<WorkspaceInfo>;
  selectRootFolder: (
    choice: "default" | "choose",
  ) => Promise<WorkspaceInfo | null>;
  createNote: () => Promise<OpenFileResult>;
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
    callback: (payload: OpenSpecificFilePayload) => void,
  ) => () => void;
  notifyRendererReady: () => void;
  test?: {
    configure: (config: BedrockTestConfig) => Promise<BedrockTestState | null>;
    getState: () => Promise<BedrockTestState | null>;
    reset: () => Promise<BedrockTestState | null>;
    simulateExternalOpen: (filePath: string) => Promise<boolean>;
  };
}
