import { EditorState, Facet } from "@codemirror/state";

type DocumentFormat = { separator: string; bom: boolean };
export const documentFormat = Facet.define<DocumentFormat, DocumentFormat>({
  combine: (values) => values[0] ?? { separator: "\n", bom: false },
});
export function detectDocumentFormat(source: string): DocumentFormat {
  return {
    separator: source.match(/\r\n|\r|\n/)?.[0] ?? "\n",
    bom: source.startsWith("\ufeff"),
  };
}
export const editorText = (source: string) =>
  source.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");
/** CodeMirror uses LF internally; file serialization preserves the session's format. */
export function documentText(state: EditorState): string {
  const format = state.facet(documentFormat);
  return (
    (format.bom ? "\ufeff" : "") +
    state.doc.toString().replace(/\n/g, format.separator)
  );
}
export function normalizeDocumentText(source: string): string {
  const format = detectDocumentFormat(source);
  return (
    (format.bom ? "\ufeff" : "") +
    editorText(source).replace(/\n/g, format.separator)
  );
}
