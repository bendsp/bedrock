import { EditorView } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { ThemeName } from "../../theme";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const isDarkTheme = (theme: ThemeName): boolean => theme !== "light";

export const buildThemeExtension = (
  theme: ThemeName,
  textSize: number,
): Extension => {
  const dark = isDarkTheme(theme);

  const highlight = HighlightStyle.define([
    { tag: [tags.meta, tags.contentSeparator], color: "var(--muted-text)" },
    { tag: tags.heading, fontWeight: "bold" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strong, fontWeight: "bold" },
    { tag: tags.strikethrough, textDecoration: "line-through" },
    { tag: tags.link, textDecoration: "underline" },
    { tag: tags.keyword, color: dark ? "#ff7b72" : "#cf222e" },
    {
      tag: [tags.atom, tags.bool, tags.number],
      color: dark ? "#79c0ff" : "#0550ae",
    },
    { tag: [tags.string, tags.regexp], color: dark ? "#a5d6ff" : "#0a3069" },
    { tag: [tags.comment, tags.quote], color: "var(--muted-text)" },
    {
      tag: [
        tags.definition(tags.variableName),
        tags.function(tags.variableName),
        tags.typeName,
      ],
      color: dark ? "#d2a8ff" : "#8250df",
    },
    { tag: tags.invalid, color: dark ? "#ff7b72" : "#cf222e" },
  ]);
  return [
    syntaxHighlighting(highlight),
    EditorView.theme(
      {
        "&": {
          backgroundColor: "transparent",
          color: "var(--panel-text)",
          fontSize: `${textSize}px`,
          outline: "none",
          boxShadow: "none",
        },
        "&.cm-focused": {
          outline: "none",
          boxShadow: "none",
        },
        ".cm-scroller": {
          fontFamily: "var(--editor-font-family)",
          lineHeight: 1.6,
          outline: "none",
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
      { dark },
    ),
  ];
};
