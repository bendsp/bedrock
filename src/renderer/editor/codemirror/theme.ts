import { EditorView } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { ThemeName } from "../../theme";

const isDarkTheme = (theme: ThemeName): boolean => theme !== "light";

export const buildThemeExtension = (
  theme: ThemeName,
  textSize: number
): Extension => {
  const dark = isDarkTheme(theme);

  return EditorView.theme(
    {
      "&": {
        backgroundColor: "transparent",
        color: "var(--panel-text)",
        fontSize: `${textSize}px`,
      },
      ".cm-scroller": {
        fontFamily:
          '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        lineHeight: 1.6,
      },
      ".cm-content": {
        padding: "16px 0",
        caretColor: "var(--panel-text)",
      },
      ".cm-line": {
        padding: "2px 0",
      },
      ".cm-activeLine": {
        backgroundColor:
          "color-mix(in srgb, var(--panel-border) 25%, transparent)",
      },
      ".cm-selectionBackground": {
        backgroundColor:
          "color-mix(in srgb, var(--ui-primary) 35%, transparent)",
      },
      ".cm-gutters": {
        backgroundColor: "transparent",
        color: "var(--muted-text)",
        border: "none",
      },
      ".cm-activeLineGutter": {
        backgroundColor:
          "color-mix(in srgb, var(--panel-border) 40%, transparent)",
        color: "var(--panel-text)",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        padding: "0 8px 0 0",
      },
      ".cm-tooltip": {
        backgroundColor: "var(--panel-bg)",
        color: "var(--panel-text)",
        border: "1px solid var(--panel-border)",
      },
      ".cm-tooltip-autocomplete": {
        "& > ul > li[aria-selected]": {
          backgroundColor:
            "color-mix(in srgb, var(--ui-primary) 20%, transparent)",
          color: "var(--panel-text)",
        },
      },
    },
    { dark }
  );
};
