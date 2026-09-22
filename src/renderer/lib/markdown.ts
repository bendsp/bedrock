import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import highlight from "markdown-it-mark";
import tasks from "markdown-it-task-lists";
import DOMPurify from "dompurify";
import { mathPlugin } from "./markdownMath";
import { assignHeadingIds } from "./markdownHeadings";
import { frontmatterEnd } from "../../shared/markdownFrontmatter";

export type MarkdownEnvironment = Record<string, unknown> & {
  footnotes?: {
    refs: Record<string, number>;
    list: Array<{ label?: string; count?: number }>;
  };
};

export const markdownParser = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
})
  .use(footnote)
  .use(highlight)
  .use(tasks, { enabled: false })
  .use(mathPlugin);

markdownParser.core.ruler.before("normalize", "strip_bom", (state) => {
  if (state.src.startsWith("\ufeff")) state.src = state.src.slice(1);
});

markdownParser.core.ruler.push("heading_ids", (state) =>
  assignHeadingIds(state.tokens),
);
markdownParser.block.ruler.before(
  "hr",
  "frontmatter",
  (state, start, _end, silent) => {
    if (start !== 0) return false;
    const end = frontmatterEnd(state.src.slice(0, 128 * 1024));
    if (!end) return false;
    if (!silent) {
      while (state.line < state.lineMax && state.bMarks[state.line] < end)
        state.line++;
    }
    return true;
  },
);

for (const type of ["th_open", "td_open"])
  markdownParser.renderer.rules[type] = (
    tokens,
    index,
    options,
    _env,
    renderer,
  ) => {
    const token = tokens[index];
    const alignment = token
      .attrGet("style")
      ?.match(/^text-align:(left|center|right)$/)?.[1];
    if (alignment) {
      token.attrSet("align", alignment);
      token.attrs = token.attrs?.filter(([key]) => key !== "style") ?? null;
    }
    return renderer.renderToken(tokens, index, options);
  };

/** Note HTML is data: no scripts, frames, forms, event handlers or document-wide styles. */
export function safeMarkdownHtml(
  source: string,
  inline = false,
  referenceSource: string | MarkdownEnvironment = "",
): string {
  const env: MarkdownEnvironment =
    typeof referenceSource === "object" ? { ...referenceSource } : {};
  if (env.footnotes)
    env.footnotes = {
      refs: { ...env.footnotes.refs },
      list: (env.footnotes.list ?? []).map((note) => ({ ...note, count: 0 })),
    };
  if (typeof referenceSource === "string" && referenceSource)
    markdownParser.parse(referenceSource, env);
  const html = inline
    ? markdownParser.renderer.renderInline(
        markdownParser
          .parseInline(source, env)
          .find((token) => token.type === "inline")?.children ?? [],
        markdownParser.options,
        env,
      )
    : markdownParser.render(source, env);
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true },
    ADD_TAGS: ["semantics", "annotation"],
    FORBID_TAGS: [
      "style",
      "form",
      "iframe",
      "object",
      "embed",
      "video",
      "audio",
    ],
    FORBID_ATTR: ["style", "srcset", "name"],
    ALLOW_DATA_ATTR: false,
  });
}
