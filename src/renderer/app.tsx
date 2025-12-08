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
import { EditorView, ModelEventType, ITextModel } from "../shared/types";
import { EditorController } from "./controllers/EditorController";
import { DocumentModel } from "./models/DocumentModel";
import { RopeModel } from "./models/RopeModel";
import { LinesModel } from "./models/LinesModel";

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

const toolbarButtonStyle: React.CSSProperties = {
  backgroundColor: "#3a3f4b",
  border: "1px solid #4b5263",
  borderRadius: "4px",
  color: "#eef1f6",
  cursor: "pointer",
  fontSize: "12px",
  padding: "4px 12px",
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
  const suppressDirtyRef = useRef(false);

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

  const displayLabel = formatFileName(fileName, isDirty);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 16px",
          backgroundColor: "#21252b",
          borderBottom: "1px solid #181a1f",
          gap: "12px",
          color: "#d7dae0",
        }}
      >
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" style={toolbarButtonStyle} onClick={handleOpen}>
            Open…
          </button>
          <button type="button" style={toolbarButtonStyle} onClick={handleSave}>
            Save
          </button>
          <button
            type="button"
            style={toolbarButtonStyle}
            onClick={handleSaveAs}
          >
            Save As…
          </button>
          <button
            type="button"
            style={toolbarButtonStyle}
            onClick={handleOpenSettings}
          >
            Settings
          </button>
        </div>
        <span style={{ marginLeft: "auto", fontSize: "13px" }}>
          {displayLabel}
        </span>
      </header>
      <div style={{ flex: 1 }}>
        <div className="app-shell">
          <Editor
            ref={editorRef}
            onKeyDown={controller?.handleKeyDown}
            model={model}
          />
        </div>
      </div>
      {isSettingsOpen ? <SettingsModal onClose={handleCloseSettings} /> : null}
    </div>
  );
};

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}
