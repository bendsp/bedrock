import React, { useEffect, useRef } from "react";
import { EditorView } from "@codemirror/view";
import { documentText, editorText } from "../editor/codemirror/documentText";
import { RenderMode, CursorPosition, SelectionStats } from "../../shared/types";
import { ThemeName } from "../theme";
import type { CommandRegistry, CommandRunner } from "../commands/commandSystem";
import type { UserSettings } from "../settings";
import {
  createCmExtensions,
  createState,
  renderModeExtension,
  keymapExtension,
  ExtensionBundle,
  buildBaseKeymap,
} from "../editor/codemirror/extensions";
import { buildThemeExtension } from "../editor/codemirror/theme";
import { EditorContextMenu } from "./EditorContextMenu";

type CodeMirrorEditorProps = {
  value: string;
  renderMode: RenderMode;
  theme: ThemeName;
  textSize: number;
  settings: UserSettings;
  commandRegistry: CommandRegistry;
  commands: CommandRunner;
  keyBindings: import("@codemirror/view").KeyBinding[];
  placeholder?: string;
  onChange: (nextValue: string) => void;
  onCursorChange?: (cursor: CursorPosition) => void;
  onSelectionStatsChange?: (stats: SelectionStats) => void;
  onReady?: (view: EditorView) => void;
  className?: string;
};

export const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({
  value,
  renderMode,
  theme,
  textSize,
  settings,
  commandRegistry,
  commands,
  keyBindings,
  placeholder,
  onChange,
  onCursorChange,
  onSelectionStatsChange,
  onReady,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const bundleRef = useRef<ExtensionBundle | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const bundle = createCmExtensions({
      renderMode,
      theme,
      textSize,
      keyBindings,
      placeholder,
      onDocChange: onChange,
      onCursorChange,
      onSelectionStatsChange,
    });

    const state = createState(value, bundle);
    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    bundleRef.current = bundle;
    viewRef.current = view;
    if (onReady) {
      onReady(view);
    }
    // The host restores focus after any document-replacement lock is released.
    if (!onReady) view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
      bundleRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    if (value === documentText(view.state)) {
      return;
    }
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: editorText(value),
      },
    });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    const bundle = bundleRef.current;
    if (!view || !bundle) {
      return;
    }
    view.dispatch({
      effects: bundle.compartments.renderMode.reconfigure(
        renderModeExtension(renderMode),
      ),
    });
  }, [renderMode]);

  useEffect(() => {
    const view = viewRef.current;
    const bundle = bundleRef.current;
    if (!view || !bundle) {
      return;
    }
    view.dispatch({
      effects: bundle.compartments.theme.reconfigure(
        buildThemeExtension(theme, textSize),
      ),
    });
  }, [theme, textSize]);

  useEffect(() => {
    const view = viewRef.current;
    const bundle = bundleRef.current;
    if (!view || !bundle) {
      return;
    }
    view.dispatch({
      effects: bundle.compartments.keymap.reconfigure(
        keymapExtension(keyBindings, buildBaseKeymap()),
      ),
    });
  }, [keyBindings]);

  return (
    <EditorContextMenu
      getView={() => viewRef.current}
      commands={commands}
      commandRegistry={commandRegistry}
      settings={settings}
    >
      <div
        ref={containerRef}
        className={className}
        onPasteCapture={(event) => {
          const files = Array.from(event.clipboardData.files).filter((file) =>
            file.type.startsWith("image/"),
          );
          if (!files.length) return;
          event.preventDefault();
          event.stopPropagation();
          const element =
            event.target instanceof Element
              ? event.target.closest(".cm-editor")
              : null;
          const view = element
            ? EditorView.findFromDOM(element as HTMLElement)
            : viewRef.current;
          if (view)
            void commands.runWithView("insert.attachImages", view, { files });
        }}
        onDragOver={(event) => {
          if (
            Array.from(event.dataTransfer.items).some(
              (item) => item.kind === "file" && item.type.startsWith("image/"),
            )
          )
            event.preventDefault();
        }}
        onDropCapture={(event) => {
          const files = Array.from(event.dataTransfer.files).filter((file) =>
            file.type.startsWith("image/"),
          );
          if (!files.length) return;
          event.preventDefault();
          event.stopPropagation();
          if (event.target instanceof HTMLElement)
            event.target.closest<HTMLElement>(".cm-table-cell")?.focus();
          const element =
            event.target instanceof Element
              ? (event.target
                  .closest(".cm-table-cell")
                  ?.querySelector<HTMLElement>(".cm-editor") ??
                event.target.closest<HTMLElement>(".cm-editor"))
              : null;
          const view = element
            ? EditorView.findFromDOM(element)
            : viewRef.current;
          if (!view) return;
          const position = view.posAtCoords({
            x: event.clientX,
            y: event.clientY,
          });
          if (position !== null)
            view.dispatch({ selection: { anchor: position } });
          void commands.runWithView("insert.attachImages", view, { files });
        }}
      />
    </EditorContextMenu>
  );
};
