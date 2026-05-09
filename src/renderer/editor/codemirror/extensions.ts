import { EditorState, Compartment, Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  drawSelection,
  placeholder as placeholderExt,
} from "@codemirror/view";
import { history } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import { indentUnit } from "@codemirror/language";
import { GFM } from "@lezer/markdown";
import {
  CursorPosition,
  RenderMode,
  SelectionStats,
} from "../../../shared/types";
import { ThemeName } from "../../theme";
import { getSelectionStats } from "../../lib/documentStats";
import { buildThemeExtension } from "./theme";
import { hybridMarkdown } from "./hybridMarkdown";
import { linkClickHandler } from "./links";
import { createReactSearchPanel } from "./searchPanel";
import {
  continueOrderedListCommand,
  continueUnorderedListCommand,
} from "./commands";

type ExtensionOptions = {
  renderMode: RenderMode;
  theme: ThemeName;
  textSize: number;
  keyBindings: import("@codemirror/view").KeyBinding[];
  placeholder?: string;
  onDocChange: (doc: string) => void;
  onCursorChange?: (cursor: CursorPosition) => void;
  onSelectionStatsChange?: (stats: SelectionStats) => void;
};

export type ExtensionBundle = {
  extensions: Extension[];
  compartments: {
    theme: Compartment;
    keymap: Compartment;
    renderMode: Compartment;
  };
};

export const buildBaseKeymap =
  (): import("@codemirror/view").KeyBinding[] => [
    {
      key: "Enter",
      run: (view) =>
        continueUnorderedListCommand(view) || continueOrderedListCommand(view),
    },
    ...searchKeymap,
  ];

const selectionStatsEqual = (
  left: SelectionStats,
  right: SelectionStats | null
): boolean => {
  return (
    right !== null &&
    left.hasSelection === right.hasSelection &&
    left.words === right.words &&
    left.chars === right.chars
  );
};

export const renderModeExtension = (mode: RenderMode): Extension => {
  if (mode === "hybrid") {
    return hybridMarkdown();
  }
  return [];
};

export const keymapExtension = (
  bindings: import("@codemirror/view").KeyBinding[],
  base: import("@codemirror/view").KeyBinding[]
): Extension => keymap.of([...base, ...bindings]);

export const createCmExtensions = (
  options: ExtensionOptions
): ExtensionBundle => {
  const themeCompartment = new Compartment();
  const keymapCompartment = new Compartment();
  const renderModeCompartment = new Compartment();
  let lastSelectionStats: SelectionStats | null = null;

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      options.onDocChange(update.state.doc.toString());
    }
    if (options.onCursorChange && update.selectionSet) {
      const cursor = update.state.doc.lineAt(update.state.selection.main.head);
      options.onCursorChange({
        line: cursor.number - 1,
        char: update.state.selection.main.head - cursor.from,
      });
    }
    if (
      options.onSelectionStatsChange &&
      (update.selectionSet || update.docChanged)
    ) {
      const selectedText = update.state.selection.ranges
        .filter((range) => !range.empty)
        .map((range) => update.state.doc.sliceString(range.from, range.to))
        .join("\n");
      const selectionStats = getSelectionStats(selectedText);
      if (!selectionStatsEqual(selectionStats, lastSelectionStats)) {
        lastSelectionStats = selectionStats;
        options.onSelectionStatsChange(selectionStats);
      }
    }
  });

  const baseKeys = buildBaseKeymap();

  const extensions: Extension[] = [
    drawSelection(),
    history(),
    markdown({ extensions: [GFM] }),
    indentUnit.of("  "),
    EditorView.lineWrapping,
    search({
      top: true,
      createPanel: createReactSearchPanel,
    }),
    updateListener,
    linkClickHandler,
    keymapCompartment.of(keymapExtension(options.keyBindings, baseKeys)),
    themeCompartment.of(buildThemeExtension(options.theme, options.textSize)),
    renderModeCompartment.of(renderModeExtension(options.renderMode)),
  ];

  if (options.placeholder) {
    extensions.push(placeholderExt(options.placeholder));
  }

  return {
    extensions,
    compartments: {
      theme: themeCompartment,
      keymap: keymapCompartment,
      renderMode: renderModeCompartment,
    },
  };
};

export const createState = (
  doc: string,
  bundle: ExtensionBundle
): EditorState => {
  return EditorState.create({
    doc,
    extensions: bundle.extensions,
  });
};
