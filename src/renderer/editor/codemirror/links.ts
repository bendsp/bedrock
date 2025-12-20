import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

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

    if (url) {
      // Ensure the URL has a protocol
      if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) {
        // If it looks like a relative path or doesn't have a protocol,
        // we might want to handle it differently, but for now we only
        // open absolute links.
        return;
      }
      window.electronAPI.openExternal(url);
      event.preventDefault();
      return true;
    }
  },
});
