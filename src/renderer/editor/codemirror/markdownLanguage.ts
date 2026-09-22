import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM, MarkdownConfig, Element } from "@lezer/markdown";
import { frontmatterEnd } from "../../../shared/markdownFrontmatter";

let activeMetadataEnd = 0;

const highlightDelimiter = { resolve: "Highlight", mark: "HighlightMark" };
export const noteMarkdown: MarkdownConfig = {
  wrap(inner, input) {
    // Metadata is bounded independently of note length; ordinary typing never scans the whole file here.
    const end =
      input.read(0, Math.min(input.length, 3)) === "---"
        ? frontmatterEnd(input.read(0, Math.min(input.length, 128 * 1024)))
        : 0;
    return {
      advance() {
        // Parse wrappers may be nested. Scope the input's metadata to this synchronous advance.
        const previous = activeMetadataEnd;
        activeMetadataEnd = end;
        try {
          return inner.advance();
        } finally {
          activeMetadataEnd = previous;
        }
      },
      get parsedPos() {
        return inner.parsedPos;
      },
      get stoppedAt() {
        return inner.stoppedAt;
      },
      stopAt(position) {
        inner.stopAt(position);
      },
    };
  },
  defineNodes: [
    "Highlight",
    "HighlightMark",
    "Math",
    "MathMark",
    "MathText",
    "Footnote",
    "FootnoteMark",
    { name: "DisplayMath", block: true },
    { name: "FootnoteDefinition", block: true },
    { name: "Frontmatter", block: true },
  ],
  parseBlock: [
    {
      name: "Frontmatter",
      before: "HorizontalRule",
      parse(cx, line) {
        const end = activeMetadataEnd;
        if (cx.lineStart !== 0 || !end) return false;
        while (cx.lineStart + line.text.length < end && cx.nextLine()) {
          /* consume metadata */
        }
        cx.addElement(cx.elt("Frontmatter", 0, end));
        cx.nextLine();
        return true;
      },
    },
    {
      name: "FootnoteDefinition",
      before: "LinkReference",
      parse(cx, line) {
        const match = /^\[\^([^\]\s]+)\]:[ \t]*/.exec(
          line.text.slice(line.pos),
        );
        if (!match) return false;
        const from = cx.lineStart + line.pos;
        const elements = [
          cx.elt("FootnoteMark", from, from + match[0].trimEnd().length),
          ...cx.parser.parseInline(
            line.text.slice(line.pos + match[0].length),
            from + match[0].length,
          ),
        ];
        let to = cx.lineStart + line.text.length;
        while (cx.nextLine()) {
          // Blank separators may precede another indented definition paragraph.
          // Leave the first unindented content line for the surrounding parser.
          if (!line.text.slice(line.pos).trim()) continue;
          if (line.indent - line.baseIndent < 4) break;
          elements.push(
            ...line.markers,
            ...cx.parser.parseInline(
              line.text.slice(line.pos),
              cx.lineStart + line.pos,
            ),
          );
          to = cx.lineStart + line.text.length;
        }
        cx.addElement(cx.elt("FootnoteDefinition", from, to, elements));
        return true;
      },
    },
    {
      name: "DisplayMath",
      before: "FencedCode",
      endLeaf: (_cx, line) => line.text.slice(line.pos).trim() === "$$",
      parse(cx, line) {
        const opening = line.text.slice(line.pos).trimEnd();
        if (opening !== "$$" && !/^\$\$.+\$\$$/.test(opening)) return false;
        const from = cx.lineStart + line.pos;
        const elements: Element[] = [cx.elt("MathMark", from, from + 2)];
        let to = cx.lineStart + line.text.length;
        if (opening.length > 4) {
          elements.push(
            cx.elt("MathText", from + 2, from + opening.length - 2),
            cx.elt(
              "MathMark",
              from + opening.length - 2,
              from + opening.length,
            ),
          );
          cx.nextLine();
        } else {
          const baseIndent = line.baseIndent;
          while (cx.nextLine()) {
            if (line.baseIndent < baseIndent) break;
            const start = cx.lineStart + line.basePos;
            const end = cx.lineStart + line.text.length;
            elements.push(...line.markers);
            if (line.text.slice(line.pos).trim() === "$$") {
              elements.push(
                cx.elt(
                  "MathMark",
                  cx.lineStart + line.pos,
                  cx.lineStart + line.pos + 2,
                ),
              );
              to = end;
              cx.nextLine();
              break;
            }
            elements.push(cx.elt("MathText", start, end));
            to = end;
          }
        }
        cx.addElement(cx.elt("DisplayMath", from, to, elements));
        return true;
      },
    },
  ],
  parseInline: [
    {
      name: "Highlight",
      parse(cx, next, pos) {
        if (next !== 61 || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61)
          return -1;
        return cx.addDelimiter(
          highlightDelimiter,
          pos,
          pos + 2,
          !/\s/.test(cx.slice(pos + 2, pos + 3)),
          !/\s/.test(cx.slice(pos - 1, pos)),
        );
      },
      before: "Emphasis",
    },
    {
      name: "Math",
      parse(cx, next, pos) {
        if (next !== 36) return -1;
        const size = cx.char(pos + 1) === 36 ? 2 : 1;
        if (size === 1 && /\s/.test(cx.slice(pos + 1, pos + 2))) return -1;
        for (let end = pos + size; end < cx.end; end++) {
          if (cx.char(end) === 92) {
            end++;
            continue;
          }
          if (cx.char(end) !== 36 || (size === 2 && cx.char(end + 1) !== 36))
            continue;
          if (
            end === pos + size ||
            (size === 1 &&
              (/\s/.test(cx.slice(end - 1, end)) ||
                /\d/.test(cx.slice(end + size, end + size + 1))))
          )
            return -1;
          return cx.addElement(
            cx.elt("Math", pos, end + size, [
              cx.elt("MathMark", pos, pos + size),
              cx.elt("MathMark", end, end + size),
            ]),
          );
        }
        return -1;
      },
      before: "Link",
    },
    {
      name: "Footnote",
      parse(cx, next, pos) {
        if (next !== 91 || cx.char(pos + 1) !== 94) return -1;
        const match = /^\[\^[^\]\s]+\]/.exec(cx.slice(pos, cx.end));
        if (!match) return -1;
        return cx.addElement(cx.elt("Footnote", pos, pos + match[0].length));
      },
      before: "Link",
    },
  ],
};

export const markdownLanguage = () =>
  markdown({ extensions: [GFM, noteMarkdown], codeLanguages: languages });
