import { updateSmokeFeed, recordUpdateSmoke, runUpdateSmoke } from "./updateSmoke";
import { createUpdates } from "./electronUpdates";
import { UpdateController } from "./updateController";
import { promises as fs } from "node:fs";
import {
  isWithin,
  searchWorkspace,
  workspaceNote,
  parseImageBatch,
  importImages,
} from "./workspaceFiles";
import githubMarkdownCss from "github-markdown-css/github-markdown.css";
import {
  app,
  autoUpdater as nativeUpdater,
  clipboard,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  MenuItemConstructorOptions,
  shell,
} from "electron";
import windowStateKeeper from "electron-window-state";
import { WorkspaceStore } from "./workspace";
import {
  atomicWriteNote,
  atomicWriteFile,
  readTextFile,
  readImage,
  resolveNoteResource,
  revision,
} from "./noteFiles";
import * as path from "path";
import {
  BedrockTestConfig,
  BedrockTestState,
  DiscardAction,
  OpenFileResult,
  OpenSpecificFilePayload,
  SaveFileResult,
} from "../shared/types";
import {
  safeExportBaseName,
  validateExportFilePayload,
  validateSaveFilePayload,
} from "./ipcValidation";
import {
  buildRuntimeInfo,
  captureMainTelemetryException,
  captureMainTelemetryMessage,
  flushMainTelemetry,
  initializeMainTelemetry,
} from "./observability";

declare const BEDROCK_LOCAL_BUILD: boolean;
if (BEDROCK_LOCAL_BUILD) {
  app.setName("Bedrock Dev");
  app.setPath("userData", path.join(app.getPath("appData"), "Bedrock Dev"));
  process.env.BEDROCK_ENV = "development";
  delete process.env.SENTRY_DSN;
}

const ensureExtension = (filePath: string, extension: string): string => {
  return filePath.toLowerCase().endsWith(`.${extension}`)
    ? filePath
    : `${filePath}.${extension}`;
};

const windowDirtyState = new Map<number, boolean>();
const runtimeInfo = initializeMainTelemetry();
const isE2EMode = runtimeInfo.e2eMode;
const pendingExternalOpenFiles: OpenSpecificFilePayload[] = [];
let mainWindow: BrowserWindow | null = null;
let rendererReady = false;
let openedDocument: string | null = null;
const openedRevisions = new Map<string, string>();
const approvedOpenPaths = new Set<string>();
const trustedSender = (
  event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
) =>
  !!mainWindow &&
  !mainWindow.isDestroyed() &&
  event.sender === mainWindow.webContents &&
  event.senderFrame === mainWindow.webContents.mainFrame &&
  event.senderFrame.url === new URL(MAIN_WINDOW_WEBPACK_ENTRY).href;
const handle: typeof ipcMain.handle = (channel, listener) =>
  ipcMain.handle(channel, (event, ...args) => {
    if (!trustedSender(event)) throw new Error("Untrusted IPC sender.");
    if (channel.startsWith("test:") && !isE2EMode)
      throw new Error("Test API is disabled.");
    return listener(event, ...args);
  });

let updates: Promise<UpdateController>;
let updateInstalling = false;
let updateMayQuit = false;
let installTimeout: ReturnType<typeof setTimeout> | null = null;
let rejectInstall: ((error: Error) => void) | null = null;
nativeUpdater.on("before-quit-for-update", () => {
  updateMayQuit = true;
  if (installTimeout) clearTimeout(installTimeout);
});
handle("updates:status", async () => (await updates).getStatus());
handle("updates:channel", async (_event, channel: unknown) => (await updates).selectChannel(channel));
handle("updates:check", async () => (await updates).check());
handle("updates:download", async () => (await updates).download());
handle("updates:cancel", async () => (await updates).cancel());
handle("updates:install", async () => {
  const controller = await updates;
  if (rejectInstall) throw new Error("An update is already being installed.");
  return new Promise<void>((_resolve, reject) => {
    rejectInstall = reject;
    try {
      updateMayQuit = process.platform === "win32";
      controller.install([...windowDirtyState.values()].some(Boolean));
      if (controller.getStatus().phase === "installing") {
        installTimeout = setTimeout(() => controller.failed(new Error("Installation did not finish.")), 180000);
        installTimeout.unref();
      }
    } catch (error) { rejectInstall = null; reject(error); }
  });
});

const testState: BedrockTestState = {
  nextImagePath: null,
  lastRevealedImagePath: null,
  workspaceDelayMs: 0,
  nextRootPath: null,
  nextOpenPath: null,
  nextSavePath: null,
  discardResponse: null,
  lastDiscardPrompt: null,
};

const applyTestConfig = (
  config: BedrockTestConfig = {},
): BedrockTestState | null => {
  if (!isE2EMode) {
    return null;
  }

  if ("nextOpenPath" in config) {
    testState.nextOpenPath = config.nextOpenPath ?? null;
  }
  if ("nextImagePath" in config) testState.nextImagePath = config.nextImagePath ?? null;
  if ("nextRootPath" in config)
    testState.nextRootPath = config.nextRootPath ?? null;
  if (
    typeof config.workspaceDelayMs === "number" &&
    Number.isFinite(config.workspaceDelayMs)
  )
    testState.workspaceDelayMs = Math.max(
      0,
      Math.min(2000, config.workspaceDelayMs),
    );
  if ("nextSavePath" in config) {
    testState.nextSavePath = config.nextSavePath ?? null;
  }
  if ("discardResponse" in config) {
    testState.discardResponse = config.discardResponse ?? null;
  }

  return { ...testState };
};

const resetTestState = (): BedrockTestState | null => {
  if (!isE2EMode) {
    return null;
  }

  testState.nextOpenPath = null;
  testState.nextImagePath = null;
  testState.lastRevealedImagePath = null;
  testState.nextRootPath = null;
  testState.workspaceDelayMs = 0;
  testState.nextSavePath = null;
  testState.discardResponse = null;
  testState.lastDiscardPrompt = null;
  return { ...testState };
};

const resolveNextOpenPath = (): string | null => {
  if (!isE2EMode || !testState.nextOpenPath) {
    return null;
  }

  const filePath = path.resolve(testState.nextOpenPath);
  testState.nextOpenPath = null;
  return filePath;
};

const resolveNextSavePath = (): string | null => {
  if (!isE2EMode || !testState.nextSavePath) {
    return null;
  }

  const filePath = path.resolve(testState.nextSavePath);
  testState.nextSavePath = null;
  return filePath;
};

const getDiscardDescription = (action: DiscardAction): string => {
  if (action === "open") {
    return "open a different file";
  }
  if (action === "new") {
    return "create a new file";
  }
  if (action === "home") return "go to Home";
  return "close this window";
};

const normalizeTextFilePath = (filePath: unknown): string | null => {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    return null;
  }
  const resolvedPath = path.resolve(filePath);
  return resolvedPath;
};

const readEditorFile = async (
  filePath: string,
): Promise<OpenFileResult | null> => {
  const normalizedPath = normalizeTextFilePath(filePath);
  if (!normalizedPath) {
    return null;
  }

  const content = await readTextFile(normalizedPath);
  openedDocument = normalizedPath;
  openedRevisions.clear();
  openedRevisions.set(normalizedPath, revision(content));
  return { filePath: normalizedPath, content };
};

const normalizeExternalOpenPath = (
  filePath: unknown,
): OpenSpecificFilePayload | null => {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    return null;
  }

  const resolvedPath = normalizeTextFilePath(filePath);
  return resolvedPath ? { filePath: resolvedPath } : null;
};

const deliverExternalOpenFile = (payload: OpenSpecificFilePayload): boolean => {
  if (!mainWindow || mainWindow.isDestroyed() || !rendererReady) {
    return false;
  }

  mainWindow.webContents.send("file:open-external", payload);
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
  return true;
};

const handleExternalOpenPath = (
  filePath: unknown,
  fragment?: string,
): boolean => {
  const payload = normalizeExternalOpenPath(filePath);
  if (!payload) {
    return false;
  }
  if (fragment) payload.fragment = fragment;

  approvedOpenPaths.add(payload.filePath);
  if (!deliverExternalOpenFile(payload)) {
    pendingExternalOpenFiles.push(payload);

    if (app.isReady() && (!mainWindow || mainWindow.isDestroyed())) {
      createWindow();
    }
  }

  return true;
};

const confirmDiscardChanges = async (
  browserWindow: BrowserWindow | null,
  action: DiscardAction,
  fileName?: string,
): Promise<boolean> => {
  if (isE2EMode) {
    testState.lastDiscardPrompt = { action, fileName };
    return testState.discardResponse ?? false;
  }

  const description = getDiscardDescription(action);
  const displayName = fileName ? `"${fileName}"` : "this document";

  const { response } = await dialog.showMessageBox(browserWindow ?? undefined, {
    type: "question",
    buttons: ["Cancel", "Discard Changes"],
    defaultId: 1,
    cancelId: 0,
    title: "Unsaved changes",
    message: `You have unsaved changes in ${displayName}.`,
    detail: `Do you want to discard them before you ${description}?`,
  });

  return response === 1;
};

handle("file:open", async (): Promise<OpenFileResult | null> => {
  try {
    const nextOpenPath = resolveNextOpenPath();
    if (nextOpenPath) {
      const result = await readEditorFile(nextOpenPath);
      if (result) await rememberFile(result.filePath);
      return result;
    }

    const { canceled, filePaths } = await dialog.showOpenDialog({
      defaultPath: await workspace().defaultDirectory(),
      filters: [{ name: "All files", extensions: ["*"] }],
      properties: ["openFile"],
    });

    if (canceled || filePaths.length === 0) {
      return null;
    }

    const filePath = filePaths[0];
    const result = await readEditorFile(filePath);
    if (result) await rememberFile(result.filePath);
    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unknown error occurred.";
    captureMainTelemetryException(error, { operation: "file:open" });
    throw new Error(message);
  }
});

handle(
  "file:read",
  async (_event, filePath: string): Promise<OpenFileResult | null> => {
    try {
      const normalizedPath = normalizeTextFilePath(filePath);
      if (!normalizedPath) throw new Error("Choose a text file.");
      const recent = (await workspace().getInfo()).recentFiles;
      if (
        normalizedPath !== openedDocument &&
        !approvedOpenPaths.has(normalizedPath) &&
        !recent.some((file) => file.filePath === normalizedPath)
      )
        throw new Error("Open this file using the Open dialog first.");
      const result = await readEditorFile(normalizedPath);
      approvedOpenPaths.delete(normalizedPath);
      if (!result) {
        console.error(
          `Rejected attempt to read file: ${filePath}`,
        );
        return null;
      }
      if (result) await rememberFile(result.filePath);
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unknown error occurred.";
      captureMainTelemetryException(error, {
        operation: "file:read",
        filePath,
      });
      console.error(`Unable to read file "${filePath}": ${message}`);
      throw new Error(message);
    }
  },
);

handle("file:consume-pending-external-open", () => {
  return pendingExternalOpenFiles.splice(0);
});

handle(
  "file:save",
  async (event, args: unknown): Promise<SaveFileResult | null> => {
    let telemetryFilePath: string | undefined;
    try {
      const validation = validateSaveFilePayload(args);
      if (validation.ok === false) {
        throw new Error(validation.message);
      }
      const payload = validation.payload;
      telemetryFilePath = payload.filePath;

      let targetPath = payload.filePath
        ? path.resolve(payload.filePath)
        : payload.filePath;

      if (!targetPath) {
        const nextSavePath = resolveNextSavePath();
        if (nextSavePath) {
          targetPath = nextSavePath;
        } else {
          const { canceled, filePath } = await dialog.showSaveDialog(
            BrowserWindow.fromWebContents(event.sender) ?? undefined,
            {
              filters: [{ name: "All files", extensions: ["*"] }],
              defaultPath: path.join(
                await workspace().defaultDirectory(),
                openedDocument ? path.basename(openedDocument) : "Untitled.md",
              ),
            },
          );

          if (canceled || !filePath) {
            return null;
          }

          targetPath = filePath;
        }
      }

      if (
        payload.filePath &&
        (targetPath !== openedDocument || !openedRevisions.has(targetPath))
      )
        throw new Error(
          "This file is not the active document. Use Save As to choose a destination.",
        );
      let expectedRevision: string | null | undefined = payload.filePath
        ? openedRevisions.get(targetPath)
        : null;
      if (!payload.filePath) {
        try {
          const sameDocument = openedDocument &&
            (await fs.realpath(targetPath)) === (await fs.realpath(openedDocument));
          expectedRevision = sameDocument && openedDocument
            ? openedRevisions.get(openedDocument)
            : revision(await readTextFile(targetPath));
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
            throw error;
        }
      }
      await atomicWriteNote(
        targetPath,
        payload.content,
        expectedRevision,
      );
      openedDocument = targetPath;
      openedRevisions.clear();
      openedRevisions.set(targetPath, revision(payload.content));
      await rememberFile(targetPath);
      return { filePath: targetPath };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unknown error occurred.";
      captureMainTelemetryException(error, {
        operation: "file:save",
        filePath: telemetryFilePath,
      });
      throw new Error(message);
    }
  },
);

handle(
  "dialog:confirm-discard",
  async (
    event,
    args: { action: DiscardAction; fileName?: string },
  ): Promise<boolean> => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      return confirmDiscardChanges(browserWindow, args.action, args.fileName);
    } catch {
      return false;
    }
  },
);

ipcMain.on("file:dirty-state-changed", (event, isDirty: boolean) => {
  if (trustedSender(event) && typeof isDirty === "boolean")
    windowDirtyState.set(event.sender.id, isDirty);
});

ipcMain.on("devtools:open", (event) => {
  if (!trustedSender(event)) return;
  const window = BrowserWindow.fromWebContents(event.sender);
  window?.webContents.openDevTools({ mode: "detach" });
});

ipcMain.on("app:renderer-ready", (event) => {
  if (trustedSender(event)) {
    rendererReady = true;
  }
});

handle("app:get-version", (): string => {
  return app.getVersion();
});

handle("app:get-runtime-info", () => {
  return buildRuntimeInfo();
});

handle("shell:open-external", async (_event, rawUrl: string) => {
  if (typeof rawUrl !== "string") {
    return;
  }
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:" &&
      url.protocol !== "mailto:"
    ) {
      return;
    }
    await shell.openExternal(url.toString());
  } catch {
    // ignore invalid URLs
  }
});

handle("test:configure", (_event, config: BedrockTestConfig) => {
  return applyTestConfig(config);
});

handle("test:get-state", () => {
  return isE2EMode ? { ...testState } : null;
});

handle("test:reset-state", () => {
  return resetTestState();
});

handle("test:simulate-external-open", (_event, filePath: string) => {
  return handleExternalOpenPath(filePath);
});

handle("file:export", async (event, args: unknown): Promise<boolean> => {
  let telemetryFormat: string | undefined;
  try {
    const validation = validateExportFilePayload(args);
    if (validation.ok === false) {
      throw new Error(validation.message);
    }
    const payload = validation.payload;
    const { content, format, defaultFileName } = payload;
    telemetryFormat = format;

    const extension = format === "html" ? "html" : "pdf";
    const filters =
      format === "html"
        ? [{ name: "HTML Files", extensions: ["html"] }]
        : [{ name: "PDF Files", extensions: ["pdf"] }];

    const baseName = safeExportBaseName(defaultFileName);

    const { canceled, filePath } = await dialog.showSaveDialog(
      BrowserWindow.fromWebContents(event.sender) ?? undefined,
      {
        filters,
        defaultPath: `${baseName}.${extension}`,
      },
    );

    if (canceled || !filePath) {
      return false;
    }
    const targetPath = ensureExtension(filePath, extension);

    const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
          <style>
            body {
              box-sizing: border-box;
              min-width: 200px;
              max-width: 980px;
              margin: 0 auto;
              padding: 45px;
            }
            @media (max-width: 767px) {
              body {
                padding: 15px;
              }
            }
            ${githubMarkdownCss}
          </style>
        </head>
        <body class="markdown-body">
          ${content}
        </body>
        </html>
      `;

    if (format === "html") {
      await atomicWriteFile(targetPath, fullHtml);
      return true;
    } else {
      // PDF Export
      const win = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          javascript: false,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event) => event.preventDefault());
      win.webContents.on("will-frame-navigate", (event) =>
        event.preventDefault(),
      );
      win.webContents.on("will-redirect", (event) => event.preventDefault());
      try {
        await win.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`,
        );
        const data = await win.webContents.printToPDF({
          printBackground: true,
          margins: {
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
          },
        });
        await atomicWriteFile(targetPath, data);
      } finally {
        win.destroy();
      }
      return true;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unknown error occurred.";
    captureMainTelemetryException(error, {
      operation: "file:export",
      format: telemetryFormat,
    });
    throw new Error(message);
  }
});

// This allows TypeScript to pick up the magic constants that's auto-generated by Forge's Webpack
// plugin that tells the Electron app where to look for the Webpack-bundled app code (depending on
// whether you're running in development or production).
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

if (process.env.BEDROCK_USER_DATA_DIR) {
  app.setPath("userData", path.resolve(process.env.BEDROCK_USER_DATA_DIR));
}

let workspaceStore: WorkspaceStore | null = null;
const workspace = (): WorkspaceStore => {
  if (!workspaceStore) {
    workspaceStore = new WorkspaceStore(
      app.getPath("userData"),
      isE2EMode
        ? path.join(app.getPath("userData"), "Documents", "Bedrock")
        : path.join(app.getPath("documents"), "Bedrock"),
    );
  }
  return workspaceStore;
};

// A history-write failure must never report a successful note save as failed.
const rememberFile = async (filePath: string): Promise<void> => {
  try {
    await workspace().rememberFile(filePath);
  } catch (error) {
    console.error("Unable to update recent files:", error);
  }
};

handle("workspace:get", async () => {
  if (isE2EMode && testState.workspaceDelayMs) {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, testState.workspaceDelayMs),
    );
  }
  return workspace().getInfo();
});
let workspaceSearchSequence = 0;
handle("workspace:search", async (_event, query: unknown) => {
  if (typeof query !== "string" || query.length > 200)
    throw new Error("Search is limited to 200 characters.");
  const sequence = ++workspaceSearchSequence;
  const info = await workspace().getInfo();
  if (!info.rootPath) throw new Error("Choose your Bedrock folder first.");
  return searchWorkspace(
    info.rootPath,
    query,
    info.recentFiles.map((file) => file.filePath),
    () => sequence !== workspaceSearchSequence,
  );
});
handle("workspace:open-note", async (_event, relativePath: unknown) => {
  const target = await workspaceNote(
    await workspace().defaultDirectory(),
    relativePath,
  );
  const note = await readEditorFile(target);
  if (!note) throw new Error("Unable to open this note.");
  await rememberFile(note.filePath);
  return note;
});
async function storeImages(documentPath: unknown, images: unknown) {
  if (
    typeof documentPath !== "string" ||
    documentPath !== openedDocument ||
    !openedRevisions.has(documentPath)
  )
    throw new Error("Open a note before adding images.");
  const batch = parseImageBatch(images);
  const root = await workspace().defaultDirectory();
  if (documentPath !== openedDocument)
    throw new Error("The active note changed. Paste the image again.");
  return importImages(root, documentPath, batch);
}
handle("workspace:import-images", async (_event, raw: unknown) => {
  if (
    !raw ||
    typeof raw !== "object" ||
    !("documentPath" in raw) ||
    !("images" in raw)
  )
    throw new Error("Invalid image request.");
  return storeImages(raw.documentPath, raw.images);
});
handle("workspace:paste-image", async (_event, documentPath: unknown) => {
  const image = clipboard.readImage();
  if (image.isEmpty()) throw new Error("There is no image on the clipboard.");
  return storeImages(documentPath, [
    { name: "Pasted image.png", bytes: image.toPNG() },
  ]);
});
handle("workspace:create-note", async () => {
  const note = await workspace().createNote();
  openedDocument = note.filePath;
  openedRevisions.clear();
  openedRevisions.set(note.filePath, revision(note.content));
  return note;
});
handle("workspace:select-root", async (_event, choice: unknown) => {
  if (choice !== "default" && choice !== "choose")
    throw new Error("Invalid folder selection.");
  if (choice === "default")
    return workspace().selectRoot(workspace().suggestedRootPath);
  let selectedPath: string | null = null;
  if (isE2EMode && testState.nextRootPath) {
    selectedPath = testState.nextRootPath;
    testState.nextRootPath = null;
  } else {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Choose your Bedrock root folder",
      defaultPath: workspace().suggestedRootPath,
      properties: ["openDirectory", "createDirectory"],
    });
    if (!canceled) selectedPath = filePaths[0] ?? null;
  }
  return selectedPath ? workspace().selectRoot(selectedPath) : null;
});

process.on("unhandledRejection", (reason) => {
  captureMainTelemetryException(reason, { event: "unhandledRejection" });
});

process.on("uncaughtException", (error) => {
  captureMainTelemetryException(error, { event: "uncaughtException" });
  void flushMainTelemetry().finally(() => {
    app.exit(1);
  });
});

const installApplicationMenu = () => {
  const isMac = process.platform === "darwin";

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          { role: "appMenu" },
          { role: "fileMenu" },
          {
            label: "Edit",
            submenu: [
              { role: "undo" },
              { role: "redo" },
              { type: "separator" },
              { role: "cut" },
              { role: "copy" },
              { role: "paste" },
              { role: "pasteAndMatchStyle" },
              { role: "delete" },
              { role: "selectAll" },
              { type: "separator" },
              {
                label: "Find",
                click: (menuItem, browserWindow) => {
                  (browserWindow as BrowserWindow)?.webContents.send(
                    "editor:find",
                  );
                },
              },
            ],
          },
          {
            label: "View",
            submenu: [
              { role: "resetZoom" },
              { role: "zoomIn" },
              { role: "zoomOut" },
              { role: "togglefullscreen" },
            ],
          },
          { role: "windowMenu" },
        ] as MenuItemConstructorOptions[])
      : ([
          { role: "fileMenu" },
          {
            label: "Edit",
            submenu: [
              { role: "undo" },
              { role: "redo" },
              { type: "separator" },
              { role: "cut" },
              { role: "copy" },
              { role: "paste" },
              { role: "pasteAndMatchStyle" },
              { role: "delete" },
              { type: "separator" },
              { role: "selectAll" },
              { type: "separator" },
              {
                label: "Find",
                click: (menuItem, browserWindow) => {
                  (browserWindow as BrowserWindow)?.webContents.send(
                    "editor:find",
                  );
                },
              },
            ],
          },
          {
            label: "View",
            submenu: [
              { role: "resetZoom" },
              { role: "zoomIn" },
              { role: "zoomOut" },
              { role: "togglefullscreen" },
            ],
          },
          { role: "windowMenu" },
        ] as MenuItemConstructorOptions[])),
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const createWindow = (): void => {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 800,
    defaultHeight: 600,
  });

  // Create the browser window.
  const window = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 14 },
        }
      : {}),
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow = window;
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-frame-navigate", (event) =>
    event.preventDefault(),
  );
  window.webContents.on("before-input-event", (event, input) => {
    if ((input.control || input.meta) && input.key.toLowerCase() === "r")
      event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  window.webContents.session.setPermissionCheckHandler(() => false);
  rendererReady = false;

  // Let us register listeners on the window, so we can update the state
  // automatically (the listeners will be removed when the window is closed)
  // and restore the maximized state of the window
  mainWindowState.manage(window);

  if (process.platform !== "darwin") {
    // Keep shortcuts active but hide the menu bar.
    window.setMenuBarVisibility(false);
  }

  const webContentsId = window.webContents.id;

  // and load the index.html of the app.
  void window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();

  windowDirtyState.set(webContentsId, false);

  window.webContents.on("render-process-gone", (_event, details) => {
    if (mainWindow === window) {
      rendererReady = false;
    }
    captureMainTelemetryMessage("Renderer process terminated", {
      reason: details.reason,
      exitCode: details.exitCode,
      webContentsId,
    });
  });

  window.webContents.on("unresponsive", () => {
    captureMainTelemetryMessage("Renderer process unresponsive", {
      webContentsId,
    });
  });

  let forceClose = false;

  window.on("close", async (event) => {
    if (updateInstalling && !updateMayQuit) { event.preventDefault(); return; }
    if (forceClose) {
      return;
    }

    const isDirty = windowDirtyState.get(webContentsId);

    if (!isDirty) {
      return;
    }

    event.preventDefault();

    const confirmed = await confirmDiscardChanges(window, "close");

    if (confirmed) {
      windowDirtyState.set(webContentsId, false);
      forceClose = true;
      window.close();
    }
  });

  window.on("closed", () => {
    windowDirtyState.delete(webContentsId);
    if (mainWindow === window) {
      mainWindow = null;
      rendererReady = false;
    }
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", () => {
  const updateScenario = isE2EMode && process.env.BEDROCK_E2E_UPDATES ? JSON.parse(process.env.BEDROCK_E2E_UPDATES) : undefined;
  const smokeFeed = updateSmokeFeed();
  const disabled = !updateScenario && !smokeFeed && (isE2EMode || BEDROCK_LOCAL_BUILD || !app.isPackaged)
    ? "In-app updates are available in installed release builds."
    : !["darwin", "win32"].includes(process.platform) ? "In-app updates are available on macOS and Windows." : null;
  updates = createUpdates(status => {
    recordUpdateSmoke(status);
    updateInstalling = status.phase === "installing";
    if (["error", "disabled"].includes(status.phase) && rejectInstall) {
      rejectInstall(new Error(status.message ?? "Unable to install update."));
      rejectInstall = null;
      updateMayQuit = false;
      if (installTimeout) clearTimeout(installTimeout);
    }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("updates:status", status);
  }, disabled, updateScenario);
  const backgroundCheck = async () => {
    const controller = await updates;
    if (!["idle", "current", "error"].includes(controller.getStatus().phase)) return;
    await controller.check();
    const status = controller.getStatus();
    if (status.phase === "available" && !status.target?.downgrade) await controller.download();
  };
  if (!disabled && !isE2EMode) {
    setTimeout(() => void backgroundCheck().catch((): undefined => undefined), 30000).unref();
    setInterval(() => void backgroundCheck().catch((): undefined => undefined), 30 * 60 * 1000).unref();
  }
  if (smokeFeed) {
    void updates.then(runUpdateSmoke).catch(error => { console.error(error); app.exit(1); });
    return;
  }
  installApplicationMenu();
  createWindow();

  if (isE2EMode) {
    try {
      const seededPaths = JSON.parse(
        process.env.BEDROCK_E2E_INITIAL_EXTERNAL_OPEN_PATHS ?? "[]",
      ) as unknown;
      if (Array.isArray(seededPaths)) {
        seededPaths.forEach((filePath) => {
          handleExternalOpenPath(filePath);
        });
      }
    } catch (error) {
      captureMainTelemetryException(error, {
        operation: "parse-initial-external-open-paths",
      });
    }
  }
});

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  handleExternalOpenPath(filePath);
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("child-process-gone", (_event, details) => {
  captureMainTelemetryMessage("Child process terminated", {
    type: details.type,
    reason: details.reason,
    exitCode: details.exitCode,
    serviceName: details.serviceName,
    name: details.name,
  });
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

async function localResource(raw: unknown) {
  if (!openedDocument || typeof raw !== "string")
    throw new Error("Open a note before resolving resources.");
  const root = await workspace().defaultDirectory();
  const documentPath = await fs.realpath(openedDocument);
  const canonicalRoot = await fs.realpath(root);
  const allowed = isWithin(canonicalRoot, documentPath)
    ? canonicalRoot
    : path.dirname(documentPath);
  return resolveNoteResource(documentPath, allowed, raw);
}
handle("file:resolve-image", async (_event, raw: unknown) => {
  try {
    return await readImage(await localResource(raw));
  } catch {
    return null;
  }
});
handle("file:reveal-image", async (_event, raw: unknown) => {
  const resolved = await localResource(raw);
  await readImage(resolved);
  if (isE2EMode) testState.lastRevealedImagePath = resolved;
  else shell.showItemInFolder(resolved);
});
handle("file:choose-image", async (event) => {
  const documentPath = openedDocument;
  if (!documentPath) throw new Error("Open a note before replacing an image.");
  let selected: string | null;
  if (isE2EMode) {
    selected = testState.nextImagePath ?? null;
    testState.nextImagePath = null;
  } else {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender) ?? undefined, {
      title: "Replace image",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
      properties: ["openFile"],
    });
    selected = result.canceled ? null : result.filePaths[0];
  }
  if (!selected) return null;
  const data = await readImage(selected);
  if (documentPath !== openedDocument) throw new Error("The active note changed. Replace the image again.");
  const note = await fs.realpath(documentPath);
  const root = await fs.realpath(await workspace().defaultDirectory());
  const [image] = await importImages(isWithin(root, note) ? root : path.dirname(note), note,
    [{ name: path.basename(selected), bytes: Buffer.from(data.slice(data.indexOf(",") + 1), "base64") }]);
  return image;
});
handle("file:open-note-link", async (_event, raw: unknown) => {
  const resolved = await localResource(raw);
  const hash = typeof raw === "string" ? raw.indexOf("#") : -1;
  return handleExternalOpenPath(
    resolved,
    typeof raw === "string" && hash >= 0 ? raw.slice(hash) : undefined,
  );
});
