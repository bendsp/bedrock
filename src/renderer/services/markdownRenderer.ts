import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";
import createDOMPurify from "dompurify";

export const ACTIVE_LINE_PLACEHOLDER = "__ACTIVE_LINE__PLACEHOLDER__";

type RenderOptions = {
  replacements?: Record<string, string>;
};

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const markdownParser = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

markdownParser.core.ruler.push("attach_source_line_data", (state) => {
  state.tokens.forEach((token: Token) => {
    if (token.map && token.type.endsWith("_open")) {
      token.attrSet("data-source-line", String(token.map[0]));
      token.attrSet("data-source-line-end", String(token.map[1] - 1));
    }
  });
});

const maybeWindow = typeof window !== "undefined" ? window : undefined;
const domPurifyInstance = maybeWindow
  ? createDOMPurify(maybeWindow)
  : undefined;

const applyReplacements = (
  html: string,
  replacements?: Record<string, string>
): string => {
  if (!replacements) {
    return html;
  }

  return Object.entries(replacements).reduce((output, [needle, value]) => {
    return output.split(needle).join(value);
  }, html);
};

const renderFenceDelimiter = (line: string): string => {
  const content = line.trim().length > 0 ? escapeHtml(line) : "&nbsp;";
  return `<div class="inline-editor__code-fence">${content}</div>`;
};

const renderFenceLine = (line: string, language: string): string => {
  const langClass =
    language.trim().length > 0
      ? `language-${escapeHtml(language.trim().replace(/[^\w-]/g, ""))}`
      : "";
  const content = line.length === 0 ? "&nbsp;" : escapeHtml(line);
  return `<pre class="inline-editor__codeblock"><code class="${langClass}">${content}</code></pre>`;
};

export const renderMarkdown = (
  source: string | undefined,
  options?: RenderOptions
): string => {
  const input = source ?? "";
  const rendered = markdownParser.render(input);

  const sanitized = domPurifyInstance
    ? domPurifyInstance.sanitize(rendered, { USE_PROFILES: { html: true } })
    : rendered;

  return applyReplacements(sanitized, options?.replacements);
};

export const renderMarkdownLines = (source: string | undefined): string[] => {
  const content = source ?? "";
  const lines = content.split("\n");
  const renderedLines: string[] = [];
  let inFence = false;
  let fenceLanguage = "";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = line.match(/^```(.*)?$/);

    if (fenceMatch) {
      const info = fenceMatch[1]?.trim() ?? "";
      if (!inFence) {
        inFence = true;
        fenceLanguage = info;
      } else {
        inFence = false;
        fenceLanguage = "";
      }
      renderedLines.push(renderFenceDelimiter(line));
      continue;
    }

    if (inFence) {
      renderedLines.push(renderFenceLine(line, fenceLanguage));
      continue;
    }

    const fallback = line.length === 0 ? "\u00a0" : line;
    renderedLines.push(renderMarkdown(fallback));
  }

  if (renderedLines.length === 0) {
    renderedLines.push("&nbsp;");
  }

  return renderedLines;
};

export const renderMarkdownLine = (
  source: string | undefined,
  lineIndex: number
): string => {
  const renderedLines = renderMarkdownLines(source);
  return renderedLines[lineIndex] ?? "";
};
