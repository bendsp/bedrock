import { EditorState } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import { safeMarkdownHtml } from "../../lib/markdown";
import { hydrateMarkdownImages, disposeMarkdownImages } from "../../lib/markdownImages";
import { tableCellOwners } from "./tableCellContext";

export type ImagePreview = {
  from: number;
  to: number;
  source: string;
  references: string;
  imageFrom?: number;
  imageTo?: number;
};

const report = (error: unknown) => window.dispatchEvent(new CustomEvent("bedrock:error", {
  detail: error instanceof Error ? error.message : "Unable to change this image.",
}));

const domPreviews = new WeakMap<HTMLElement, ImagePreview>();

export class ImageWidget extends WidgetType {
  constructor(readonly preview: ImagePreview, readonly selected: boolean) { super(); }
  eq(other: ImageWidget) {
    return this.selected === other.selected && this.preview.from === other.preview.from &&
      this.preview.to === other.preview.to && this.preview.source === other.preview.source &&
      this.preview.references === other.preview.references;
  }
  updateDOM(dom: HTMLElement) {
    const previous = domPreviews.get(dom);
    if (!previous || previous.from !== this.preview.from || previous.to !== this.preview.to ||
      previous.source !== this.preview.source || previous.references !== this.preview.references) return false;
    dom.classList.toggle("cm-image-selected", this.selected);
    const toolbar = dom.querySelector<HTMLElement>(".cm-image-controls");
    if (toolbar) toolbar.hidden = !this.selected;
    return true;
  }
  toDOM(view: EditorView) {
    const { from, to, source, references } = this.preview;
    const el = document.createElement("span");
    el.className = `cm-md-preview cm-md-preview-image${this.selected ? " cm-image-selected" : ""}`;
    el.contentEditable = "false";
    domPreviews.set(el, this.preview);
    el.dataset.imageFrom = String(from);
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", "Image");
    const rendered = document.createElement("span");
    rendered.className = "cm-image-content";
    rendered.innerHTML = safeMarkdownHtml(source, true, references);
    let image = rendered.querySelector("img");
    if (!image) {
      // An unresolved reference is still an image object, never editable link notation.
      image = document.createElement("img");
      image.alt = /^!\[([^\]]*)\]/.exec(source)?.[1] || "Image unavailable";
      image.className = "cm-md-image-error";
      rendered.replaceChildren(image);
    }
    const imageSource = image.getAttribute("src");
    const alt = image.alt;
    image.draggable = false;
    image.tabIndex = 0;
    image.title = "Show image controls";
    el.append(rendered);
    const select = () => {
      view.dispatch({ selection: { anchor: from, head: to } });
      view.focus();
    };
    el.addEventListener("mousedown", (event) => {
      event.stopPropagation();
      if ((event.target as Element).closest("button")) return;
      event.preventDefault();
      select();
    });
    el.addEventListener("click", (event) => event.preventDefault());
    el.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); });
    el.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        view.dispatch({ selection: { anchor: to } });
        view.focus();
      } else if (event.target === image && ["Enter", " "].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        select();
        view.dom.querySelector<HTMLElement>(`[data-image-from="${from}"] button`)?.focus();
      }
    });
    {
      const toolbar = document.createElement("span");
      toolbar.className = "cm-image-controls";
      toolbar.hidden = !this.selected;
      toolbar.setAttribute("role", "toolbar");
      toolbar.setAttribute("aria-label", "Image controls");
      const current = () => view.dom.isConnected && !view.state.facet(EditorState.readOnly) &&
        view.state.doc.sliceString(from, to) === source;
      const button = (label: string, action: () => void | Promise<void>, disabled = false) => {
        const control = document.createElement("button");
        control.type = "button";
        control.textContent = label;
        control.disabled = disabled || view.state.facet(EditorState.readOnly);
        control.addEventListener("click", (event) => {
          event.preventDefault(); event.stopPropagation();
          if (current()) void Promise.resolve(action()).catch(report);
        });
        toolbar.append(control);
      };
      button("Replace image…", async () => {
        const document = view.state.doc;
        const replacement = await window.electronAPI.chooseImage();
        if (!replacement || !current() || view.state.doc !== document) return;
        const markdown = `![${alt.replace(/[\\[\]\r\n]/g, " ")}](<${replacement.relativePath.split("/").map(encodeURIComponent).join("/")}>)`;
        const start = this.preview.imageFrom ?? from;
        const end = this.preview.imageTo ?? to;
        const original = source.slice(start - from, end - from);
        const url = replacement.relativePath.split("/").map(encodeURIComponent).join("/");
        const replacementSource = /^<img\b/i.test(original)
          ? /\ssrc\s*=/i.test(original)
            ? original.replace(/(\ssrc\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s>]+)/i, `$1"${url}"`)
            : original.replace(/^<img\b/i, `<img src="${url}"`)
          : markdown;
        const insert = source.slice(0, start - from) + replacementSource + source.slice(end - from);
        view.dispatch({ changes: { from, to, insert }, selection: { anchor: from, head: from + insert.length }, userEvent: "input.image" });
        view.focus();
      });
      button(navigator.platform.toLowerCase().includes("mac") ? "Show in Finder" : "Show in folder", async () => {
        if (imageSource) await window.electronAPI.revealImage(imageSource);
      }, !imageSource || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(imageSource));
      button("Delete image", () => {
        view.dispatch({ changes: { from, to }, selection: { anchor: from }, userEvent: "delete.image" });
        view.focus();
      });
      el.append(toolbar);
    }
    hydrateMarkdownImages(el, () => view.requestMeasure(), tableCellOwners.get(view) ?? view);
    return el;
  }
  ignoreEvent() { return true; }
  destroy(dom: HTMLElement) { disposeMarkdownImages(dom); }
}
