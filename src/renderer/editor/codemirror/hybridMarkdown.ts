import { Extension } from "@codemirror/state";
import { blockPreviews } from "./markdownWidgets";
import { markdownDecorations } from "./markdownDecorations";

export const hybridMarkdown = (): Extension => [
  blockPreviews,
  markdownDecorations,
];
