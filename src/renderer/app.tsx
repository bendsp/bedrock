import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { createRoot } from "react-dom/client";
import Editor from "./components/editor";
import SettingsModal from "./components/SettingsModal";
import { Button } from "./components/ui/button";
import { EditorView, ModelEventType, ITextModel } from "../shared/types";
import { EditorController } from "./controllers/EditorController";
import { DocumentModel } from "./models/DocumentModel";
import { RopeModel } from "./models/RopeModel";
import { LinesModel } from "./models/LinesModel";
import {
  defaultSettings,
  defaultKeyBindings,
  loadSettings,
  saveSettings,
  UserSettings,
  clearSettingsStorage,
} from "./settings";
import {
  clampKeyBindings,
  eventToBinding,
  matchesBinding,
} from "./keybindings";
import { applyTheme, ThemeName } from "./theme";

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

const selectModel = (): ITextModel => {
  const choice =
    (typeof localStorage !== "undefined" &&
      localStorage.getItem("bedrock:model")) ||
    "rope";

  if (choice === "rope") {
    return new RopeModel("");
  }
  if (choice === "lines") {
    return new LinesModel("");
  }
  return new DocumentModel("");
};

const App = () => {
  const [controller, setController] = useState<EditorController | null>(null);
  const [model] = useState<ITextModel>(() => selectModel());
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const suppressDirtyRef = useRef(false);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  const editorRef = useCallback(
    (editorView: EditorView | null) => {
      if (editorView && !controller) {
        const newController = new EditorController(model, editorView);
        setController(newController);
      }
    },
    [controller, model]
  );

  useEffect(() => {
    const handleContentChange = () => {
      if (suppressDirtyRef.current) {
        suppressDirtyRef.current = false;
        return;
      }
      setIsDirty(true);
    };

    model.on(ModelEventType.CONTENT_CHANGED, handleContentChange);

    return () => {
      model.off(ModelEventType.CONTENT_CHANGED, handleContentChange);
    };
  }, [model]);

  useEffect(() => {
    window.electronAPI.notifyDirtyState(isDirty);
  }, [isDirty]);

  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
  }, []);

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

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--editor-font-size",
      `${settings.textSize}px`
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

  const handleOpen = useCallback(async () => {
    const proceed = await confirmDiscardIfNeeded("open");
    if (!proceed) {
      return;
    }

    const result = await window.electronAPI.openFile();
    if (!result) {
      return;
    }

    suppressDirtyRef.current = true;
    model.setAll(result.content);
    setFilePath(result.filePath);
    setIsDirty(false);
  }, [confirmDiscardIfNeeded, model]);

  const handleSave = useCallback(async () => {
    const content = model.getAll() ?? "";

    const result = await window.electronAPI.saveFile({
      filePath: filePath ?? undefined,
      content,
    });

    if (!result) {
      return;
    }

    setFilePath(result.filePath);
    setIsDirty(false);
  }, [filePath, model]);

  const handleSaveAs = useCallback(async () => {
    const content = model.getAll() ?? "";

    const result = await window.electronAPI.saveFile({
      content,
    });

    if (!result) {
      return;
    }

    setFilePath(result.filePath);
    setIsDirty(false);
  }, [model]);

  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

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

  useEffect(() => {
    if (isSettingsOpen) {
      return;
    }

    const handleGlobalShortcut = (event: KeyboardEvent) => {
      const binding = eventToBinding(event);
      if (!binding) {
        return;
      }

      if (matchesBinding(binding, settings.keyBindings.open)) {
        event.preventDefault();
        handleOpen();
        return;
      }

      if (matchesBinding(binding, settings.keyBindings.save)) {
        event.preventDefault();
        handleSave();
        return;
      }

      if (matchesBinding(binding, settings.keyBindings.openSettings)) {
        event.preventDefault();
        setIsSettingsOpen(true);
        return;
      }
    };

    window.addEventListener("keydown", handleGlobalShortcut);
    return () => window.removeEventListener("keydown", handleGlobalShortcut);
  }, [handleOpen, handleSave, isSettingsOpen, settings.keyBindings]);

  const displayLabel = formatFileName(fileName, isDirty);

  return (
    <div className="h-full w-full flex flex-col">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-[color:var(--header-border)] bg-[color:var(--header-bg)] text-[color:var(--header-text)]">
        <div className="flex gap-2">
          <Button size="sm" onClick={handleOpen}>
            Open…
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
          <Button size="sm" onClick={handleSaveAs}>
            Save As…
          </Button>
          <Button size="sm" onClick={handleOpenSettings}>
            Settings
          </Button>
        </div>
        <span className="ml-auto text-[13px]">{displayLabel}</span>
      </header>
      <div className="flex-1">
        <div className="app-shell">
          <Editor
            ref={editorRef}
            onKeyDown={controller?.handleKeyDown}
            model={model}
          />
        </div>
      </div>
      {isSettingsOpen ? (
        <SettingsModal
          settings={settings}
          onClose={handleCloseSettings}
          onChange={handleUpdateSettings}
          onResetBindings={handleResetBindings}
          onClearLocalStorage={handleClearLocalStorage}
        />
      ) : null}
    </div>
  );
};

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}
