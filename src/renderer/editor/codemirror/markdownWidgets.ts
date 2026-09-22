import {
  hydrateMarkdownImages,
  disposeMarkdownImages,
} from "../../lib/markdownImages";
import type { SyntaxNode } from "@lezer/common";
import { followRenderedLink } from "./links";
import {
  markdownDocument,
  refreshMarkdownContext,
  getMarkdownContext,
} from "./markdownContext";
import { tableCellOwners } from "./tableCellContext";
import { EditorState, StateField, Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { render as renderMath } from "katex";
import { safeMarkdownHtml } from "../../lib/markdown";

type Preview = {
  from: number;
  to: number;
  kind: "Image" | "Math" | "Footnote" | "SetextUnderline" | "HTML";
  block?: boolean;
  source: string;
  references: string;
  revealFrom?: number;
  definition?: number;
  label?: string;
};
class MarkdownWidget extends WidgetType {
  constructor(readonly preview: Preview) {
    super();
  }
  eq(other: MarkdownWidget) {
    return (
      this.preview.kind === other.preview.kind &&
      this.preview.source === other.preview.source &&
      this.preview.from === other.preview.from &&
      this.preview.references === other.preview.references &&
      this.preview.label === other.preview.label &&
      this.preview.definition === other.preview.definition
    );
  }
  toDOM(view: EditorView) {
    const { kind, source, from } = this.preview;
    const el = document.createElement("span");
    el.className = `cm-md-preview cm-md-preview-${kind.toLowerCase()}`;
    el.setAttribute(
      "aria-label",
      `${kind} preview. Click to edit Markdown source.`,
    );
    if (kind === "Footnote") {
      el.classList.add("cm-md-footnote");
      el.textContent = this.preview.label ?? source;
      el.title = "Ctrl/Cmd-click to go to the footnote definition.";
    } else if (kind === "Math") {
      const displayMode = source.startsWith("$$");
      const size = displayMode ? 2 : 1;
      renderMath(source.slice(size, -size), el, {
        throwOnError: false,
        trust: false,
        displayMode,
        maxExpand: 1000,
      });
    } else {
      el.innerHTML = safeMarkdownHtml(
        source,
        !this.preview.block,
        this.preview.references,
      );
      hydrateMarkdownImages(
        el,
        () => view.requestMeasure(),
        tableCellOwners.get(view) ?? view,
      );
    }
    el.addEventListener("mousedown", (event) => {
      event.preventDefault();
      if (followRenderedLink(event, view)) return;
      const anchor =
        kind === "Footnote" &&
        (event.metaKey || event.ctrlKey) &&
        this.preview.definition !== undefined
          ? this.preview.definition
          : from + 1;
      const target =
        anchor === this.preview.definition
          ? (tableCellOwners.get(view) ?? view)
          : view;
      target.dispatch({ selection: { anchor }, scrollIntoView: true });
      target.focus();
    });
    el.addEventListener("click", (event) => event.preventDefault());
    return el;
  }
  ignoreEvent() {
    return true;
  }
  destroy(dom: HTMLElement) {
    disposeMarkdownImages(dom);
  }
}

function htmlTags(node: SyntaxNode): SyntaxNode[] {
  const tags: SyntaxNode[] = [];
  const visit = (parent: SyntaxNode) => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (child.name === "HTMLTag") tags.push(child);
      else visit(child);
    }
  };
  visit(node);
  return tags;
}
function collectPreviews(state: EditorState): Preview[] {
  const result: Preview[] = [];
  const inlineHtml: Array<{ from: number; to: number }> = [];
  let htmlIndex = 0;
  const documentState = state.facet(markdownDocument)?.() ?? state;
  const { references, definitions, numbers } =
    getMarkdownContext(documentState);
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === "Table") return false;
      if (
        node.name === "Paragraph" &&
        !/!\[|\[\^|[$<]/.test(state.doc.sliceString(node.from, node.to))
      )
        return false;
      while (
        htmlIndex < inlineHtml.length &&
        inlineHtml[htmlIndex].to <= node.from
      )
        htmlIndex++;
      const covered = inlineHtml[htmlIndex];
      if (covered && covered.from <= node.from && covered.to >= node.to)
        return false;
      if (node.name === "HTMLBlock" || node.name === "CommentBlock") {
        result.push({
          kind: "HTML",
          block: true,
          from: state.doc.lineAt(node.from).from,
          to: node.to,
          source: state.doc.sliceString(
            state.doc.lineAt(node.from).from,
            node.to,
          ),
          references,
        });
        return false;
      }
      if (
        (node.name === "Paragraph" || /Heading/.test(node.name)) &&
        state.doc.sliceString(node.from, node.to).includes("<")
      ) {
        // Lezer identifies HTML tags; pair inline elements within this block only.
        const stack: Array<{ tag: string; from: number }> = [];
        for (const tag of htmlTags(node.node)) {
          const raw = state.doc.sliceString(tag.from, tag.to);
          const match = /^<(\/?)([a-z][\w-]*)\b/i.exec(raw);
          if (!match) continue;
          const name = match[2].toLowerCase();
          if (["br", "wbr", "img"].includes(name) && !stack.length) {
            inlineHtml.push({ from: tag.from, to: tag.to });
            result.push({
              kind: "HTML",
              from: tag.from,
              to: tag.to,
              source: raw,
              references,
            });
          } else if (
            [
              "sup",
              "sub",
              "kbd",
              "abbr",
              "span",
              "strong",
              "em",
              "b",
              "i",
              "u",
              "s",
              "del",
              "mark",
              "small",
              "code",
            ].includes(name)
          ) {
            if (!match[1]) stack.push({ tag: name, from: tag.from });
            else if (stack.at(-1)?.tag === name) {
              const open = stack.pop();
              if (open && !stack.length) {
                inlineHtml.push({ from: open.from, to: tag.to });
                result.push({
                  kind: "HTML",
                  from: open.from,
                  to: tag.to,
                  source: state.doc.sliceString(open.from, tag.to),
                  references,
                });
              }
            }
          }
        }
      }
      if (/^SetextHeading/.test(node.name)) {
        const mark = node.node.getChild("HeaderMark");
        if (mark)
          result.push({
            kind: "SetextUnderline",
            from: state.doc.lineAt(mark.from).from - 1,
            to: mark.to,
            source: "",
            references: "",
            revealFrom: node.from,
          });
      }
      if (node.name === "Footnote") {
        const label = state.doc.sliceString(node.from + 2, node.to - 1);
        if (definitions.has(label)) {
          result.push({
            kind: "Footnote",
            from: node.from,
            to: node.to,
            source: label,
            label: String(numbers.get(label)),
            definition: definitions.get(label),
            references: "",
          });
        }
        return false;
      }
      if (
        node.name !== "Image" &&
        node.name !== "Math" &&
        node.name !== "DisplayMath"
      )
        return;
      let source = state.doc.sliceString(node.from, node.to);
      if (node.name === "DisplayMath") {
        if (node.node.getChildren("MathMark").length < 2) return false;
        source =
          "$$" +
          node.node
            .getChildren("MathText")
            .map((part) => state.doc.sliceString(part.from, part.to))
            .join("\n") +
          "$$";
      }
      result.push({
        from:
          node.name === "DisplayMath"
            ? state.doc.lineAt(node.from).from
            : node.from,
        to: node.to,
        kind: node.name === "DisplayMath" ? "Math" : node.name,
        source,
        references,
      });
      return false;
    },
  });
  return result;
}
function decorate(state: EditorState, previews: Preview[]): DecorationSet {
  const result: Range<Decoration>[] = [];
  for (const preview of previews) {
    if (
      state.selection.ranges.some(
        (range) =>
          range.from <= preview.to &&
          range.to >= (preview.revealFrom ?? preview.from),
      )
    )
      continue;
    if (preview.kind === "SetextUnderline") {
      result.push(Decoration.replace({}).range(preview.from, preview.to));
      continue;
    }
    result.push(
      Decoration.replace({
        widget: new MarkdownWidget(preview),
        block: preview.block ?? preview.source.includes("\n"),
      }).range(preview.from, preview.to),
    );
  }
  return Decoration.set(result, true);
}
/** Cache structural blocks across cursor moves; direct decorations may replace line breaks. */
export const blockPreviews = StateField.define<{
  previews: Preview[];
  decorations: DecorationSet;
}>({
  create(state) {
    const previews = collectPreviews(state);
    return { previews, decorations: decorate(state, previews) };
  },
  update(value, tr) {
    const changed =
      tr.docChanged ||
      syntaxTree(tr.startState) !== syntaxTree(tr.state) ||
      tr.effects.some((effect) => effect.is(refreshMarkdownContext));
    if (!changed && !tr.selection) return value;
    const previews = changed ? collectPreviews(tr.state) : value.previews;
    return { previews, decorations: decorate(tr.state, previews) };
  },
  provide: (field) =>
    EditorView.decorations.from(field, (value) => value.decorations),
});
