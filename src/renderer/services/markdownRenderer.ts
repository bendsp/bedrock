import MarkdownIt from "markdown-it";
import createDOMPurify from "dompurify";

const markdownParser = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
});

const maybeWindow = typeof window !== "undefined" ? window : undefined;
const domPurifyInstance = maybeWindow
    ? createDOMPurify(maybeWindow)
    : undefined;

export const renderMarkdown = (source: string | undefined): string => {
    const input = source ?? "";
    const rendered = markdownParser.render(input);

    if (!domPurifyInstance) {
        return rendered;
    }

    return domPurifyInstance.sanitize(rendered, {
        USE_PROFILES: { html: true },
    });
};

export const renderMarkdownLine = (source: string | undefined): string => {
    const html = renderMarkdown(source);
    return html.trim();
};
