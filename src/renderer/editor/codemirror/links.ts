import { tableCellOwners } from "./tableCellContext";
import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { markdownParser } from "../../lib/markdown";
import { headingSlug } from "../../lib/markdownHeadings";
import { getMarkdownContext } from "./markdownContext";

export function revealHeading(view: EditorView, fragment: string): boolean {
  let slug: string;
  try {
    slug = headingSlug(decodeURIComponent(fragment.slice(1)));
  } catch {
    return false;
  }
  const headings = markdownParser
    .parse(view.state.doc.toString(), {})
    .filter((token) => token.type === "heading_open");
  const heading =
    headings.find((token) => token.attrGet("id") === `heading-${slug}`) ??
    headings.find((token) => token.attrGet("id") === slug);
  if (!heading?.map) return false;
  const anchor = view.state.doc.line(heading.map[0] + 1).from;
  view.dispatch({
    selection: { anchor },
    effects: EditorView.scrollIntoView(anchor, { y: "start" }),
  });
  view.focus();
  return true;
}

export function followMarkdownLink(view: EditorView, href: string): boolean {
  const documentView = tableCellOwners.get(view) ?? view;
  if (href.startsWith("#")) return revealHeading(documentView, href);
  const operation = /^(?:https?:|mailto:)/i.test(href)
    ? window.electronAPI.openExternal(href)
    : window.electronAPI.openNoteLink(href);
  void operation.catch((error) =>
    window.dispatchEvent(
      new CustomEvent("bedrock:error", {
        detail:
          error instanceof Error ? error.message : "Unable to open this link.",
      }),
    ),
  );
  return true;
}

export function followRenderedLink(
  event: MouseEvent,
  view: EditorView,
): boolean {
  if (!event.metaKey && !event.ctrlKey) return false;
  const target = event.target;
  const link = target instanceof Element ? target.closest("a") : null;
  const href = link?.getAttribute("href");
  if (!href) return false;
  event.preventDefault();
  if (link?.closest(".footnote-ref")) {
    const documentView = tableCellOwners.get(view) ?? view;
    const { definitions, numbers } = getMarkdownContext(documentView.state);
    const number = Number(/^#fn(\d+)$/.exec(href)?.[1]);
    const label = [...numbers].find(([, value]) => value === number)?.[0];
    const anchor = label ? definitions.get(label) : undefined;
    if (anchor !== undefined) {
      documentView.dispatch({ selection: { anchor }, scrollIntoView: true });
      documentView.focus();
    }
    return true;
  }
  followMarkdownLink(view, href);
  return true;
}

export function sourceLink(
  view: EditorView,
  pos = view.state.selection.main.head,
): string | null {
  let node = syntaxTree(view.state).resolveInner(pos, 1);
  while (node.parent && !["Link", "Autolink", "URL"].includes(node.name))
    node = node.parent;
  if (!["Link", "Autolink", "URL"].includes(node.name)) return null;
  if (node.name === "URL" && node.parent?.name === "Link") node = node.parent;
  const documentView = tableCellOwners.get(view) ?? view;
  const env = {
    references: getMarkdownContext(documentView.state).environment.references,
  };
  const tokens =
    markdownParser.parseInline(
      view.state.doc.sliceString(node.from, node.to),
      env,
    )[0]?.children ?? [];
  return (
    tokens.find((token) => token.type === "link_open")?.attrGet("href") ?? null
  );
}

export function followSourceLink(view: EditorView): boolean {
  const href = sourceLink(view);
  return href ? followMarkdownLink(view, href) : false;
}
export const linkClickHandler = EditorView.domEventHandlers({
  click: (event, view) => {
    // A normal click edits the link; the platform modifier follows it.
    if (!event.metaKey && !event.ctrlKey) return false;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.closest(".cm-link"))
      return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;
    const href = sourceLink(view, pos);
    if (!href) return false;
    event.preventDefault();
    return followMarkdownLink(view, href);
  },
});
