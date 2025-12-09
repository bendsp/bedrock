import { Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, ViewPlugin } from "@codemirror/view";

type LineKind =
  | { type: "heading"; level: number; markerEnd: number }
  | { type: "blockquote"; markerEnd: number }
  | { type: "list"; markerEnd: number }
  | { type: "fenceDelimiter"; markerEnd: number }
  | { type: "fenceContent" }
  | { type: "paragraph" };

const headingMatch = (text: string): LineKind | null => {
  const match = text.match(/^(#{1,6})\s+(.*)$/);
  if (!match) return null;
  const level = match[1].length;
  return { type: "heading", level, markerEnd: match[1].length + 1 };
};

const listMatch = (text: string): LineKind | null => {
  const match = text.match(/^\s*([*-]|\d+[.)])\s+/);
  if (!match) return null;
  return { type: "list", markerEnd: match[0].length };
};

const blockquoteMatch = (text: string): LineKind | null => {
  const match = text.match(/^\s*>+\s?/);
  if (!match) return null;
  return { type: "blockquote", markerEnd: match[0].length };
};

const fenceMatch = (text: string): LineKind | null => {
  const match = text.match(/^```/);
  if (!match) return null;
  return { type: "fenceDelimiter", markerEnd: match[0].length };
};

const classifyLines = (lines: string[]): LineKind[] => {
  const kinds: LineKind[] = [];
  let inFence = false;
  for (const line of lines) {
    if (inFence) {
      const fence = fenceMatch(line);
      if (fence) {
        kinds.push(fence);
        inFence = false;
      } else {
        kinds.push({ type: "fenceContent" });
      }
      continue;
    }

    const fence = fenceMatch(line);
    if (fence) {
      kinds.push(fence);
      inFence = true;
      continue;
    }

    const heading = headingMatch(line);
    if (heading) {
      kinds.push(heading);
      continue;
    }

    const list = listMatch(line);
    if (list) {
      kinds.push(list);
      continue;
    }

    const quote = blockquoteMatch(line);
    if (quote) {
      kinds.push(quote);
      continue;
    }

    kinds.push({ type: "paragraph" });
  }
  return kinds;
};

const listRunFor = (kinds: LineKind[], start: number): [number, number] => {
  let end = start;
  while (end + 1 < kinds.length && kinds[end + 1].type === "list") {
    end += 1;
  }
  return [start, end];
};

const quoteRunFor = (kinds: LineKind[], start: number): [number, number] => {
  let end = start;
  while (end + 1 < kinds.length && kinds[end + 1].type === "blockquote") {
    end += 1;
  }
  return [start, end];
};

export const hybridMarkdown = (): Extension => {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: import("@codemirror/view").EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: import("@codemirror/view").ViewUpdate): void {
        if (update.docChanged || update.selectionSet) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      private buildDecorations(
        view: import("@codemirror/view").EditorView
      ): DecorationSet {
        const doc = view.state.doc;
        const activeLine = doc.lineAt(view.state.selection.main.head).number;
        const builder = new RangeSetBuilder<Decoration>();
        const lines = [];
        for (let i = 1; i <= doc.lines; i += 1) {
          lines.push(doc.line(i).text);
        }
        const kinds = classifyLines(lines);

        const addLineClass = (lineNumber: number, cls: string) => {
          if (lineNumber === activeLine) return;
          const from = doc.line(lineNumber).from;
          builder.add(from, from, Decoration.line({ class: cls }));
        };

        const hideRange = (lineNumber: number, from: number, to: number) => {
          if (lineNumber === activeLine) return;
          const line = doc.line(lineNumber);
          builder.add(
            line.from + from,
            line.from + to,
            Decoration.mark({ class: "cm-md-hide-marker", inclusive: false })
          );
        };

        const markInlineCode = (lineNumber: number, text: string) => {
          if (lineNumber === activeLine) return;
          let idx = 0;
          while (idx < text.length) {
            const start = text.indexOf("`", idx);
            if (start === -1) break;
            const end = text.indexOf("`", start + 1);
            if (end === -1) break;
            if (end > start + 1) {
              const line = doc.line(lineNumber);
              builder.add(
                line.from + start,
                line.from + end + 1,
                Decoration.mark({
                  class: "cm-md-inline-code",
                  inclusive: false,
                })
              );
              hideRange(lineNumber, start, start + 1);
              hideRange(lineNumber, end, end + 1);
            }
            idx = end + 1;
          }
        };

        for (let i = 0; i < kinds.length; i += 1) {
          const lineNo = i + 1;
          const kind = kinds[i];
          const lineText = lines[i] ?? "";

          switch (kind.type) {
            case "heading": {
              addLineClass(
                lineNo,
                `cm-md-heading cm-md-atxheading${kind.level}`
              );
              hideRange(lineNo, 0, kind.markerEnd);
              break;
            }
            case "list": {
              const [start, end] = listRunFor(kinds, i);
              for (let ln = start + 1; ln <= end + 1; ln += 1) {
                addLineClass(ln, "cm-md-list");
                const text = lines[ln - 1] ?? "";
                const marker = listMatch(text);
                if (marker && "markerEnd" in marker) {
                  hideRange(ln, 0, marker.markerEnd);
                }
                markInlineCode(ln, text);
              }
              i = end;
              break;
            }
            case "blockquote": {
              const [start, end] = quoteRunFor(kinds, i);
              for (let ln = start + 1; ln <= end + 1; ln += 1) {
                addLineClass(ln, "cm-md-quote");
                const text = lines[ln - 1] ?? "";
                const marker = blockquoteMatch(text);
                if (marker && "markerEnd" in marker) {
                  hideRange(ln, 0, marker.markerEnd);
                }
                markInlineCode(ln, text);
              }
              i = end;
              break;
            }
            case "fenceDelimiter": {
              addLineClass(lineNo, "cm-md-code-block");
              hideRange(lineNo, 0, kind.markerEnd);
              break;
            }
            case "fenceContent": {
              addLineClass(lineNo, "cm-md-code-block");
              break;
            }
            case "paragraph": {
              markInlineCode(lineNo, lineText);
              break;
            }
            default:
              break;
          }
        }

        return builder.finish();
      }
    },
    {
      decorations: (value) => value.decorations,
    }
  );
};
