import { EventEmitter } from "events";
import { CursorPosition, ITextModel, ModelEventType } from "../../shared/types";

const NEWLINE = "\n";

export class DocumentModel extends EventEmitter implements ITextModel {
  private text: string;
  private cursorOffset = 0;
  private lastChar = 0;

  constructor(initialText: string) {
    super();
    this.text = initialText ?? "";
  }

  private getLines(): string[] {
    return this.text.length === 0 ? [""] : this.text.split(NEWLINE);
  }

  private clampLine(line: number): number {
    const lines = this.getLines();
    if (lines.length === 0) {
      return 0;
    }
    return Math.max(0, Math.min(line, lines.length - 1));
  }

  private clampPosition(position: CursorPosition): CursorPosition {
    const lines = this.getLines();
    const line = this.clampLine(position.line);
    const targetLine = lines[line] ?? "";
    const char = Math.max(0, Math.min(position.char, targetLine.length));
    return { line, char };
  }

  private positionToOffset(position: CursorPosition): number {
    const { line, char } = this.clampPosition(position);
    const lines = this.getLines();
    let offset = 0;
    for (let i = 0; i < line; i += 1) {
      offset += (lines[i]?.length ?? 0) + 1;
    }
    return Math.min(offset + char, this.text.length);
  }

  private offsetToPosition(offset: number): CursorPosition {
    const clampedOffset = Math.max(0, Math.min(offset, this.text.length));
    const lines = this.getLines();
    let remaining = clampedOffset;

    for (let i = 0; i < lines.length; i += 1) {
      const lineLength = lines[i]?.length ?? 0;
      if (remaining <= lineLength) {
        return { line: i, char: remaining };
      }
      remaining -= lineLength;
      if (remaining === 0) {
        return { line: i, char: lineLength };
      }
      // consume newline
      remaining -= 1;
    }

    const lastLineIndex = Math.max(lines.length - 1, 0);
    return {
      line: lastLineIndex,
      char: lines[lastLineIndex]?.length ?? 0,
    };
  }

  private setCursorByOffset(newOffset: number): void {
    const normalizedOffset = Math.max(0, Math.min(newOffset, this.text.length));
    if (normalizedOffset === this.cursorOffset) {
      return;
    }
    this.cursorOffset = normalizedOffset;
    const cursor = this.offsetToPosition(this.cursorOffset);
    this.lastChar = cursor.char;
    this.emit(ModelEventType.CURSOR_MOVED, cursor);
  }

  insert(line: number, index: number, text: string): void {
    const baseOffset = this.positionToOffset({ line, char: index });
    this.text =
      this.text.slice(0, baseOffset) + text + this.text.slice(baseOffset);
    const nextOffset = baseOffset + text.length;
    this.setCursorByOffset(nextOffset);
    this.emit(ModelEventType.CONTENT_CHANGED);
  }

  delete(line: number, index: number, count: number): void {
    if (count <= 0) {
      return;
    }
    const endOffset = this.positionToOffset({ line, char: index });
    const startOffset = Math.max(0, endOffset - count);
    if (startOffset === endOffset) {
      return;
    }
    this.text = this.text.slice(0, startOffset) + this.text.slice(endOffset);
    this.setCursorByOffset(startOffset);
    this.emit(ModelEventType.CONTENT_CHANGED);
  }

  getChar(line: number, char: number): string | undefined {
    const targetLine = this.getLine(line);
    return targetLine?.[char];
  }

  getLine(line: number): string | undefined {
    const lines = this.getLines();
    if (line < 0 || line >= lines.length) {
      return undefined;
    }
    return lines[line];
  }

  getAll(): string | undefined {
    return this.text;
  }

  getCursor(): CursorPosition {
    return this.offsetToPosition(this.cursorOffset);
  }

  setCursor(position: CursorPosition): void {
    const normalized = this.clampPosition(position);
    this.setCursorByOffset(this.positionToOffset(normalized));
  }

  insertChar(char: string): void {
    const cursor = this.getCursor();
    this.insert(cursor.line, cursor.char, char);
  }

  deleteChar(): void {
    const cursor = this.getCursor();
    if (cursor.char > 0 || cursor.line > 0) {
      this.delete(cursor.line, cursor.char, 1);
    }
  }

  moveCursorLeft(): void {
    this.setCursorByOffset(Math.max(0, this.cursorOffset - 1));
    this.lastChar = this.getCursor().char;
  }

  moveCursorRight(): void {
    this.setCursorByOffset(Math.min(this.text.length, this.cursorOffset + 1));
    this.lastChar = this.getCursor().char;
  }

  moveCursorUp(): void {
    const cursor = this.getCursor();
    if (cursor.line <= 0) {
      return;
    }
    const targetLine = cursor.line - 1;
    const targetChar = Math.min(
      this.lastChar,
      this.getLine(targetLine)?.length ?? 0
    );
    this.setCursor({ line: targetLine, char: targetChar });
    this.lastChar = targetChar;
  }

  moveCursorDown(): void {
    const cursor = this.getCursor();
    const lines = this.getLines();
    if (cursor.line >= lines.length - 1) {
      return;
    }
    const targetLine = cursor.line + 1;
    const targetChar = Math.min(
      this.lastChar,
      this.getLine(targetLine)?.length ?? 0
    );
    this.setCursor({ line: targetLine, char: targetChar });
    this.lastChar = targetChar;
  }

  setAll(content: string): void {
    this.text = content ?? "";
    this.cursorOffset = 0;
    this.lastChar = 0;
    const cursor = this.getCursor();
    this.emit(ModelEventType.CURSOR_MOVED, cursor);
    this.emit(ModelEventType.CONTENT_CHANGED);
  }
}
