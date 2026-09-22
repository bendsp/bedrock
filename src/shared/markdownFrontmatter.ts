/** YAML frontmatter is metadata only when both delimiters occur at the document start. */
export function frontmatterEnd(source: string): number {
  const match =
    /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?(?:---|\.\.\.)[ \t]*(?=\r?\n|$)/.exec(
      source,
    );
  return match?.[0].length ?? 0;
}
