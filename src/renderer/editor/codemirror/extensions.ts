import { richTables } from "./richTables";
import {
  documentFormat,
  detectDocumentFormat,
  documentText,
  editorText,
} from "./documentText";
import { EditorState, Compartment, Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  drawSelection,
  placeholder as placeholderExt,
} from "@codemirror/view";
import { history } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import { markdownLanguage } from "./markdownLanguage";
import { markdownKeymap } from "@codemirror/lang-markdown";
import { indentUnit } from "@codemirror/language";
import { navigateTable } from "./tables";
import {
  CursorPosition,
  RenderMode,
  SelectionStats,
} from "../../../shared/types";
import type { FileKind } from "../../../shared/fileKind";
import { ThemeName } from "../../theme";
import { getSelectionStats } from "../../lib/documentStats";
import { buildThemeExtension } from "./theme";
import { hybridMarkdown } from "./hybridMarkdown";
import { imagePreviews } from "./markdownWidgets";
import { linkClickHandler } from "./links";
import { editingLock } from "./editingLock";
import { createReactSearchPanel } from "./searchPanel";

type ExtensionOptions = {
  renderMode: RenderMode;
  fileKind: FileKind;
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

export const buildBaseKeymap = (): import("@codemirror/view").KeyBinding[] => [
  { key: "Tab", run: navigateTable(1) },
  { key: "Shift-Tab", run: navigateTable(-1) },
  ...markdownKeymap,
  ...searchKeymap,
];

const selectionStatsEqual = (
  left: SelectionStats,
  right: SelectionStats | null,
): boolean => {
  return (
    right !== null &&
    left.hasSelection === right.hasSelection &&
    left.words === right.words &&
    left.chars === right.chars
  );
};

export const renderModeExtension = (mode: RenderMode, kind: FileKind = "markdown"): Extension => {
  if (kind === "markdown" && mode === "hybrid") {
    return hybridMarkdown();
  }
  return [];
};

export const keymapExtension = (
  bindings: import("@codemirror/view").KeyBinding[],
  base: readonly import("@codemirror/view").KeyBinding[],
): Extension => keymap.of([...bindings, ...base]);

export const createCmExtensions = (
  options: ExtensionOptions,
): ExtensionBundle => {
  const themeCompartment = new Compartment();
  const keymapCompartment = new Compartment();
  const renderModeCompartment = new Compartment();
  let lastSelectionStats: SelectionStats | null = null;

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      options.onDocChange(documentText(update.state));
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

  const baseKeys = options.fileKind === "markdown" ? buildBaseKeymap() : searchKeymap;

  const extensions: Extension[] = [
    editingLock,
    drawSelection(),
    history(),
    ...(options.fileKind === "markdown" ? [markdownLanguage()] : []),
    indentUnit.of("  "),
    EditorView.lineWrapping,
    search({
      top: true,
      createPanel: createReactSearchPanel,
    }),
    updateListener,
    ...(options.fileKind === "markdown" ? [linkClickHandler] : []),
    keymapCompartment.of(keymapExtension(options.keyBindings, baseKeys)),
    themeCompartment.of(buildThemeExtension(options.theme, options.textSize)),
    ...(options.fileKind === "markdown" ? [richTables] : []),
    ...(options.fileKind === "markdown" ? [imagePreviews] : []),
    renderModeCompartment.of(renderModeExtension(options.renderMode, options.fileKind)),
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
  bundle: ExtensionBundle,
): EditorState => {
  return EditorState.create({
    doc: editorText(doc),
    extensions: [
      ...bundle.extensions,
      documentFormat.of(detectDocumentFormat(doc)),
    ],
  });
};
