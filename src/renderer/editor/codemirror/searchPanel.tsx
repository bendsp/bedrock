import React from "react";
import { createRoot, Root } from "react-dom/client";
import { EditorView, Panel } from "@codemirror/view";
import { SearchPanel } from "../../components/SearchPanel";

export const createReactSearchPanel = (view: EditorView): Panel => {
  const dom = document.createElement("div");
  dom.className = "cm-search-panel-container";
  // Add some styles to position it nicely if needed, though CodeMirror panels usually stack
  // We might want to make it float or just let it sit in the panel area.
  // The 'top: true' config in extensions puts it above the editor.

  let root: Root | null = createRoot(dom);
  root.render(<SearchPanel view={view} />);

  return {
    dom,
    mount() {
      // already mounted via createRoot
    },
    update(update) {
       // React handles updates via internal state or if we passed props that changed.
       // Here we only pass 'view', which is stable.
       // However, if we needed to respond to view updates, we might pass them down.
       // But SearchPanel uses view.dispatch, so it's fine.
    },
    destroy() {
      if (root) {
        root.unmount();
        root = null;
      }
    },
  };
};

