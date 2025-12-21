import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";

const normalizeUrlForExternalOpen = (raw: string): string | null => {
  const url = raw.trim();
  if (!url) return null;

  // Already has a protocol (https, http, mailto, etc.)
  if (/^[a-z][\w+.-]*:\/\//i.test(url) || /^mailto:/i.test(url)) {
    return url;
  }

  // Protocol-relative URLs like //example.com
  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  // Looks like a bare domain (with optional path/query)
  const domainLike = /^[\w.-]+\.[a-z]{2,}(?:[/?#].*)?$/i;
  if (domainLike.test(url)) {
    return `https://${url}`;
  }

  return null;
};

/**
 * An extension that makes links in the editor clickable.
 * It identifies elements with the `cm-link` class (added by hybridMarkdown)
 * and opens their URL via the Electron API when clicked.
 */
export const linkClickHandler = EditorView.domEventHandlers({
  click: (event, view) => {
    const target = event.target as HTMLElement;

    // Check if the clicked element or its parent has the cm-link class
    const linkElement = target.closest(".cm-link");
    if (!linkElement) {
      return;
    }

    const pos = view.posAtDOM(linkElement);
    const tree = syntaxTree(view.state);
    let node = tree.resolveInner(pos, 1);

    // Find the Link or URL node
    while (node && node.name !== "Link" && node.name !== "URL") {
      if (!node.parent) break;
      node = node.parent;
    }

    if (!node) return;

    let url = "";
    if (node.name === "URL") {
      url = view.state.doc.sliceString(node.from, node.to);
    } else if (node.name === "Link") {
      const urlNode = node.getChild("URL");
      if (urlNode) {
        url = view.state.doc.sliceString(urlNode.from, urlNode.to);
      }
    }

    const normalized = normalizeUrlForExternalOpen(url);
    if (normalized) {
      window.electronAPI.openExternal(normalized);
      event.preventDefault();
      return true;
    }
  },
});
