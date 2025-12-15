import { contextBridge, ipcRenderer } from "electron";
import {
  SaveFilePayload,
  DiscardPromptPayload,
  OpenFileResult,
  SaveFileResult,
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
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke("shell:open-external", url),
});
