import React, { useEffect, useRef } from "react";
import { EditorView } from "@codemirror/view";
import { RenderMode, CursorPosition } from "../../shared/types";
import { ThemeName } from "../theme";
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
  keyBindings: import("@codemirror/view").KeyBinding[];
  placeholder?: string;
  onChange: (nextValue: string) => void;
  onCursorChange?: (cursor: CursorPosition) => void;
  onReady?: (view: EditorView) => void;
  onOpenSettings?: () => void;
  className?: string;
  formatKeyBindings?: {
    bold: string;
    italic: string;
    strikethrough: string;
    openSettings: string;
  };
};

export const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({
  value,
  renderMode,
  theme,
  textSize,
  keyBindings,
  placeholder,
  onChange,
  onCursorChange,
  onReady,
  onOpenSettings,
  className,
  formatKeyBindings,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const bundleRef = useRef<ExtensionBundle | null>(null);

  const boldBinding = formatKeyBindings?.bold ?? "mod+b";
  const italicBinding = formatKeyBindings?.italic ?? "mod+i";
  const strikeBinding = formatKeyBindings?.strikethrough ?? "mod+shift+x";
  const openSettingsBinding = formatKeyBindings?.openSettings ?? "mod+,";

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
    // Focus the editor when it mounts so typing works immediately.
    requestAnimationFrame(() => view.focus());

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
    if (value === view.state.doc.toString()) {
      return;
    }
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
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
        renderModeExtension(renderMode)
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
        buildThemeExtension(theme, textSize)
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
        keymapExtension(keyBindings, buildBaseKeymap())
      ),
    });
  }, [keyBindings]);

  return (
    <EditorContextMenu
      getView={() => viewRef.current}
      onOpenSettings={onOpenSettings}
      keyBindings={{
        bold: boldBinding,
        italic: italicBinding,
        strikethrough: strikeBinding,
        openSettings: openSettingsBinding,
      }}
    >
      <div ref={containerRef} className={className} />
    </EditorContextMenu>
  );
};

export default CodeMirrorEditor;
