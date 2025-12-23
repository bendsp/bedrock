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

export interface IElectronAPI {
  openFile: () => Promise<OpenFileResult | null>;
  saveFile: (payload: SaveFilePayload) => Promise<SaveFileResult | null>;
  confirmDiscardChanges: (payload: DiscardPromptPayload) => Promise<boolean>;
  notifyDirtyState: (isDirty: boolean) => void;
  openDevTools: () => void;
  getAppVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  onFind: (callback: () => void) => void;
  readFile: (filePath: string) => Promise<OpenFileResult | null>;
}
