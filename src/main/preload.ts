import { contextBridge, ipcRenderer } from "electron";
import {
  ImageImportRequest,
  ImportedImage,
  WorkspaceSearchResult,
  BedrockRuntimeInfo,
  BedrockTestConfig,
  BedrockTestState,
  SaveFilePayload,
  DiscardPromptPayload,
  OpenFileResult,
  OpenSpecificFilePayload,
  SaveFileResult,
  ExportFilePayload,
  WorkspaceInfo,
} from "../shared/types";

contextBridge.exposeInMainWorld("electronAPI", {
  searchWorkspace: (query: string): Promise<WorkspaceSearchResult> =>
    ipcRenderer.invoke("workspace:search", query),
  openWorkspaceNote: (relativePath: string): Promise<OpenFileResult> =>
    ipcRenderer.invoke("workspace:open-note", relativePath),
  importImages: (request: ImageImportRequest): Promise<ImportedImage[]> =>
    ipcRenderer.invoke("workspace:import-images", request),
  pasteImage: (documentPath: string): Promise<ImportedImage[]> =>
    ipcRenderer.invoke("workspace:paste-image", documentPath),
  resolveImage: (path: string): Promise<string | null> =>
    ipcRenderer.invoke("file:resolve-image", path),
  openNoteLink: (path: string): Promise<boolean> =>
    ipcRenderer.invoke("file:open-note-link", path),
  getWorkspace: (): Promise<WorkspaceInfo> =>
    ipcRenderer.invoke("workspace:get"),
  selectRootFolder: (
    choice: "default" | "choose",
  ): Promise<WorkspaceInfo | null> =>
    ipcRenderer.invoke("workspace:select-root", choice),
  createNote: (): Promise<OpenFileResult> =>
    ipcRenderer.invoke("workspace:create-note"),
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
  consumePendingExternalOpenFiles: (): Promise<OpenSpecificFilePayload[]> =>
    ipcRenderer.invoke("file:consume-pending-external-open"),
  onExternalOpenFile: (
    callback: (payload: OpenSpecificFilePayload) => void,
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: OpenSpecificFilePayload,
    ) => callback(payload);
    ipcRenderer.on("file:open-external", listener);
    return () => {
      ipcRenderer.removeListener("file:open-external", listener);
    };
  },
  notifyRendererReady: (): void => {
    ipcRenderer.send("app:renderer-ready");
  },
  test:
    process.env.BEDROCK_E2E === "1"
      ? {
          configure: (
            config: BedrockTestConfig,
          ): Promise<BedrockTestState | null> =>
            ipcRenderer.invoke("test:configure", config),
          getState: (): Promise<BedrockTestState | null> =>
            ipcRenderer.invoke("test:get-state"),
          reset: (): Promise<BedrockTestState | null> =>
            ipcRenderer.invoke("test:reset-state"),
          simulateExternalOpen: (filePath: string): Promise<boolean> =>
            ipcRenderer.invoke("test:simulate-external-open", filePath),
        }
      : undefined,
});
