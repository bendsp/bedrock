import { contextBridge, ipcRenderer } from "electron";
import {
  BedrockRuntimeInfo,
  BedrockTestConfig,
  BedrockTestState,
  BedrockTestUpdaterEvent,
  ManualUpdateCheckResult,
  SaveFilePayload,
  DiscardPromptPayload,
  OpenFileResult,
  OpenSpecificFilePayload,
  SaveFileResult,
  UpdaterSnapshot,
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
  onCheckForUpdatesRequest: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on("app:check-for-updates", listener);
    return () => {
      ipcRenderer.removeListener("app:check-for-updates", listener);
    };
  },
  exportFile: (payload: ExportFilePayload): Promise<boolean> =>
    ipcRenderer.invoke("file:export", payload),
  readFile: (filePath: string): Promise<OpenFileResult | null> =>
    ipcRenderer.invoke("file:read", filePath),
  consumePendingExternalOpenFiles: (): Promise<OpenSpecificFilePayload[]> =>
    ipcRenderer.invoke("file:consume-pending-external-open"),
  onExternalOpenFile: (
    callback: (payload: OpenSpecificFilePayload) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: OpenSpecificFilePayload
    ) => callback(payload);
    ipcRenderer.on("file:open-external", listener);
    return () => {
      ipcRenderer.removeListener("file:open-external", listener);
    };
  },
  getUpdaterState: (): Promise<UpdaterSnapshot> =>
    ipcRenderer.invoke("updater:get-state"),
  checkForUpdates: (): Promise<ManualUpdateCheckResult> =>
    ipcRenderer.invoke("updater:check"),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke("updater:install"),
  onUpdaterState: (
    callback: (snapshot: UpdaterSnapshot) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      snapshot: UpdaterSnapshot
    ) => callback(snapshot);
    ipcRenderer.on("updater:state", listener);
    return () => {
      ipcRenderer.removeListener("updater:state", listener);
    };
  },
  notifyRendererReady: (): void => {
    ipcRenderer.send("app:renderer-ready");
  },
  test:
    process.env.BEDROCK_E2E === "1"
      ? {
          configure: (config: BedrockTestConfig): Promise<BedrockTestState | null> =>
            ipcRenderer.invoke("test:configure", config),
          getState: (): Promise<BedrockTestState | null> =>
            ipcRenderer.invoke("test:get-state"),
          reset: (): Promise<BedrockTestState | null> =>
            ipcRenderer.invoke("test:reset-state"),
          simulateExternalOpen: (filePath: string): Promise<boolean> =>
            ipcRenderer.invoke("test:simulate-external-open", filePath),
          getUpdaterState: (): Promise<UpdaterSnapshot | null> =>
            ipcRenderer.invoke("test:get-updater-state"),
          setUpdaterState: (
            snapshot: Partial<UpdaterSnapshot>
          ): Promise<UpdaterSnapshot | null> =>
            ipcRenderer.invoke("test:set-updater-state", snapshot),
          emitUpdaterEvent: (
            event: BedrockTestUpdaterEvent
          ): Promise<UpdaterSnapshot | null> =>
            ipcRenderer.invoke("test:emit-updater-event", event),
        }
      : undefined,
});
