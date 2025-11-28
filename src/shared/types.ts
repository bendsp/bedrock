import { EventEmitter } from "events";

export interface ITextModel extends EventEmitter {
  insert(line: number, index: number, text: string): void;
  delete(line: number, index: number, count: number): void;
  getChar(line: number, char: number): string | undefined;
  getLine(line: number): string | undefined;
  getAll(): string | undefined;
  setAll(content: string): void;
  getCursor(): CursorPosition;
  setCursor(position: CursorPosition): void;
  insertChar(char: string): void;
  deleteChar(): void;
  moveCursorLeft(): void;
  moveCursorRight(): void;
  moveCursorUp(): void;
  moveCursorDown(): void;
}

export interface TextChange {
  type: "insert" | "delete";
  index: number;
  text?: string;
  length?: number;
}

export interface CursorPosition {
  line: number;
  char: number;
}

export interface SelectionRange {
  start: CursorPosition;
  end: CursorPosition;
}

export interface EditorView {
  render(text: string): void;
  setCursorPosition(position: CursorPosition): void;
}

export enum ModelEventType {
  CONTENT_CHANGED = "contentChanged",
  CURSOR_MOVED = "cursorMoved",
}

// File Operation Types
export type DiscardAction = "open" | "close" | "new";

export interface OpenFileResult {
  filePath: string;
  content: string;
}

export interface SaveFilePayload {
  filePath?: string;
  content: string;
}

export interface SaveFileResult {
  filePath: string;
}

export interface DiscardPromptPayload {
  action: DiscardAction;
  fileName?: string;
}

export interface IElectronAPI {
  openFile: () => Promise<OpenFileResult | null>;
  saveFile: (payload: SaveFilePayload) => Promise<SaveFileResult | null>;
  confirmDiscardChanges: (payload: DiscardPromptPayload) => Promise<boolean>;
  notifyDirtyState: (isDirty: boolean) => void;
}
