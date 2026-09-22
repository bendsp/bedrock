import type Token from "markdown-it/lib/token.mjs";

export const headingSlug = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-") || "section";

const plainText = (tokens: Token[]): string =>
  tokens
    .map((token) => {
      if (token.type === "image")
        return plainText(token.children ?? []) || token.content;
      if (["text", "code_inline", "math_inline"].includes(token.type))
        return token.content;
      if (["softbreak", "hardbreak"].includes(token.type)) return " ";
      return "";
    })
    .join("");

/** Shared by exported anchors and in-editor navigation, including duplicate headings. */
export function assignHeadingIds(tokens: Token[]): void {
  const used = new Set<string>();
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== "heading_open") continue;
    const base = headingSlug(plainText(tokens[index + 1]?.children ?? []));
    let id = base,
      suffix = 0;
    while (used.has(id)) id = `${base}-${++suffix}`;
    used.add(id);
    // Prefix generated IDs to avoid DOM clobbering names such as "title".
    token.attrSet("id", `heading-${id}`);
  }
  const rewriteLinks = (children: Token[]) => {
    for (const token of children) {
      const href = token.type === "link_open" ? token.attrGet("href") : null;
      if (href?.startsWith("#")) {
        try {
          const id = headingSlug(decodeURIComponent(href.slice(1)));
          if (used.has(id)) token.attrSet("href", `#heading-${id}`);
        } catch {
          /* Leave malformed fragments as inert links. */
        }
      }
      if (token.children) rewriteLinks(token.children);
    }
  };
  rewriteLinks(tokens);
}
