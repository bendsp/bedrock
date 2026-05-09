export type DocumentStats = {
  words: number;
  chars: number;
  lines: number;
  readingMinutes: number;
};

export type SelectionStats = {
  hasSelection: boolean;
  words: number;
  chars: number;
};

const countWords = (value: string): number => {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

export const getDocumentStats = (value: string): DocumentStats => {
  const words = countWords(value);
  const chars = value.length;
  const lines = value.length === 0 ? 1 : value.split(/\r\n|\r|\n/).length;
  const readingMinutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 225));
  return { words, chars, lines, readingMinutes };
};

export const getSelectionStats = (selectedText: string): SelectionStats => {
  const chars = selectedText.length;
  return {
    hasSelection: chars > 0,
    words: countWords(selectedText),
    chars,
  };
};
