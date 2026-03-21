import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  MenuItemConstructorOptions,
  shell,
} from "electron";
import { promises as fs } from "fs";
import windowStateKeeper from "electron-window-state";
import * as path from "path";
import {
  BedrockTestConfig,
  BedrockTestState,
  DiscardAction,
  SaveFilePayload,
  OpenFileResult,
  SaveFileResult,
  ExportFilePayload,
} from "../shared/types";
import {
  buildRuntimeInfo,
  captureMainTelemetryException,
  captureMainTelemetryMessage,
  initializeMainTelemetry,
} from "./observability";

const MARKDOWN_DIALOG_FILTER = {
  name: "Markdown Files",
  extensions: ["md"],
};

const ensureMarkdownExtension = (filePath: string): string => {
  return filePath.toLowerCase().endsWith(".md") ? filePath : `${filePath}.md`;
};

const windowDirtyState = new Map<number, boolean>();
const runtimeInfo = initializeMainTelemetry();
const isE2EMode = runtimeInfo.e2eMode;

const testState: BedrockTestState = {
  nextOpenPath: null,
  nextSavePath: null,
  discardResponse: null,
  lastDiscardPrompt: null,
};

const applyTestConfig = (
  config: BedrockTestConfig = {}
): BedrockTestState | null => {
  if (!isE2EMode) {
    return null;
  }

  if ("nextOpenPath" in config) {
    testState.nextOpenPath = config.nextOpenPath ?? null;
  }
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

  const filePath = ensureMarkdownExtension(path.resolve(testState.nextSavePath));
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
  return "close this window";
};

const confirmDiscardChanges = async (
  browserWindow: BrowserWindow | null,
  action: DiscardAction,
  fileName?: string
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

ipcMain.handle("file:open", async (): Promise<OpenFileResult | null> => {
  try {
    const nextOpenPath = resolveNextOpenPath();
    if (nextOpenPath) {
      const content = await fs.readFile(nextOpenPath, "utf-8");
      return { filePath: nextOpenPath, content };
    }

    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [MARKDOWN_DIALOG_FILTER],
      properties: ["openFile"],
    });

    if (canceled || filePaths.length === 0) {
      return null;
    }

    const filePath = filePaths[0];
    const content = await fs.readFile(filePath, "utf-8");
    return { filePath, content };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unknown error occurred.";
    captureMainTelemetryException(error, { operation: "file:open" });
    dialog.showErrorBox("Unable to open file", message);
    return null;
  }
});

ipcMain.handle(
  "file:read",
  async (_event, filePath: string): Promise<OpenFileResult | null> => {
    try {
      // Basic security check: only allow reading .md files.
      if (!filePath.toLowerCase().endsWith(".md")) {
        console.error(
          `Rejected attempt to read non-markdown file: ${filePath}`
        );
        return null;
      }

      const content = await fs.readFile(filePath, "utf-8");
      return { filePath, content };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unknown error occurred.";
      captureMainTelemetryException(error, {
        operation: "file:read",
        filePath,
      });
      console.error(`Unable to read file "${filePath}": ${message}`);
      return null;
    }
  }
);

ipcMain.handle(
  "file:save",
  async (event, args: SaveFilePayload): Promise<SaveFileResult | null> => {
    try {
      let targetPath = args.filePath;

      if (!targetPath) {
        const nextSavePath = resolveNextSavePath();
        if (nextSavePath) {
          targetPath = nextSavePath;
        } else {
        const { canceled, filePath } = await dialog.showSaveDialog(
          BrowserWindow.fromWebContents(event.sender) ?? undefined,
          {
            filters: [MARKDOWN_DIALOG_FILTER],
            defaultPath: "Untitled.md",
          }
        );

        if (canceled || !filePath) {
          return null;
        }

        targetPath = ensureMarkdownExtension(filePath);
        }
      }

      await fs.writeFile(targetPath, args.content, "utf-8");
      return { filePath: targetPath };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unknown error occurred.";
      captureMainTelemetryException(error, {
        operation: "file:save",
        filePath: args.filePath,
      });
      dialog.showErrorBox("Unable to save file", message);
      return null;
    }
  }
);

ipcMain.handle(
  "dialog:confirm-discard",
  async (
    event,
    args: { action: DiscardAction; fileName?: string }
  ): Promise<boolean> => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      return confirmDiscardChanges(browserWindow, args.action, args.fileName);
    } catch {
      return false;
    }
  }
);

ipcMain.on("file:dirty-state-changed", (event, isDirty: boolean) => {
  windowDirtyState.set(event.sender.id, isDirty);
});

ipcMain.on("devtools:open", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  window?.webContents.openDevTools({ mode: "detach" });
});

ipcMain.handle("app:get-version", (): string => {
  return app.getVersion();
});

ipcMain.handle("app:get-runtime-info", () => {
  return buildRuntimeInfo();
});

ipcMain.handle("shell:open-external", async (_event, rawUrl: string) => {
  if (typeof rawUrl !== "string") {
    return;
  }
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return;
    }
    await shell.openExternal(url.toString());
  } catch {
    // ignore invalid URLs
  }
});

ipcMain.handle("test:configure", (_event, config: BedrockTestConfig) => {
  return applyTestConfig(config);
});

ipcMain.handle("test:get-state", () => {
  return isE2EMode ? { ...testState } : null;
});

ipcMain.handle("test:reset-state", () => {
  return resetTestState();
});

ipcMain.handle(
  "file:export",
  async (event, args: ExportFilePayload): Promise<boolean> => {
    try {
      const { content, format, defaultFileName } = args;
      const extension = format === "html" ? "html" : "pdf";
      const filters =
        format === "html"
          ? [{ name: "HTML Files", extensions: ["html"] }]
          : [{ name: "PDF Files", extensions: ["pdf"] }];

      const baseName = defaultFileName || "Exported";

      const { canceled, filePath } = await dialog.showSaveDialog(
        BrowserWindow.fromWebContents(event.sender) ?? undefined,
        {
          filters,
          defaultPath: `${baseName}.${extension}`,
        }
      );

      if (canceled || !filePath) {
        return false;
      }

      // Load GitHub Markdown CSS
      let css = "";
      try {
        const cssPath = path.join(
          app.getAppPath(),
          "node_modules/github-markdown-css/github-markdown.css"
        );
        css = await fs.readFile(cssPath, "utf-8");
      } catch (e) {
        console.error("Failed to load github-markdown-css", e);
      }

      const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
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
            ${css}
          </style>
        </head>
        <body class="markdown-body">
          ${content}
        </body>
        </html>
      `;

      if (format === "html") {
        await fs.writeFile(filePath, fullHtml, "utf-8");
        return true;
      } else {
        // PDF Export
        const win = new BrowserWindow({
          show: false,
          webPreferences: {
            nodeIntegration: false,
          },
        });

        await win.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`
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
        await fs.writeFile(filePath, data);
        win.destroy();
        return true;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unknown error occurred.";
      captureMainTelemetryException(error, {
        operation: "file:export",
        format: args.format,
      });
      dialog.showErrorBox("Unable to export file", message);
      return false;
    }
  }
);

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

process.on("unhandledRejection", (reason) => {
  captureMainTelemetryException(reason, { event: "unhandledRejection" });
});

process.on("uncaughtException", (error) => {
  captureMainTelemetryException(error, { event: "uncaughtException" });
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
                accelerator: "CmdOrCtrl+F",
                click: (menuItem, browserWindow) => {
                  (browserWindow as BrowserWindow)?.webContents.send(
                    "editor:find"
                  );
                },
              },
            ],
          },
          { role: "viewMenu" },
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
                accelerator: "CmdOrCtrl+F",
                click: (menuItem, browserWindow) => {
                  (browserWindow as BrowserWindow)?.webContents.send(
                    "editor:find"
                  );
                },
              },
            ],
          },
          { role: "viewMenu" },
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
  const mainWindow = new BrowserWindow({
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
    },
  });

  // Let us register listeners on the window, so we can update the state
  // automatically (the listeners will be removed when the window is closed)
  // and restore the maximized state of the window
  mainWindowState.manage(mainWindow);

  if (process.platform !== "darwin") {
    // Keep shortcuts active but hide the menu bar.
    mainWindow.setMenuBarVisibility(false);
  }

  const webContentsId = mainWindow.webContents.id;

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();

  windowDirtyState.set(webContentsId, false);

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    captureMainTelemetryMessage("Renderer process terminated", {
      reason: details.reason,
      exitCode: details.exitCode,
      webContentsId,
    });
  });

  mainWindow.webContents.on("unresponsive", () => {
    captureMainTelemetryMessage("Renderer process unresponsive", {
      webContentsId,
    });
  });

  let forceClose = false;

  mainWindow.on("close", async (event) => {
    if (forceClose) {
      return;
    }

    const isDirty = windowDirtyState.get(webContentsId);

    if (!isDirty) {
      return;
    }

    event.preventDefault();

    const confirmed = await confirmDiscardChanges(mainWindow, "close");

    if (confirmed) {
      windowDirtyState.set(webContentsId, false);
      forceClose = true;
      mainWindow.close();
    }
  });

  mainWindow.on("closed", () => {
    windowDirtyState.delete(webContentsId);
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", () => {
  installApplicationMenu();
  createWindow();
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
