import { Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { toggleTaskCheckCommand } from "./commands";

class EntityWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }
  eq(other: EntityWidget) {
    return other.source === this.source;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-md-entity";
    el.innerHTML = this.source;
    return el;
  }
}
class RuleWidget extends WidgetType {
  toDOM() {
    const el = document.createElement("hr");
    el.className = "cm-md-hr-widget";
    return el;
  }
  eq() {
    return true;
  }
}
class BulletWidget extends WidgetType {
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-md-list-marker cm-md-bullet";
    el.textContent = "•";
    return el;
  }
  eq() {
    return true;
  }
}
class TaskWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly position: number,
  ) {
    super();
  }
  eq(other: TaskWidget) {
    return other.checked === this.checked && other.position === this.position;
  }
  toDOM(view: EditorView) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.className = "cm-md-checkbox";
    input.setAttribute(
      "aria-label",
      this.checked ? "Mark task incomplete" : "Mark task complete",
    );
    input.addEventListener("mousedown", (event) => event.preventDefault());
    input.addEventListener("change", () => {
      toggleTaskCheckCommand(view, this.position);
      view.focus();
    });
    return input;
  }
  ignoreEvent() {
    return true;
  }
}

const inlineClasses: Record<string, string> = {
  StrongEmphasis: "cm-md-strong",
  Emphasis: "cm-md-em",
  Strikethrough: "cm-md-strike",
  InlineCode: "cm-md-inline-code",
  Highlight: "cm-md-highlight",
  Footnote: "cm-md-footnote",
};
const markerNames = new Set([
  "EmphasisMark",
  "StrikethroughMark",
  "HighlightMark",
  "LinkMark",
  "LinkLabel",
  "LinkTitle",
]);
const opaqueNodes = new Set([
  "Table",
  "FencedCode",
  "CodeBlock",
  "Frontmatter",
  "Image",
  "Math",
  "DisplayMath",
]);
export const selectionTouches = (view: EditorView, from: number, to: number) =>
  view.state.selection.ranges.some(
    (range) => range.from <= to && range.to >= from,
  );

/** Only visit visible syntax. Selection changes never classify every document line. */
export function buildMarkdownDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const seen = new Set<string>();
  const lineClasses = new Map<number, Set<string>>();
  const quoteDepths = new Map<number, number>();
  const doc = view.state.doc;
  const mark = (from: number, to: number, className: string) => {
    if (from < to)
      decorations.push(Decoration.mark({ class: className }).range(from, to));
  };
  const activeLine = (pos: number) => {
    const line = doc.lineAt(pos);
    return selectionTouches(view, line.from, line.to);
  };
  const lineClass = (
    from: number,
    to: number,
    className: string,
    quoteDepth = 0,
  ) => {
    for (const visible of view.visibleRanges) {
      const start = Math.max(
        doc.lineAt(from).from,
        doc.lineAt(visible.from).from,
      );
      const end = Math.min(to, visible.to);
      for (let pos = start; pos <= end;) {
        const line = doc.lineAt(pos);
        const classes = lineClasses.get(line.from) ?? new Set<string>();
        classes.add(className);
        lineClasses.set(line.from, classes);
        if (quoteDepth)
          quoteDepths.set(
            line.from,
            Math.max(quoteDepth, quoteDepths.get(line.from) ?? 0),
          );
        if (line.to === doc.length) break;
        pos = line.to + 1;
      }
    }
  };
  const hide = (from: number, to: number, container: SyntaxNode) => {
    if (!selectionTouches(view, container.from, container.to))
      mark(from, to, "cm-md-hide-marker");
    else mark(from, to, "cm-md-marker");
  };
  const tree = syntaxTree(view.state);
  for (const visible of view.visibleRanges)
    tree.iterate({
      from: visible.from,
      to: visible.to,
      enter(ref) {
        const node = ref.node;
        const key = `${node.name}:${node.from}:${node.to}`;
        // Replaced blocks split visibleRanges. Shared ancestors still need traversal
        // for later ranges, even though their own decorations were already added.
        if (seen.has(key))
          return opaqueNodes.has(node.name) ? false : undefined;
        seen.add(key);
        if (node.name === "Table") {
          return false;
        }
        if (/^(ATX|Setext)Heading[1-6]$/.test(node.name)) {
          const underline = node.name.startsWith("Setext")
            ? node.getChild("HeaderMark")
            : null;
          lineClass(
            node.from,
            underline
              ? Math.max(node.from, doc.lineAt(underline.from).from - 1)
              : node.to,
            `cm-md-heading cm-md-atxheading${node.name.slice(-1)}`,
          );
        }
        if (
          node.name === "FencedCode" ||
          node.name === "CodeBlock" ||
          node.name === "Frontmatter"
        ) {
          lineClass(node.from, node.to, "cm-md-code-block");
          lineClass(node.from, doc.lineAt(node.from).to, "cm-md-code-start");
          lineClass(doc.lineAt(node.to).from, node.to, "cm-md-code-end");
          // Syntax highlighting comes from the nested code language, not Markdown decorations.
          return false;
        }
        if (node.name === "Blockquote") {
          let depth = 1;
          for (let parent = node.parent; parent; parent = parent.parent)
            if (parent.name === "Blockquote") depth++;
          lineClass(node.from, node.to, "cm-md-quote", depth);
        }
        if (node.name === "ListItem") {
          lineClass(node.from, doc.lineAt(node.from).to, "cm-md-list-item");
        }
        if (node.name === "TaskMarker") {
          const checked = /[xX]/.test(doc.sliceString(node.from, node.to));
          if (checked) {
            lineClass(
              node.from,
              doc.lineAt(node.from).to,
              "cm-md-task-checked",
            );
            mark(node.to, doc.lineAt(node.to).to, "cm-md-task-text");
          }
          if (!activeLine(node.from))
            decorations.push(
              Decoration.replace({
                widget: new TaskWidget(checked, node.from),
              }).range(node.from, node.to),
            );
          else mark(node.from, node.to, "cm-md-marker");
        }
        if (node.name === "HorizontalRule") {
          if (!activeLine(node.from))
            decorations.push(
              Decoration.replace({ widget: new RuleWidget() }).range(
                node.from,
                node.to,
              ),
            );
          else lineClass(node.from, node.to, "cm-md-hr-active");
        }
        const cls = inlineClasses[node.name];
        if (cls) mark(node.from, node.to, cls);
        if (
          node.name === "Link" ||
          node.name === "Autolink" ||
          (node.name === "URL" && node.parent?.name !== "LinkReference")
        ) {
          mark(node.from, node.to, "cm-md-link cm-link");
        }
        if (
          node.name === "Image" ||
          node.name === "Math" ||
          node.name === "DisplayMath"
        )
          return false;
        if (node.name === "FootnoteDefinition")
          lineClass(node.from, node.to, "cm-md-footnote-definition");
        if (node.name === "FootnoteMark")
          mark(node.from, node.to, "cm-md-marker");
        if (
          node.name === "Entity" &&
          !selectionTouches(view, node.from, node.to)
        )
          decorations.push(
            Decoration.replace({
              widget: new EntityWidget(doc.sliceString(node.from, node.to)),
            }).range(node.from, node.to),
          );
        if (node.name === "Escape") hide(node.from, node.from + 1, node);
        if (node.name === "HeaderMark" || node.name === "QuoteMark") {
          if (!activeLine(node.from))
            mark(node.from, node.to, "cm-md-hide-marker");
          else mark(node.from, node.to, "cm-md-marker");
        }
        if (node.name === "ListMark") {
          if (
            !activeLine(node.from) &&
            /^[-+*]$/.test(doc.sliceString(node.from, node.to))
          ) {
            if (node.parent?.getChild("Task"))
              mark(node.from, node.to, "cm-md-hide-marker");
            else
              decorations.push(
                Decoration.replace({ widget: new BulletWidget() }).range(
                  node.from,
                  node.to,
                ),
              );
          } else mark(node.from, node.to, "cm-md-list-marker");
        }
        if (node.name === "CodeMark" && node.parent?.name === "InlineCode")
          hide(node.from, node.to, node.parent);
        if (
          markerNames.has(node.name) &&
          node.parent &&
          node.parent.name !== "LinkReference"
        )
          hide(node.from, node.to, node.parent);
        if (node.name === "URL" && node.parent?.name === "Link")
          hide(node.from, node.to, node.parent);
      },
    });
  for (const [pos, classes] of lineClasses)
    decorations.push(
      Decoration.line({
        class: [...classes].join(" "),
        attributes: quoteDepths.has(pos)
          ? { style: `--quote-depth: ${quoteDepths.get(pos)}` }
          : undefined,
      }).range(pos),
    );
  return Decoration.set(decorations, true);
}
export const markdownDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildMarkdownDecorations(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      )
        this.decorations = buildMarkdownDecorations(update.view);
    }
  },
  { decorations: (value) => value.decorations },
);
