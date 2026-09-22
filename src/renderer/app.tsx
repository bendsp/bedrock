import { normalizeDocumentText } from "./editor/codemirror/documentText";
import { revealHeading } from "./editor/codemirror/links";
import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { createRoot } from "react-dom/client";
import { CodeMirrorEditor } from "./components/CodeMirrorEditor";
import { QuickOpen } from "./components/QuickOpen";
import {
  focusMarkdownEditor,
  activeTableCell,
  tableCellOwners,
} from "./editor/codemirror/tableCellContext";
import { CommandPalette } from "./components/CommandPalette";
import { navigateTable } from "./editor/codemirror/tables";
import { Chrome } from "./components/Chrome";
import { Home } from "./components/Home";
import SettingsModal from "./components/SettingsModal";
import {
  OpenSpecificFilePayload,
  RenderMode,
  SelectionStats,
  WorkspaceInfo,
} from "../shared/types";
import { markdownToExportHtml } from "./lib/export";
import { getDocumentStats } from "./lib/documentStats";
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
import { setEditingLocked } from "./editor/codemirror/editingLock";
import { markdownKeymap } from "@codemirror/lang-markdown";
import {
  CommandRunContext,
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

const editorFontFamilyValues: Record<UserSettings["editorFontFamily"], string> =
  {
    sans: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: '"Fira Code", "Source Code Pro", Monaco, Consolas, monospace',
  };

const App = () => {
  const [doc, setDoc] = useState<string>("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [savedDoc, setSavedDoc] = useState("");
  const isDirty = doc !== savedDoc;
  const [screen, setScreen] = useState<
    { kind: "home" } | { kind: "editor"; session: number }
  >({ kind: "home" });
  const nextSession = useRef(0);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const pendingEditorFocus = useRef(false);
  const pendingHeading = useRef<string | null>(null);
  const activeOperation = useRef(Promise.resolve());
  const currentDocument = useRef({ doc, screen });
  currentDocument.current = { doc, screen };
  const [isQuickOpen, setIsQuickOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectionStats, setSelectionStats] = useState<SelectionStats>({
    hasSelection: false,
    words: 0,
    chars: 0,
  });
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [isInitializing, setIsInitializing] = useState(true);
  const editorViewRef = useRef<EditorView | null>(null);
  const externalOpenSequenceRef = useRef(Promise.resolve());
  const commandRegistry = useMemo(() => createCommandRegistry(), []);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
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

  useEffect(() => {
    const showError = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string")
        setWorkspaceError(event.detail);
    };
    window.addEventListener("bedrock:error", showError);
    return () => window.removeEventListener("bedrock:error", showError);
  }, []);

  const handleDocChange = useCallback((next: string) => {
    setDoc(next);
  }, []);

  const perform = useCallback((operation: () => Promise<void>) => {
    if (busyRef.current) return activeOperation.current;
    pendingEditorFocus.current =
      editorViewRef.current?.dom.contains(document.activeElement) ?? false;
    busyRef.current = true;
    setEditingLocked(editorViewRef.current, true);
    setBusy(true);
    setWorkspaceError(null);
    const completion = (async () => {
      try {
        await operation();
      } catch (error) {
        setWorkspaceError(
          error instanceof Error
            ? error.message
            : "Unable to access your files.",
        );
      } finally {
        busyRef.current = false;
        setEditingLocked(editorViewRef.current, false);
        setBusy(false);
        if (pendingEditorFocus.current && editorViewRef.current) {
          pendingEditorFocus.current = false;
          focusMarkdownEditor(editorViewRef.current);
        }
      }
    })();
    activeOperation.current = completion;
    return completion;
  }, []);

  const refreshWorkspace = useCallback(async () => {
    setWorkspace(await window.electronAPI.getWorkspace());
  }, []);

  const focusEditor = useCallback(() => {
    if (busyRef.current) {
      pendingEditorFocus.current = true;
      return;
    }
    if (editorViewRef.current) focusMarkdownEditor(editorViewRef.current);
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
      `${settings.textSize}px`,
    );
    document.documentElement.style.setProperty(
      "--editor-font-family",
      editorFontFamilyValues[settings.editorFontFamily],
    );
    document.documentElement.style.setProperty(
      "--ui-font-size",
      `${(settings.uiScale / 100) * 15}px`,
    );
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    applyTheme(activeTheme);
  }, [activeTheme]);

  const fileName = useMemo(() => getDisplayFileName(filePath), [filePath]);

  useEffect(() => {
    document.title =
      screen.kind === "home"
        ? "Home — Bedrock"
        : buildWindowTitle(fileName, isDirty);
  }, [fileName, isDirty, screen]);

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
    async (action: "open" | "new" | "home"): Promise<boolean> => {
      if (!isDirty) {
        return true;
      }

      return window.electronAPI.confirmDiscardChanges({
        action,
        fileName,
      });
    },
    [fileName, isDirty],
  );

  const replaceDocument = useCallback(
    (nextDoc: string, nextFilePath: string | null, fragment?: string) => {
      pendingHeading.current = fragment ?? null;
      const normalized = normalizeDocumentText(nextDoc);
      setDoc(normalized);
      setSavedDoc(normalized);
      setFilePath(nextFilePath);
      setScreen({ kind: "editor", session: ++nextSession.current });
    },
    [focusEditor],
  );

  const handleExternalOpen = useCallback(
    async ({ filePath: nextFilePath, fragment }: OpenSpecificFilePayload) => {
      const proceed = await confirmDiscardIfNeeded("open");
      if (!proceed) {
        focusEditor();
        return;
      }

      const result = await window.electronAPI.readFile(nextFilePath);
      if (!result) {
        throw new Error(
          `Unable to open ${getDisplayFileName(nextFilePath)}. It may have been moved or deleted.`,
        );
      }

      replaceDocument(result.content, result.filePath, fragment);
      await refreshWorkspace();
    },
    [confirmDiscardIfNeeded, focusEditor, replaceDocument, refreshWorkspace],
  );

  const externalOpenHandler = useRef(handleExternalOpen);
  externalOpenHandler.current = handleExternalOpen;
  const enqueueExternalOpen = useCallback(
    (payload: OpenSpecificFilePayload) => {
      externalOpenSequenceRef.current = externalOpenSequenceRef.current
        .then(async () => {
          // Wait for navigation/saves and a render before reading the current
          // document's discard handler. Finder opens must not bypass the lock.
          await activeOperation.current;
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          if (busyRef.current) await activeOperation.current;
          await perform(() => externalOpenHandler.current(payload));
        })
        .catch((error) => {
          console.error("Failed to handle external open:", error);
        });
    },
    [perform],
  );

  useEffect(() => {
    void perform(refreshWorkspace).finally(() => setIsInitializing(false));
  }, [perform, refreshWorkspace]);

  const handleHome = useCallback(async () => {
    await perform(async () => {
      if (!(await confirmDiscardIfNeeded("home"))) return;
      await refreshWorkspace();
      setScreen({ kind: "home" });
      setDoc("");
      setSavedDoc("");
      setFilePath(null);
      editorViewRef.current = null;
    });
  }, [perform, confirmDiscardIfNeeded, refreshWorkspace]);

  const handleSelectRoot = useCallback(
    async (choice: "default" | "choose") => {
      await perform(async () => {
        if (!(await confirmDiscardIfNeeded("home"))) return;
        const result = await window.electronAPI.selectRootFolder(choice);
        if (!result) return;
        setWorkspace(result);
        setScreen({ kind: "home" });
        setDoc("");
        setSavedDoc("");
        setFilePath(null);
        editorViewRef.current = null;
      });
    },
    [perform, confirmDiscardIfNeeded],
  );

  const handleOpen = useCallback(async () => {
    if (!workspace?.rootPath) return;
    await perform(async () => {
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
      await refreshWorkspace();
    });
  }, [
    workspace,
    perform,
    confirmDiscardIfNeeded,
    focusEditor,
    replaceDocument,
    refreshWorkspace,
  ]);

  const handleNew = useCallback(async () => {
    if (!workspace?.rootPath) return;
    await perform(async () => {
      const proceed = await confirmDiscardIfNeeded("new");
      if (!proceed) {
        focusEditor();
        return;
      }

      const result = await window.electronAPI.createNote();
      replaceDocument(result.content, result.filePath);
      await refreshWorkspace();
    });
  }, [
    workspace,
    perform,
    confirmDiscardIfNeeded,
    focusEditor,
    replaceDocument,
    refreshWorkspace,
  ]);

  const handleSave = useCallback(async () => {
    if (screen.kind !== "editor") return;
    await perform(async () => {
      const content = doc ?? "";

      const result = await window.electronAPI.saveFile({
        filePath: filePath ?? undefined,
        content,
      });

      if (!result) {
        focusEditor();
        return;
      }

      if (
        currentDocument.current.screen.kind !== "editor" ||
        currentDocument.current.screen.session !== screen.session
      )
        return;
      setFilePath(result.filePath);
      setSavedDoc(content);
      await refreshWorkspace();
      focusEditor();
    });
  }, [doc, filePath, focusEditor, screen, perform, refreshWorkspace]);

  const handleSaveAs = useCallback(async () => {
    if (screen.kind !== "editor") return;
    await perform(async () => {
      const content = doc ?? "";

      const result = await window.electronAPI.saveFile({
        content,
      });

      if (!result) {
        focusEditor();
        return;
      }

      if (
        currentDocument.current.screen.kind !== "editor" ||
        currentDocument.current.screen.session !== screen.session
      )
        return;
      setFilePath(result.filePath);
      setSavedDoc(content);
      await refreshWorkspace();
      focusEditor();
    });
  }, [doc, focusEditor, screen, perform, refreshWorkspace]);

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

  const handleQuickOpen = useCallback(
    async (relativePath: string) => {
      await perform(async () => {
        if (!(await confirmDiscardIfNeeded("open"))) return;
        const result = await window.electronAPI.openWorkspaceNote(relativePath);
        replaceDocument(result.content, result.filePath);
        await refreshWorkspace();
      });
    },
    [perform, confirmDiscardIfNeeded, replaceDocument, refreshWorkspace],
  );

  const handleAttachImages: CommandRunContext["attachImages"] = async (
    requestedView,
    source,
  ) => {
    if (!filePath || busyRef.current) return;
    const outer = tableCellOwners.get(requestedView) ?? requestedView;
    const target = activeTableCell(outer) ?? requestedView;
    if (source.kind === "choose") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/gif,image/webp";
      input.multiple = true;
      input.addEventListener(
        "change",
        () => {
          if (input.files?.length && outer === editorViewRef.current)
            void handleAttachImages(target, {
              kind: "files",
              files: Array.from(input.files),
            });
        },
        { once: true },
      );
      input.click();
      return;
    }
    const selection = target.state.selection.main;
    await perform(async () => {
      if (
        source.kind === "files" &&
        (source.files.length < 1 ||
          source.files.length > 10 ||
          source.files.reduce((sum, file) => sum + file.size, 0) >
            25 * 1024 * 1024)
      )
        throw new Error("Add up to 10 images, totaling at most 25 MB.");
      const images =
        source.kind === "clipboard"
          ? await window.electronAPI.pasteImage(filePath)
          : await window.electronAPI.importImages({
              documentPath: filePath,
              images: await Promise.all(
                source.files.map(async (file) => {
                  if (file.size > 10 * 1024 * 1024)
                    throw new Error("Images must be at most 10 MB each.");
                  return {
                    name: file.name,
                    bytes: new Uint8Array(await file.arrayBuffer()),
                  };
                }),
              ),
            });
      if (outer !== editorViewRef.current || !target.dom.isConnected) return;
      const markdown = images
        .map(
          (image) =>
            `![${image.alt.replace(/[\\[\]\r\n]/g, " ")}](<${image.relativePath
              .split("/")
              .map((part) => encodeURIComponent(part))
              .join("/")}>)`,
        )
        .join(target === outer ? "\n\n" : " ");
      const insert =
        target === outer
          ? `${selection.from && !target.state.doc.sliceString(Math.max(0, selection.from - 2), selection.from).endsWith("\n\n") ? "\n\n" : ""}${markdown}\n\n`
          : markdown;
      // File IO holds the document lock. Release it synchronously for this one edit.
      setEditingLocked(outer, false);
      target.dispatch({
        changes: { from: selection.from, to: selection.to, insert },
        selection: { anchor: selection.from + insert.length },
        userEvent: "input.paste",
        scrollIntoView: true,
      });
    });
  };

  const commandContext: CommandRunContext = {
    getEditorView: () => (busyRef.current ? null : editorViewRef.current),
    newFile: handleNew,
    openFile: handleOpen,
    saveFile: handleSave,
    saveFileAs: handleSaveAs,
    openSettings: handleOpenSettings,
    openCommandPalette: () => setIsPaletteOpen(true),
    quickOpen: () => {
      if (workspace?.rootPath && !busyRef.current) setIsQuickOpen(true);
    },
    attachImages: handleAttachImages,
    setTheme: (theme) => {
      setSettings((prev) => ({
        ...prev,
        followSystem: false,
        theme,
      }));
    },
    exportFile: async (format) => {
      if (screen.kind !== "editor") return;
      await perform(async () => {
        const content = await markdownToExportHtml(doc);
        const defaultFileName = fileName.endsWith(".md")
          ? fileName.slice(0, -3)
          : fileName;
        await window.electronAPI.exportFile({
          content,
          format,
          defaultFileName,
        });
      });
    },
  };
  const commandContextRef = useRef(commandContext);
  commandContextRef.current = commandContext;
  const commands = useMemo(
    () =>
      createCommandRunner(commandRegistry, {
        getEditorView: () => commandContextRef.current.getEditorView(),
        newFile: () => commandContextRef.current.newFile(),
        openFile: () => commandContextRef.current.openFile(),
        saveFile: () => commandContextRef.current.saveFile(),
        saveFileAs: () => commandContextRef.current.saveFileAs(),
        openSettings: () => commandContextRef.current.openSettings(),
        quickOpen: () => commandContextRef.current.quickOpen(),
        attachImages: (view, source) =>
          commandContextRef.current.attachImages(view, source),
        openCommandPalette: () =>
          commandContextRef.current.openCommandPalette(),
        setTheme: (theme) => commandContextRef.current.setTheme(theme),
        exportFile: (format) => commandContextRef.current.exportFile(format),
      }),
    [commandRegistry],
  );

  useEffect(() => {
    if (!workspace?.rootPath || isInitializing) return;
    const unsubscribe = window.electronAPI.onExternalOpenFile((payload) => {
      enqueueExternalOpen(payload);
    });
    window.electronAPI.notifyRendererReady();
    return unsubscribe;
  }, [enqueueExternalOpen, workspace?.rootPath, isInitializing]);

  useEffect(() => {
    if (!workspace?.rootPath || isInitializing) return;
    const flushQueuedExternalOpens = async () => {
      const pendingExternalOpenFiles =
        await window.electronAPI.consumePendingExternalOpenFiles();
      pendingExternalOpenFiles.forEach((payload) => {
        enqueueExternalOpen(payload);
      });
    };

    void flushQueuedExternalOpens();
  }, [enqueueExternalOpen, workspace?.rootPath, isInitializing]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onFind(() => {
      void commands.run("editor.find");
    });
    return unsubscribe;
  }, [commands]);

  useEffect(() => {
    if (isSettingsOpen || isPaletteOpen || isQuickOpen) {
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

    window.addEventListener("keydown", handleGlobalShortcut, true);
    return () =>
      window.removeEventListener("keydown", handleGlobalShortcut, true);
  }, [commands, isSettingsOpen, isPaletteOpen, isQuickOpen, settings]);

  const displayLabel = formatFileName(fileName, isDirty);
  const documentStats = useMemo(() => getDocumentStats(doc), [doc]);

  const keyBindings = useMemo<KeyBinding[]>(() => {
    return [
      ...commands.buildCodeMirrorKeymap(settings),
      { key: "Tab", run: navigateTable(1) },
      { key: "Shift-Tab", run: navigateTable(-1) },
      indentWithTab,
      ...markdownKeymap,
      ...defaultKeymap,
    ];
  }, [commands, settings]);

  return (
    <>
      <Chrome
        title={screen.kind === "home" ? "Home" : displayLabel}
        isHome={screen.kind === "home"}
        busy={busy || isInitializing || !workspace?.rootPath}
        onHome={() => void handleHome()}
        onNew={() => void commands.run("file.new")}
        onOpen={() => void commands.run("file.open")}
        onSave={() => void commands.run("file.save")}
        onSaveAs={() => void commands.run("file.saveAs")}
        onSearch={() => void commands.run("editor.find")}
        onExportHtml={() => void commands.run("file.exportHtml")}
        onExportPdf={() => void commands.run("file.exportPdf")}
        onOpenSettings={() => void commands.run("app.openSettings")}
        stats={documentStats}
        selectionStats={selectionStats}
      >
        {workspace?.warning && (
          <p role="status" className="mb-4 text-sm text-muted-foreground">
            {workspace.warning}
          </p>
        )}
        {workspaceError ? (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {workspaceError}
          </p>
        ) : null}
        {screen.kind === "home" ? (
          <Home
            workspace={workspace}
            busy={busy || isInitializing}
            onSelectRoot={(choice) => void handleSelectRoot(choice)}
            onQuickOpen={() => void commands.run("file.quickOpen")}
            onOpenRecent={(recentPath) =>
              void perform(() => handleExternalOpen({ filePath: recentPath }))
            }
          />
        ) : (
          <CodeMirrorEditor
            key={screen.session}
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
            onSelectionStatsChange={setSelectionStats}
            onReady={(view) => {
              editorViewRef.current = view;
              setEditingLocked(view, busyRef.current);
              if (pendingHeading.current) {
                revealHeading(view, pendingHeading.current);
                pendingHeading.current = null;
              }
              focusEditor();
            }}
            className="cm-editor-shell"
          />
        )}
      </Chrome>

      {isQuickOpen && (
        <QuickOpen
          onClose={() => setIsQuickOpen(false)}
          restoreFocus={focusEditor}
          onOpen={(path) => void handleQuickOpen(path)}
        />
      )}
      {isPaletteOpen && (
        <CommandPalette
          registry={commandRegistry}
          commands={commands}
          settings={settings}
          hasEditor={screen.kind === "editor" && !busy}
          restoreFocus={focusEditor}
          onClose={() => setIsPaletteOpen(false)}
        />
      )}
      {isSettingsOpen ? (
        <SettingsModal
          workspace={workspace}
          workspaceBusy={busy}
          workspaceError={workspaceError}
          onSelectRoot={() => void handleSelectRoot("choose")}
          settings={settings}
          onClose={handleCloseSettings}
          onChange={handleUpdateSettings}
          onResetBindings={handleResetBindings}
          onClearLocalStorage={handleClearLocalStorage}
        />
      ) : null}
    </>
  );
};

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}
