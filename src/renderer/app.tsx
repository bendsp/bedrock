import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { createRoot } from "react-dom/client";
import { CodeMirrorEditor } from "./components/CodeMirrorEditor";
import { Chrome } from "./components/Chrome";
import SettingsModal from "./components/SettingsModal";
import { Button } from "./components/ui/button";
import {
  ManualUpdateCheckResult,
  OpenSpecificFilePayload,
  RenderMode,
  UpdaterSnapshot,
} from "../shared/types";
import { markdownToHtml } from "./lib/export";
import {
  defaultSettings,
  defaultKeyBindings,
  loadSettings,
  saveSettings,
  UserSettings,
  clearSettingsStorage,
} from "./settings";
import { clampKeyBindings, eventToBinding } from "./keybindings";
import { applyTheme, ThemeName } from "./theme";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { EditorView, KeyBinding } from "@codemirror/view";
import { markdownKeymap } from "@codemirror/lang-markdown";
import {
  createCommandRegistry,
  createCommandRunner,
} from "./commands/commandSystem";

const DEFAULT_FILE_NAME = "Untitled.md";

const getDisplayFileName = (filePath: string | null): string => {
  if (!filePath) {
    return DEFAULT_FILE_NAME;
  }
  const segments = filePath.split(/[/\\]/);
  const lastSegment = segments[segments.length - 1];
  return lastSegment || DEFAULT_FILE_NAME;
};

const formatFileName = (fileName: string, isDirty: boolean): string => {
  return `${isDirty ? "*" : ""}${fileName}`;
};

const buildWindowTitle = (fileName: string, isDirty: boolean): string => {
  return `${formatFileName(fileName, isDirty)} — Bedrock`;
};

const defaultUpdaterSnapshot = (): UpdaterSnapshot => ({
  status: "idle",
  availableVersion: null,
  downloadedVersion: null,
  releaseNotes: null,
  errorMessage: null,
  source: null,
});

type AppNotice = {
  tone: "info" | "error";
  message: string;
} | null;

const App = () => {
  const [doc, setDoc] = useState<string>("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isInitializing, setIsInitializing] = useState(true);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updaterState, setUpdaterState] = useState<UpdaterSnapshot>(
    defaultUpdaterSnapshot
  );
  const [updateNotice, setUpdateNotice] = useState<AppNotice>(null);
  const [dismissedReadyVersion, setDismissedReadyVersion] = useState<
    string | null
  >(null);
  const suppressDirtyRef = useRef(false);
  const editorViewRef = useRef<EditorView | null>(null);
  const externalOpenSequenceRef = useRef(Promise.resolve());
  const commandRegistry = useMemo(() => createCommandRegistry(), []);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    const handleDevToolsShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === "F12") {
        event.preventDefault();
        window.electronAPI.openDevTools();
      }
    };

    window.addEventListener("keydown", handleDevToolsShortcut);
    return () => window.removeEventListener("keydown", handleDevToolsShortcut);
  }, []);

  const handleDocChange = useCallback((next: string) => {
    setDoc(next);
    if (suppressDirtyRef.current) {
      suppressDirtyRef.current = false;
      return;
    }
    setIsDirty(true);
  }, []);

  const focusEditor = useCallback(() => {
    editorViewRef.current?.focus();
  }, []);

  useEffect(() => {
    window.electronAPI.notifyDirtyState(isDirty);
  }, [isDirty]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };
    media.addEventListener("change", handler);
    setSystemPrefersDark(media.matches);
    return () => media.removeEventListener("change", handler);
  }, []);

  const activeTheme: ThemeName = settings.followSystem
    ? systemPrefersDark
      ? settings.systemDarkTheme
      : settings.systemLightTheme
    : settings.theme;
  const renderMode: RenderMode = settings.renderMode;

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--editor-font-size",
      `${settings.textSize}px`
    );
    document.documentElement.style.setProperty(
      "--ui-font-size",
      `${(settings.uiScale / 100) * 15}px`
    );
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    applyTheme(activeTheme);
  }, [activeTheme]);

  const fileName = useMemo(() => getDisplayFileName(filePath), [filePath]);

  useEffect(() => {
    document.title = buildWindowTitle(fileName, isDirty);
  }, [fileName, isDirty]);

  useEffect(() => {
    if (isInitializing) {
      return;
    }

    if (filePath) {
      setSettings((prev) => {
        if (prev.lastOpenedFilePath === filePath) {
          return prev;
        }
        return {
          ...prev,
          lastOpenedFilePath: filePath,
        };
      });
    }
  }, [filePath, isInitializing]);

  const confirmDiscardIfNeeded = useCallback(
    async (action: "open" | "new"): Promise<boolean> => {
      if (!isDirty) {
        return true;
      }

      return window.electronAPI.confirmDiscardChanges({
        action,
        fileName,
      });
    },
    [fileName, isDirty]
  );

  const replaceDocument = useCallback(
    (nextDoc: string, nextFilePath: string | null) => {
      suppressDirtyRef.current = true;
      setDoc(nextDoc);
      setFilePath(nextFilePath);
      setIsDirty(false);
      focusEditor();
    },
    [focusEditor]
  );

  const handleExternalOpen = useCallback(
    async ({ filePath: nextFilePath }: OpenSpecificFilePayload) => {
      const proceed = await confirmDiscardIfNeeded("open");
      if (!proceed) {
        focusEditor();
        return;
      }

      const result = await window.electronAPI.readFile(nextFilePath);
      if (!result) {
        focusEditor();
        return;
      }

      replaceDocument(result.content, result.filePath);
    },
    [confirmDiscardIfNeeded, focusEditor, replaceDocument]
  );

  const enqueueExternalOpen = useCallback(
    (payload: OpenSpecificFilePayload) => {
      externalOpenSequenceRef.current = externalOpenSequenceRef.current
        .then(async () => {
          await handleExternalOpen(payload);
        })
        .catch((error) => {
          console.error("Failed to handle external open:", error);
        });
    },
    [handleExternalOpen]
  );

  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);

    const initialize = async () => {
      try {
        const pendingExternalOpenFiles =
          await window.electronAPI.consumePendingExternalOpenFiles();

        if (pendingExternalOpenFiles.length > 0) {
          for (const payload of pendingExternalOpenFiles) {
            const result = await window.electronAPI.readFile(payload.filePath);
            if (result) {
              replaceDocument(result.content, result.filePath);
            }
          }
        } else if (loaded.openLastFileOnStartup && loaded.lastOpenedFilePath) {
          try {
            const result = await window.electronAPI.readFile(
              loaded.lastOpenedFilePath
            );
            if (result) {
              replaceDocument(result.content, result.filePath);
            }
          } catch (error) {
            console.error("Failed to open last file on startup:", error);
          }
        }
      } catch (error) {
        console.error("Failed during app initialization:", error);
      } finally {
        setIsInitializing(false);
      }
    };

    void initialize();
  }, [replaceDocument]);

  const handleOpen = useCallback(async () => {
    const proceed = await confirmDiscardIfNeeded("open");
    if (!proceed) {
      focusEditor();
      return;
    }

    const result = await window.electronAPI.openFile();
    if (!result) {
      focusEditor();
      return;
    }

    replaceDocument(result.content, result.filePath);
  }, [confirmDiscardIfNeeded, focusEditor, replaceDocument]);

  const handleNew = useCallback(async () => {
    const proceed = await confirmDiscardIfNeeded("new");
    if (!proceed) {
      focusEditor();
      return;
    }

    suppressDirtyRef.current = true;
    setDoc("");
    setFilePath(null);
    setIsDirty(false);
    focusEditor();
  }, [confirmDiscardIfNeeded, focusEditor]);

  const handleSave = useCallback(async () => {
    const content = doc ?? "";

    const result = await window.electronAPI.saveFile({
      filePath: filePath ?? undefined,
      content,
    });

    if (!result) {
      focusEditor();
      return;
    }

    setFilePath(result.filePath);
    setIsDirty(false);
    focusEditor();
  }, [doc, filePath, focusEditor]);

  const handleSaveAs = useCallback(async () => {
    const content = doc ?? "";

    const result = await window.electronAPI.saveFile({
      content,
    });

    if (!result) {
      focusEditor();
      return;
    }

    setFilePath(result.filePath);
    setIsDirty(false);
    focusEditor();
  }, [doc, focusEditor]);

  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false);
    focusEditor();
  }, [focusEditor]);

  const handleUpdateSettings = useCallback((updated: UserSettings) => {
    setSettings({
      ...updated,
      keyBindings: clampKeyBindings(updated.keyBindings),
    });
  }, []);

  const handleResetBindings = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      keyBindings: defaultKeyBindings,
    }));
  }, []);

  const handleClearLocalStorage = useCallback(() => {
    clearSettingsStorage();
    setSettings(defaultSettings);
  }, []);

  const showUpdateNotice = useCallback(
    (result: Pick<ManualUpdateCheckResult, "message">, tone: "info" | "error") => {
      if (!result.message) {
        return;
      }
      setUpdateNotice({
        tone,
        message: result.message,
      });
    },
    []
  );

  const handleCheckForUpdates = useCallback(async () => {
    const result = await window.electronAPI.checkForUpdates();
    if (result.kind === "error") {
      showUpdateNotice(result, "error");
      return;
    }

    if (
      result.kind === "not-available" ||
      result.kind === "already-in-progress" ||
      result.kind === "already-ready" ||
      result.kind === "unsupported" ||
      result.kind === "started"
    ) {
      showUpdateNotice(result, "info");
    }
  }, [showUpdateNotice]);

  const handleInstallUpdate = useCallback(async () => {
    const installed = await window.electronAPI.installUpdate();
    if (!installed) {
      setUpdateNotice({
        tone: "error",
        message: "No downloaded update is ready to install.",
      });
    }
  }, []);

  const commands = useMemo(() => {
    return createCommandRunner(commandRegistry, {
      getEditorView: () => editorViewRef.current,
      newFile: handleNew,
      openFile: handleOpen,
      saveFile: handleSave,
      saveFileAs: handleSaveAs,
      openSettings: handleOpenSettings,
      checkForUpdates: handleCheckForUpdates,
      setTheme: (theme) => {
        setSettings((prev) => ({
          ...prev,
          followSystem: false,
          theme,
        }));
      },
      exportFile: async (format) => {
        const content = markdownToHtml(doc);
        const defaultFileName = fileName.endsWith(".md")
          ? fileName.slice(0, -3)
          : fileName;
        await window.electronAPI.exportFile({
          content,
          format,
          defaultFileName,
        });
      },
    });
  }, [
    commandRegistry,
    doc,
    handleCheckForUpdates,
    handleOpen,
    handleOpenSettings,
    handleSave,
    handleSaveAs,
    setSettings,
  ]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onExternalOpenFile((payload) => {
      enqueueExternalOpen(payload);
    });
    window.electronAPI.notifyRendererReady();
    return unsubscribe;
  }, [enqueueExternalOpen]);

  useEffect(() => {
    const flushQueuedExternalOpens = async () => {
      const pendingExternalOpenFiles =
        await window.electronAPI.consumePendingExternalOpenFiles();
      pendingExternalOpenFiles.forEach((payload) => {
        enqueueExternalOpen(payload);
      });
    };

    void flushQueuedExternalOpens();
  }, [enqueueExternalOpen]);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      .getAppVersion()
      .then((version) => {
        if (!cancelled) {
          setAppVersion(version);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAppVersion("Unknown");
        }
      });

    window.electronAPI
      .getUpdaterState()
      .then((snapshot) => {
        if (!cancelled) {
          setUpdaterState(snapshot);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUpdaterState(defaultUpdaterSnapshot());
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onUpdaterState((snapshot) => {
      setUpdaterState(snapshot);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onFind(() => {
      void commands.run("editor.find");
    });
    return unsubscribe;
  }, [commands]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onCheckForUpdatesRequest(() => {
      void commands.run("app.checkForUpdates");
    });
    return unsubscribe;
  }, [commands]);

  useEffect(() => {
    if (isSettingsOpen) {
      return;
    }

    const handleGlobalShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const binding = eventToBinding(event);
      if (!binding) {
        return;
      }

      const id = commands.findByBinding(binding, settings);
      if (!id) return;

      const cmd = commandRegistry.get(id);
      if (!cmd.isGlobal) {
        return;
      }

      event.preventDefault();
      void commands.run(id);
    };

    window.addEventListener("keydown", handleGlobalShortcut);
    return () => window.removeEventListener("keydown", handleGlobalShortcut);
  }, [commands, isSettingsOpen, settings]);

  useEffect(() => {
    if (!updateNotice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setUpdateNotice(null);
    }, 4000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [updateNotice]);

  const displayLabel = formatFileName(fileName, isDirty);
  const showReadyBanner =
    updaterState.status === "ready" &&
    updaterState.downloadedVersion !== dismissedReadyVersion;

  const keyBindings = useMemo<KeyBinding[]>(() => {
    return [
      ...commands.buildCodeMirrorKeymap(settings),
      indentWithTab,
      ...defaultKeymap,
      ...markdownKeymap,
    ];
  }, [commands, settings]);

  return (
    <>
      <Chrome
        title={displayLabel}
        onNew={() => void commands.run("file.new")}
        onOpen={() => void commands.run("file.open")}
        onSave={() => void commands.run("file.save")}
        onSaveAs={() => void commands.run("file.saveAs")}
        onSearch={() => void commands.run("editor.find")}
        onExportHtml={() => void commands.run("file.exportHtml")}
        onExportPdf={() => void commands.run("file.exportPdf")}
        onOpenSettings={() => void commands.run("app.openSettings")}
        topBanner={
          showReadyBanner ? (
            <div className="flex items-center justify-between gap-4 bg-secondary/60 px-4 py-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">
                  Update ready to install
                </div>
                <div className="text-muted-foreground">
                  Bedrock{" "}
                  <span className="font-medium text-foreground">
                    {updaterState.downloadedVersion ?? "update"}
                  </span>{" "}
                  has been downloaded and is ready to install.
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setDismissedReadyVersion(updaterState.downloadedVersion)
                  }
                >
                  Later
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    void handleInstallUpdate();
                  }}
                >
                  Restart to Update
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        <CodeMirrorEditor
          value={doc}
          renderMode={renderMode}
          theme={activeTheme}
          textSize={settings.textSize}
          settings={settings}
          commandRegistry={commandRegistry}
          commands={commands}
          keyBindings={keyBindings}
          placeholder="Start typing…"
          onChange={handleDocChange}
          onReady={(view) => {
            editorViewRef.current = view;
            view.focus();
          }}
          className="cm-editor-shell"
        />
      </Chrome>

      {isSettingsOpen ? (
        <SettingsModal
          settings={settings}
          appVersion={appVersion}
          updaterState={updaterState}
          updateMessage={updateNotice?.message ?? null}
          onClose={handleCloseSettings}
          onChange={handleUpdateSettings}
          onResetBindings={handleResetBindings}
          onClearLocalStorage={handleClearLocalStorage}
          onCheckForUpdates={handleCheckForUpdates}
          onInstallUpdate={handleInstallUpdate}
        />
      ) : null}

      {updateNotice ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[1100] max-w-sm rounded-lg border border-border bg-card/95 px-4 py-3 shadow-2xl backdrop-blur">
          <div
            className={`text-sm ${
              updateNotice.tone === "error"
                ? "text-destructive"
                : "text-foreground"
            }`}
          >
            {updateNotice.message}
          </div>
        </div>
      ) : null}
    </>
  );
};

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}
