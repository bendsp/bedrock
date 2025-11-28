interface OpenFileResult {
  filePath: string;
  content: string;
}

interface SaveFilePayload {
  filePath?: string;
  content: string;
}

interface SaveFileResult {
  filePath: string;
}

type DiscardAction = "open" | "close" | "new";

interface DiscardPromptPayload {
  action: DiscardAction;
  fileName?: string;
}

interface IElectronAPI {
  openFile: () => Promise<OpenFileResult | null>;
  saveFile: (payload: SaveFilePayload) => Promise<SaveFileResult | null>;
  confirmDiscardChanges: (payload: DiscardPromptPayload) => Promise<boolean>;
  notifyDirtyState: (isDirty: boolean) => void;
}

interface Window {
  electronAPI: IElectronAPI;
}

