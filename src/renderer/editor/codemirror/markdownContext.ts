import { EditorState, Facet, StateEffect } from "@codemirror/state";
import type { Text } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { Tree } from "@lezer/common";
import { referenceSource } from "./references";
import { markdownParser, MarkdownEnvironment } from "../../lib/markdown";

/** Embedded cells still belong to the outer Markdown document's links and footnotes. */
export const markdownDocument = Facet.define<
  () => EditorState,
  (() => EditorState) | null
>({ combine: (values) => values[0] ?? null });
export const refreshMarkdownContext = StateEffect.define<null>();

type DocumentContext = {
  references: string;
  signature: string;
  definitions: Map<string, number>;
  numbers: Map<string, number>;
  environment: MarkdownEnvironment;
};
const cache = new WeakMap<Text, { tree: Tree; context: DocumentContext }>();

/** Reference resolution belongs to the document and is reused on cursor motion. */
export function getMarkdownContext(state: EditorState): DocumentContext {
  const tree = syntaxTree(state),
    cached = cache.get(state.doc);
  if (cached?.tree === tree) return cached.context;
  const references = referenceSource(state);
  const definitions = new Map<string, number>(),
    numbers = new Map<string, number>();
  const labels: string[] = [];
  tree.iterate({
    enter(node) {
      if (
        (node.node.type.is("LeafBlock") || node.name === "Document") &&
        !state.doc.sliceString(node.from, node.to).includes("[^")
      )
        return false;
      if (node.name === "FootnoteDefinition") {
        const label = /^\[\^([^\]]+)\]/.exec(
          state.doc.sliceString(node.from, node.to),
        )?.[1];
        if (label && !definitions.has(label)) definitions.set(label, node.from);
        return false;
      }
      if (node.name === "Footnote")
        labels.push(state.doc.sliceString(node.from + 2, node.to - 1));
    },
  });
  for (const label of labels)
    if (definitions.has(label) && !numbers.has(label))
      numbers.set(label, numbers.size + 1);
  const environment: MarkdownEnvironment = {};
  if (references) markdownParser.parse(references, environment);
  environment.footnotes = {
    refs: Object.fromEntries(
      [...definitions.keys()].map((label) => [
        `:${label}`,
        (numbers.get(label) ?? 0) - 1,
      ]),
    ),
    list: [...numbers.keys()].map((label) => ({ label, count: 0 })),
  };
  const context = {
    references,
    definitions,
    numbers,
    environment,
    signature:
      references +
      JSON.stringify([...definitions]) +
      JSON.stringify([...numbers]),
  };
  cache.set(state.doc, { tree, context });
  return context;
}
