export type FileKind = "markdown" | "text";

export function fileKind(filePath: string | null): FileKind {
  return filePath === null || /\.(?:md|markdown)$/i.test(filePath)
    ? "markdown"
    : "text";
}
