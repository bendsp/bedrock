import React, { useEffect, useRef, useCallback } from "react";
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { createWrapSelectionOrWordCommand } from "../editor/codemirror/commands";
import { formatBindingShortcut } from "../keybindings";

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
  className?: string;
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
  className,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const bundleRef = useRef<ExtensionBundle | null>(null);

  const runCommand = useCallback((command: (view: EditorView) => boolean) => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    view.focus();
    command(view);
  }, []);

  const boldCommandRef = useRef(
    createWrapSelectionOrWordCommand({
      before: "**",
      after: "**",
      emptySnippet: "****",
      emptyCursorOffset: 2,
    })
  );
  const italicCommandRef = useRef(
    createWrapSelectionOrWordCommand({
      before: "*",
      after: "*",
      emptySnippet: "**",
      emptyCursorOffset: 1,
    })
  );
  const strikeCommandRef = useRef(
    createWrapSelectionOrWordCommand({
      before: "~~",
      after: "~~",
      emptySnippet: "~~~~",
      emptyCursorOffset: 2,
    })
  );

  const boldBinding = "mod+b";
  const italicBinding = "mod+i";
  const strikeBinding = "mod+shift+x";

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      // If there's already a selection, preserve it. Otherwise, move the cursor
      // to the right-click position so formatting targets the expected word.
      const sel = view.state.selection.main;
      if (sel.from !== sel.to) {
        return;
      }

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) {
        return;
      }

      view.dispatch({
        selection: { anchor: pos },
        scrollIntoView: false,
      });
    },
    []
  );

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
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={containerRef}
          className={className}
          onContextMenu={handleContextMenu}
        />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuLabel inset>Format</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem
          inset
          onSelect={() => runCommand(boldCommandRef.current)}
        >
          Bold
          <ContextMenuShortcut>
            {formatBindingShortcut(boldBinding)}
          </ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          inset
          onSelect={() => runCommand(italicCommandRef.current)}
        >
          Italic
          <ContextMenuShortcut>
            {formatBindingShortcut(italicBinding)}
          </ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          inset
          onSelect={() => runCommand(strikeCommandRef.current)}
        >
          Strikethrough
          <ContextMenuShortcut>
            {formatBindingShortcut(strikeBinding)}
          </ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default CodeMirrorEditor;
