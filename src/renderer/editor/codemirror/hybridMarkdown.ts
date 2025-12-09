import {
  ViewPlugin,
  Decoration,
  DecorationSet,
  WidgetType,
} from "@codemirror/view";
import { Extension, Range } from "@codemirror/state";
import { renderMarkdownLines } from "../../services/markdownRenderer";

type HybridOptions = {
  onActivateLine?: (
    view: import("@codemirror/view").EditorView,
    lineNumber: number
  ) => void;
};

const defaultActivateLine = (
  view: import("@codemirror/view").EditorView,
  lineNumber: number
) => {
  const line = view.state.doc.line(lineNumber);
  view.dispatch({
    selection: { anchor: line.from },
    scrollIntoView: true,
  });
  view.focus();
};

class RenderedLineWidget extends WidgetType {
  private html: string;
  private lineNumber: number;
  private activate: (
    view: import("@codemirror/view").EditorView,
    lineNumber: number
  ) => void;

  constructor(
    html: string,
    lineNumber: number,
    activate: (
      view: import("@codemirror/view").EditorView,
      lineNumber: number
    ) => void
  ) {
    super();
    this.html = html;
    this.lineNumber = lineNumber;
    this.activate = activate;
  }

  toDOM(view: import("@codemirror/view").EditorView): HTMLElement {
    const container = document.createElement("div");
    container.className =
      "inline-editor__line inline-editor__line--rendered cm-hybrid-line";
    container.innerHTML = this.html;
    container.addEventListener("mousedown", (event) => {
      event.preventDefault();
      this.activate(view, this.lineNumber);
    });
    return container;
  }

  eq(other: RenderedLineWidget): boolean {
    return this.html === other.html && this.lineNumber === other.lineNumber;
  }
}

export const hybridMarkdown = (options?: HybridOptions): Extension => {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private activate: (
        view: import("@codemirror/view").EditorView,
        lineNumber: number
      ) => void;

      constructor(view: import("@codemirror/view").EditorView) {
        this.activate = options?.onActivateLine ?? defaultActivateLine;
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
        const docText = view.state.doc.toString();
        const renderedLines = renderMarkdownLines(docText);
        const activeLine = view.state.doc.lineAt(
          view.state.selection.main.head
        ).number;
        const decorations: Range<Decoration>[] = [];

        for (
          let lineNumber = 1;
          lineNumber <= view.state.doc.lines;
          lineNumber += 1
        ) {
          if (lineNumber === activeLine) {
            continue;
          }

          const line = view.state.doc.line(lineNumber);
          const html = renderedLines[lineNumber - 1] ?? "&nbsp;";

          const widget = Decoration.widget({
            widget: new RenderedLineWidget(html, lineNumber, this.activate),
            side: -1,
          }).range(line.from);

          const hideLine = Decoration.line({
            class: "cm-hybrid-hidden",
          }).range(line.from);

          decorations.push(widget, hideLine);
        }

        return Decoration.set(decorations, true);
      }
    },
    {
      decorations: (value) => value.decorations,
    }
  );
};
