import { CursorPosition } from "../../shared/types";

export const cursorFromAbsoluteOffset = (
  content: string,
  offset: number
): CursorPosition => {
  const safeOffset = Math.max(0, Math.min(offset, content.length));
  const lines = content.split("\n");
  let remaining = safeOffset;

  for (let i = 0; i < lines.length; i += 1) {
    const lineLength = lines[i]?.length ?? 0;
    if (remaining <= lineLength) {
      return { line: i, char: remaining };
    }
    remaining -= lineLength + 1;
  }

  const lastLineIndex = Math.max(lines.length - 1, 0);
  return { line: lastLineIndex, char: lines[lastLineIndex]?.length ?? 0 };
};
