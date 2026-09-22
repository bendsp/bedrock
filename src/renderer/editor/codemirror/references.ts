import type { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

/** Reconstruct reference definitions without their surrounding quote/list markers. */
export function referenceSource(state: EditorState): string {
  const references: string[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "LinkReference" && node.name !== "FootnoteDefinition")
        return node.name === "Document" || node.node.type.is("BlockContext")
          ? undefined
          : false;
      const lines: string[] = [];
      const markers = node.node.getChildren("QuoteMark");
      const first = state.doc.lineAt(node.from).number,
        last = state.doc.lineAt(node.to).number;
      for (let n = first; n <= last; n++) {
        const line = state.doc.line(n);
        let from = Math.max(node.from, line.from);
        for (const marker of markers)
          if (marker.from >= line.from && marker.to <= line.to)
            from = Math.max(from, marker.to);
        lines.push(state.doc.sliceString(from, Math.min(line.to, node.to)));
      }
      references.push(lines.join("\n"));
      return false;
    },
  });
  return references.join("\n\n");
}
