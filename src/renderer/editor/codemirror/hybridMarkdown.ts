import { Extension, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { Decoration, DecorationSet, ViewPlugin } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

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
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged
        ) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      private buildDecorations(
        view: import("@codemirror/view").EditorView
      ): DecorationSet {
        const doc = view.state.doc;
        const builder = new RangeSetBuilder<Decoration>();

        // RangeSetBuilder requires decorations be added in ascending order.
        // We collect them first (line-level + inline) and add them sorted.
        const pending: Array<{ from: number; to: number; deco: Decoration }> =
          [];
        const pushDeco = (from: number, to: number, deco: Decoration) => {
          pending.push({ from, to, deco });
        };

        const selectionTouches = (from: number, to: number): boolean => {
          // Treat `to` as inclusive for UX purposes (cursor at end-of-range counts).
          for (const range of view.state.selection.ranges) {
            const a = Math.min(range.from, range.to);
            const b = Math.max(range.from, range.to);
            if (a === b) {
              if (a >= from && a <= to) return true;
              continue;
            }
            if (a <= to && b >= from) return true;
          }
          return false;
        };
        const lines = [];
        for (let i = 1; i <= doc.lines; i += 1) {
          lines.push(doc.line(i).text);
        }
        const kinds = classifyLines(lines);

        const addLineClass = (lineNumber: number, cls: string) => {
          const line = doc.line(lineNumber);
          if (selectionTouches(line.from, line.to)) return;
          pushDeco(line.from, line.from, Decoration.line({ class: cls }));
        };

        const hideRange = (lineNumber: number, from: number, to: number) => {
          const line = doc.line(lineNumber);
          if (selectionTouches(line.from, line.to)) return;
          pushDeco(
            line.from + from,
            line.from + to,
            Decoration.mark({ class: "cm-md-hide-marker", inclusive: false })
          );
        };

        for (let i = 0; i < kinds.length; i += 1) {
          const lineNo = i + 1;
          const kind = kinds[i];

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
            default:
              break;
          }
        }

        const addInlineMark = (from: number, to: number, cls: string) => {
          pushDeco(from, to, Decoration.mark({ class: cls, inclusive: false }));
        };

        const containerNames = new Set([
          "Emphasis",
          "StrongEmphasis",
          "InlineCode",
          "Link",
          "Image",
          "Strikethrough",
        ]);

        const findContainer = (node: SyntaxNode): SyntaxNode => {
          let current: SyntaxNode | null = node.parent;
          let outermost: SyntaxNode | null = null;
          while (current) {
            if (containerNames.has(current.type.name)) {
              outermost = current;
            }
            current = current.parent;
          }
          return outermost || node;
        };

        const stylingContainerNames = new Set([
          "Emphasis",
          "StrongEmphasis",
          "Strikethrough",
        ]);

        const findOutermostStylingContainer = (
          node: SyntaxNode
        ): SyntaxNode => {
          let current: SyntaxNode | null = node;
          let outermost = node;
          while (current) {
            if (stylingContainerNames.has(current.type.name)) {
              outermost = current;
              current = current.parent;
            } else {
              break;
            }
          }
          return outermost;
        };

        const hideIfInactive = (
          nodeFrom: number,
          nodeTo: number,
          containerFrom: number,
          containerTo: number
        ) => {
          if (selectionTouches(containerFrom, containerTo)) return;
          pushDeco(
            nodeFrom,
            nodeTo,
            Decoration.mark({ class: "cm-md-hide-marker", inclusive: false })
          );
        };

        // Inline markdown styling + "hide marks when cursor isn't inside" behavior.
        const tree = syntaxTree(view.state);
        for (const range of view.visibleRanges) {
          tree.iterate({
            from: range.from,
            to: range.to,
            enter: (node) => {
              switch (node.name) {
                case "StrongEmphasis": {
                  const container = findOutermostStylingContainer(node.node);
                  addInlineMark(container.from, container.to, "cm-md-strong");
                  break;
                }
                case "Emphasis": {
                  const container = findOutermostStylingContainer(node.node);
                  addInlineMark(container.from, container.to, "cm-md-em");
                  break;
                }
                case "Strikethrough": {
                  const container = findOutermostStylingContainer(node.node);
                  addInlineMark(container.from, container.to, "cm-md-strike");
                  break;
                }
                case "Link":
                  addInlineMark(node.from, node.to, "cm-md-link");
                  break;
                case "InlineCode":
                  addInlineMark(node.from, node.to, "cm-md-inline-code");
                  break;
                // Marks / delimiters (hide when cursor isn't inside their container)
                case "StrongEmphasisMark":
                case "EmphasisMark":
                case "CodeMark":
                case "LinkMark":
                case "ImageMark":
                case "StrikethroughMark":
                case "URL": {
                  const container = findContainer(node.node);
                  hideIfInactive(
                    node.from,
                    node.to,
                    container.from,
                    container.to
                  );
                  break;
                }
                default:
                  break;
              }
            },
          });
        }

        pending.sort((a, b) => a.from - b.from || a.to - b.to);
        for (const entry of pending) {
          builder.add(entry.from, entry.to, entry.deco);
        }

        return builder.finish();
      }
    },
    {
      decorations: (value) => value.decorations,
    }
  );
};
