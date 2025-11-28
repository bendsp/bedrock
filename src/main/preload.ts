import { contextBridge, ipcRenderer } from "electron";

type SaveFilePayload = {
  filePath?: string;
  content: string;
};

type DiscardPromptPayload = {
  action: "open" | "close" | "new";
  fileName?: string;
};

contextBridge.exposeInMainWorld("electronAPI", {
  openFile: (): Promise<{ filePath: string; content: string } | null> =>
    ipcRenderer.invoke("file:open"),
  saveFile: (
    payload: SaveFilePayload
  ): Promise<{ filePath: string } | null> =>
    ipcRenderer.invoke("file:save", payload),
  confirmDiscardChanges: (payload: DiscardPromptPayload): Promise<boolean> =>
    ipcRenderer.invoke("dialog:confirm-discard", payload),
  notifyDirtyState: (isDirty: boolean): void =>
    ipcRenderer.send("file:dirty-state-changed", isDirty),
});
