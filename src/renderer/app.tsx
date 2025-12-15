import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { createRoot } from "react-dom/client";
import CodeMirrorEditor from "./components/CodeMirrorEditor";
import { Chrome } from "./components/Chrome";
import SettingsModal from "./components/SettingsModal";
import { RenderMode } from "../shared/types";
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
import {
  defaultKeymap,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { EditorView, KeyBinding } from "@codemirror/view";
import { markdownKeymap } from "@codemirror/lang-markdown";
import {
  createMarkdownLinkCommand,
  wrapSelectionKeyBinding,
} from "./editor/codemirror/commands";

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

const toCmKey = (binding: string): string => {
  const parts = binding.split("+").filter(Boolean);
  const mapped = parts.map((part) => {
    const lower = part.toLowerCase();
    if (lower === "mod") return "Mod";
    if (lower === "cmd") return "Mod";
    if (lower === "ctrl") return "Ctrl";
    if (lower === "shift") return "Shift";
    if (lower === "alt" || lower === "option") return "Alt";
    // Key names in stored bindings are normalized to lowercase (see eventToBinding).
    // CodeMirror keymap strings prefer:
    // - lowercase for printable single chars: "Mod-b"
    // - canonical casing for special keys: "ArrowLeft", "Enter", etc.
    if (lower === "arrowleft") return "ArrowLeft";
    if (lower === "arrowright") return "ArrowRight";
    if (lower === "arrowup") return "ArrowUp";
    if (lower === "arrowdown") return "ArrowDown";
    if (lower === "escape" || lower === "esc") return "Escape";
    if (lower === "enter" || lower === "return") return "Enter";
    if (lower === "backspace") return "Backspace";
    if (lower === "delete" || lower === "del") return "Delete";
    if (lower === "tab") return "Tab";
    if (lower === "space" || lower === " ") return "Space";
    if (lower === "home") return "Home";
    if (lower === "end") return "End";
    if (lower === "pageup") return "PageUp";
    if (lower === "pagedown") return "PageDown";
    return part.length === 1 ? lower : part;
  });
  return mapped.join("-");
};

const App = () => {
  const [doc, setDoc] = useState<string>("");
  const [renderMode] = useState<RenderMode>("hybrid");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const suppressDirtyRef = useRef(false);
  const editorViewRef = useRef<EditorView | null>(null);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    const handleDevToolsShortcut = (event: KeyboardEvent) => {
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
      focusEditor();
      return;
    }

    const result = await window.electronAPI.openFile();
    if (!result) {
      focusEditor();
      return;
    }

    suppressDirtyRef.current = true;
    setDoc(result.content);
    setFilePath(result.filePath);
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

  const keyBindings = useMemo<KeyBinding[]>(() => {
    const appBindings: KeyBinding[] = [
      {
        key: toCmKey(settings.keyBindings.open),
        preventDefault: true,
        run: () => {
          handleOpen();
          return true;
        },
      },
      {
        key: toCmKey(settings.keyBindings.save),
        preventDefault: true,
        run: () => {
          handleSave();
          return true;
        },
      },
      {
        key: toCmKey(settings.keyBindings.openSettings),
        preventDefault: true,
        run: () => {
          handleOpenSettings();
          return true;
        },
      },
    ];

    const snippetBindings: KeyBinding[] = [
      wrapSelectionKeyBinding(toCmKey(settings.keyBindings.bold), {
        before: "**",
        after: "**",
        emptySnippet: "****",
        emptyCursorOffset: 2,
      }),
      wrapSelectionKeyBinding(toCmKey(settings.keyBindings.italic), {
        before: "*",
        after: "*",
        emptySnippet: "**",
        emptyCursorOffset: 1,
      }),
      wrapSelectionKeyBinding(toCmKey(settings.keyBindings.strikethrough), {
        before: "~~",
        after: "~~",
        emptySnippet: "~~~~",
        emptyCursorOffset: 2,
      }),
      {
        key: "Mod-k",
        preventDefault: true,
        run: createMarkdownLinkCommand,
      },
      wrapSelectionKeyBinding("Mod-`", {
        before: "`",
        after: "`",
        emptySnippet: "``",
        emptyCursorOffset: 1,
      }),
    ];

    return [
      ...snippetBindings,
      ...appBindings,
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
      ...markdownKeymap,
    ];
  }, [handleOpen, handleOpenSettings, handleSave, settings.keyBindings]);

  return (
    <>
      <Chrome
        title={displayLabel}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onOpenSettings={handleOpenSettings}
      >
        <CodeMirrorEditor
          value={doc}
          renderMode={renderMode}
          theme={activeTheme}
          textSize={settings.textSize}
          keyBindings={keyBindings}
          formatKeyBindings={{
            bold: settings.keyBindings.bold,
            italic: settings.keyBindings.italic,
            strikethrough: settings.keyBindings.strikethrough,
          }}
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
