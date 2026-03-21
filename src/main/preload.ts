import { contextBridge, ipcRenderer } from "electron";
import {
  BedrockRuntimeInfo,
  BedrockTestConfig,
  BedrockTestState,
  SaveFilePayload,
  DiscardPromptPayload,
  OpenFileResult,
  SaveFileResult,
  ExportFilePayload,
} from "../shared/types";

contextBridge.exposeInMainWorld("electronAPI", {
  openFile: (): Promise<OpenFileResult | null> =>
    ipcRenderer.invoke("file:open"),
  saveFile: (payload: SaveFilePayload): Promise<SaveFileResult | null> =>
    ipcRenderer.invoke("file:save", payload),
  confirmDiscardChanges: (payload: DiscardPromptPayload): Promise<boolean> =>
    ipcRenderer.invoke("dialog:confirm-discard", payload),
  notifyDirtyState: (isDirty: boolean): void =>
    ipcRenderer.send("file:dirty-state-changed", isDirty),
  openDevTools: (): void => {
    ipcRenderer.send("devtools:open");
  },
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("app:get-version"),
  getRuntimeInfo: (): Promise<BedrockRuntimeInfo> =>
    ipcRenderer.invoke("app:get-runtime-info"),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke("shell:open-external", url),
  onFind: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on("editor:find", listener);
    return () => {
      ipcRenderer.removeListener("editor:find", listener);
    };
  },
  exportFile: (payload: ExportFilePayload): Promise<boolean> =>
    ipcRenderer.invoke("file:export", payload),
  readFile: (filePath: string): Promise<OpenFileResult | null> =>
    ipcRenderer.invoke("file:read", filePath),
  test:
    process.env.BEDROCK_E2E === "1"
      ? {
          configure: (config: BedrockTestConfig): Promise<BedrockTestState | null> =>
            ipcRenderer.invoke("test:configure", config),
          getState: (): Promise<BedrockTestState | null> =>
            ipcRenderer.invoke("test:get-state"),
          reset: (): Promise<BedrockTestState | null> =>
            ipcRenderer.invoke("test:reset-state"),
        }
      : undefined,
});
