import { EventEmitter } from "events";
import { CursorPosition, ITextModel, ModelEventType } from "../../shared/types";

type RopeNode = RopeLeaf | RopeInternal;

type RopeLeaf = {
  type: "leaf";
  text: string;
  length: number;
  lines: number;
  newlines: number[];
};

type RopeInternal = {
  type: "node";
  left: RopeNode;
  right: RopeNode;
  length: number;
  lines: number;
};

type RopeChange =
  | {
      type: "insert";
      offset: number;
      text: string;
      cursorBefore: CursorPosition;
      cursorAfter: CursorPosition;
      cursorOffsetBefore: number;
      cursorOffsetAfter: number;
    }
  | {
      type: "delete";
      offset: number;
      text: string;
      cursorBefore: CursorPosition;
      cursorAfter: CursorPosition;
      cursorOffsetBefore: number;
      cursorOffsetAfter: number;
    };

const MAX_LEAF_SIZE = 2048;

const emptyLeaf = (): RopeLeaf => ({
  type: "leaf",
  text: "",
  length: 0,
  lines: 1,
  newlines: [],
});

export class RopeModel extends EventEmitter implements ITextModel {
  private root: RopeNode = emptyLeaf();
  private cursorOffset = 0;
  private lastChar = 0;
  private undoStack: RopeChange[] = [];
  private redoStack: RopeChange[] = [];
  private historyPaused = false;

  constructor(initialText: string) {
    super();
    this.root = initialText ? this.fromText(initialText) : emptyLeaf();
  }

  // Public API ---------------------------------------------------------------
  insert(line: number, index: number, text: string): void {
    const cursorBefore = this.getCursor();
    const offset = this.cursorToOffset({ line, char: index });
    this.applyInsert(offset, text, true, cursorBefore);
  }

  delete(line: number, index: number, count: number): void {
    if (count <= 0) {
      return;
    }
    const cursorBefore = this.getCursor();
    const endOffset = this.cursorToOffset({ line, char: index });
    const startOffset = Math.max(0, endOffset - count);
    const removed = this.sliceText(startOffset, endOffset);
    if (removed.length === 0) {
      return;
    }
    this.applyDelete(startOffset, removed, true, cursorBefore);
  }

  getChar(line: number, char: number): string | undefined {
    const targetLine = this.getLine(line);
    return targetLine?.[char];
  }

  getLine(line: number): string | undefined {
    const lineCount = this.getLineCount();
    if (line < 0 || line >= lineCount) {
      return undefined;
    }
    const start = this.lineToOffset(line);
    if (start === undefined) {
      return undefined;
    }
    const end = this.getLineEndOffset(line);
    return this.sliceText(start, end);
  }

  getAll(): string | undefined {
    return this.sliceText(0, this.getLength());
  }

  setAll(content: string): void {
    this.root = content ? this.fromText(content) : emptyLeaf();
    this.cursorOffset = 0;
    this.lastChar = 0;
    this.undoStack = [];
    this.redoStack = [];
    const cursor = this.getCursor();
    this.emit(ModelEventType.CURSOR_MOVED, cursor);
    this.emit(ModelEventType.CONTENT_CHANGED);
  }

  getCursor(): CursorPosition {
    return this.offsetToCursor(this.cursorOffset);
  }

  setCursor(position: CursorPosition): void {
    const normalized = this.clampCursor(position);
    this.cursorOffset = this.cursorToOffset(normalized);
    this.lastChar = normalized.char;
    this.emit(ModelEventType.CURSOR_MOVED, normalized);
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
    if (this.cursorOffset > 0) {
      this.cursorOffset = this.cursorOffset - 1;
      const cursor = this.getCursor();
      this.lastChar = cursor.char;
      this.emit(ModelEventType.CURSOR_MOVED, cursor);
    }
  }

  moveCursorRight(): void {
    const length = this.getLength();
    if (this.cursorOffset < length) {
      this.cursorOffset = this.cursorOffset + 1;
      const cursor = this.getCursor();
      this.lastChar = cursor.char;
      this.emit(ModelEventType.CURSOR_MOVED, cursor);
    }
  }

  moveCursorUp(): void {
    const cursor = this.getCursor();
    if (cursor.line <= 0) {
      return;
    }
    const targetLine = cursor.line - 1;
    const intendedChar = this.lastChar;
    const targetChar = Math.min(intendedChar, this.getLineLength(targetLine));
    this.setCursor({ line: targetLine, char: targetChar });
    this.lastChar = intendedChar;
  }

  moveCursorDown(): void {
    const cursor = this.getCursor();
    const totalLines = this.getLineCount();
    if (cursor.line >= totalLines - 1) {
      return;
    }
    const targetLine = cursor.line + 1;
    const intendedChar = this.lastChar;
    const targetChar = Math.min(intendedChar, this.getLineLength(targetLine));
    this.setCursor({ line: targetLine, char: targetChar });
    this.lastChar = intendedChar;
  }

  // Extras (not part of ITextModel) -----------------------------------------
  undo(): void {
    const change = this.undoStack.pop();
    if (!change) return;
    this.historyPaused = true;
    if (change.type === "insert") {
      this.applyDelete(change.offset, change.text, false, change.cursorBefore);
      this.cursorOffset = change.cursorOffsetBefore;
      const cursor = this.offsetToCursor(this.cursorOffset);
      this.emit(ModelEventType.CURSOR_MOVED, cursor);
    } else {
      this.applyInsert(change.offset, change.text, false, change.cursorBefore);
      this.cursorOffset = change.cursorOffsetBefore;
      const cursor = this.offsetToCursor(this.cursorOffset);
      this.emit(ModelEventType.CURSOR_MOVED, cursor);
    }
    this.historyPaused = false;
    this.redoStack.push(change);
  }

  redo(): void {
    const change = this.redoStack.pop();
    if (!change) return;
    this.historyPaused = true;
    if (change.type === "insert") {
      this.applyInsert(change.offset, change.text, false, change.cursorAfter);
      this.cursorOffset = change.cursorOffsetAfter;
      const cursor = this.offsetToCursor(this.cursorOffset);
      this.emit(ModelEventType.CURSOR_MOVED, cursor);
    } else {
      this.applyDelete(change.offset, change.text, false, change.cursorAfter);
      this.cursorOffset = change.cursorOffsetAfter;
      const cursor = this.offsetToCursor(this.cursorOffset);
      this.emit(ModelEventType.CURSOR_MOVED, cursor);
    }
    this.historyPaused = false;
    this.undoStack.push(change);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getTextInRange(start: CursorPosition, end: CursorPosition): string {
    const startOffset = this.cursorToOffset(this.clampCursor(start));
    const endOffset = this.cursorToOffset(this.clampCursor(end));
    if (endOffset <= startOffset) {
      return "";
    }
    return this.sliceText(startOffset, endOffset);
  }

  forEachChunk(
    callback: (text: string, startOffset: number, endOffset: number) => void
  ): void {
    this.walkChunks(this.root, 0, callback);
  }

  // Internal helpers --------------------------------------------------------
  private applyInsert(
    offset: number,
    text: string,
    recordHistory: boolean,
    cursorBefore: CursorPosition
  ): void {
    if (text.length === 0) {
      return;
    }
    const middle = this.fromText(text);
    const [left, right] = this.split(this.root, offset);
    this.root = this.concat(this.concat(left, middle), right);
    this.root = this.rebalance(this.root);
    this.cursorOffset = offset + text.length;
    const cursor = this.getCursor();
    this.lastChar = cursor.char;
    this.emit(ModelEventType.CURSOR_MOVED, cursor);
    if (recordHistory && !this.historyPaused) {
      const cursorAfter = this.getCursor();
      this.recordChange({
        type: "insert",
        offset,
        text,
        cursorBefore,
        cursorAfter,
        cursorOffsetBefore: this.cursorToOffset(cursorBefore),
        cursorOffsetAfter: this.cursorOffset,
      });
    }
    this.emit(ModelEventType.CONTENT_CHANGED);
  }

  private applyDelete(
    offset: number,
    text: string,
    recordHistory: boolean,
    cursorBefore: CursorPosition
  ): void {
    if (text.length === 0) {
      return;
    }
    const length = text.length;
    const [left, midRight] = this.split(this.root, offset);
    const [, right] = this.split(midRight, length);
    this.root = this.concat(left, right);
    this.root = this.rebalance(this.root);
    this.cursorOffset = offset;
    const cursor = this.getCursor();
    this.lastChar = cursor.char;
    this.emit(ModelEventType.CURSOR_MOVED, cursor);
    if (recordHistory && !this.historyPaused) {
      const cursorAfter = this.getCursor();
      this.recordChange({
        type: "delete",
        offset,
        text,
        cursorBefore,
        cursorAfter,
        cursorOffsetBefore: this.cursorToOffset(cursorBefore),
        cursorOffsetAfter: this.cursorOffset,
      });
    }
    this.emit(ModelEventType.CONTENT_CHANGED);
  }

  private recordChange(change: RopeChange): void {
    this.undoStack.push(change);
    this.redoStack = [];
  }

  private clampCursor(position: CursorPosition): CursorPosition {
    const lineCount = this.getLineCount();
    const line = Math.max(0, Math.min(position.line, lineCount - 1));
    const char = Math.max(0, Math.min(position.char, this.getLineLength(line)));
    return { line, char };
  }

  private getLength(): number {
    return this.root.length;
  }

  private getLineCount(): number {
    return Math.max(this.root.lines, 1);
  }

  private getLineLength(line: number): number {
    const lineText = this.getLine(line);
    return lineText ? lineText.length : 0;
  }

  private getLineEndOffset(line: number): number {
    const lineCount = this.getLineCount();
    if (line < 0 || line >= lineCount) {
      return this.getLength();
    }
    if (line === lineCount - 1) {
      return this.getLength();
    }
    const newlineOffset = this.getNewlineOffset(line);
    return newlineOffset === undefined ? this.getLength() : newlineOffset;
  }

  private cursorToOffset(cursor: CursorPosition): number {
    const clamped = this.clampCursor(cursor);
    const lineStart = this.lineToOffset(clamped.line);
    if (lineStart === undefined) {
      return 0;
    }
    return Math.min(lineStart + clamped.char, this.getLength());
  }

  private offsetToCursor(offset: number): CursorPosition {
    const clampedOffset = Math.max(0, Math.min(offset, this.getLength()));
    const info = this.lineInfoAtOffset(clampedOffset);
    return {
      line: info.line,
      char: clampedOffset - info.lineStartOffset,
    };
  }

  private lineToOffset(line: number): number | undefined {
    if (line < 0 || line >= this.getLineCount()) {
      return undefined;
    }
    if (line === 0) {
      return 0;
    }
    const newlineOffset = this.getNewlineOffset(line - 1);
    if (newlineOffset === undefined) {
      return this.getLength();
    }
    return newlineOffset + 1;
  }

  private getNewlineOffset(targetIndex: number): number | undefined {
    const stack: Array<{ node: RopeNode; offset: number }> = [
      { node: this.root, offset: 0 },
    ];

    while (stack.length > 0) {
      const { node, offset } = stack.pop() as {
        node: RopeNode;
        offset: number;
      };
      if (node.type === "node") {
        stack.push({ node: node.right, offset: offset + node.left.length });
        stack.push({ node: node.left, offset });
        continue;
      }

      for (let i = 0; i < node.newlines.length; i += 1) {
        if (targetIndex === 0) {
          return offset + node.newlines[i];
        }
        targetIndex -= 1;
      }
    }

    return undefined;
  }

  private lineInfoAtOffset(offset: number): {
    line: number;
    lineStartOffset: number;
  } {
    const target = Math.max(0, Math.min(offset, this.getLength()));
    const stack: Array<{ node: RopeNode; offset: number }> = [
      { node: this.root, offset: 0 },
    ];
    let line = 0;
    let lineStartOffset = 0;

    while (stack.length > 0) {
      const { node, offset: base } = stack.pop() as {
        node: RopeNode;
        offset: number;
      };

      if (node.type === "node") {
        stack.push({ node: node.right, offset: base + node.left.length });
        stack.push({ node: node.left, offset: base });
        continue;
      }

      const nodeEnd = base + node.length;
      if (target > nodeEnd) {
        if (node.newlines.length > 0) {
          const lastNewline = node.newlines[node.newlines.length - 1];
          line += node.newlines.length;
          lineStartOffset = base + lastNewline + 1;
        }
        continue;
      }

      const relative = target - base;
      for (let i = 0; i < node.newlines.length; i += 1) {
        if (node.newlines[i] < relative) {
          line += 1;
          lineStartOffset = base + node.newlines[i] + 1;
        } else {
          break;
        }
      }
      break;
    }

    return { line, lineStartOffset };
  }

  private sliceText(start: number, end: number): string {
    const clampedStart = Math.max(0, Math.min(start, this.getLength()));
    const clampedEnd = Math.max(clampedStart, Math.min(end, this.getLength()));
    if (clampedEnd === clampedStart) {
      return "";
    }
    const chunks: string[] = [];
    this.collectText(this.root, 0, clampedStart, clampedEnd, chunks);
    return chunks.join("");
  }

  private collectText(
    node: RopeNode,
    offset: number,
    start: number,
    end: number,
    output: string[]
  ): void {
    if (node.type === "leaf") {
      const leafStart = Math.max(0, start - offset);
      const leafEnd = Math.min(node.length, end - offset);
      if (leafEnd > leafStart) {
        output.push(node.text.slice(leafStart, leafEnd));
      }
      return;
    }

    const leftEnd = offset + node.left.length;
    if (start < leftEnd) {
      this.collectText(node.left, offset, start, end, output);
    }
    if (end > leftEnd) {
      this.collectText(node.right, leftEnd, start, end, output);
    }
  }

  private walkChunks(
    node: RopeNode,
    offset: number,
    callback: (text: string, start: number, end: number) => void
  ): void {
    if (node.type === "leaf") {
      const end = offset + node.length;
      callback(node.text, offset, end);
      return;
    }
    this.walkChunks(node.left, offset, callback);
    this.walkChunks(node.right, offset + node.left.length, callback);
  }

  private fromText(text: string): RopeNode {
    if (text.length <= MAX_LEAF_SIZE) {
      return this.createLeaf(text);
    }
    const leaves: RopeLeaf[] = [];
    for (let i = 0; i < text.length; i += MAX_LEAF_SIZE) {
      const chunk = text.slice(i, i + MAX_LEAF_SIZE);
      leaves.push(this.createLeaf(chunk));
    }
    return this.buildBalanced(leaves, 0, leaves.length);
  }

  private createLeaf(text: string): RopeLeaf {
    const newlines: number[] = [];
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === "\n") {
        newlines.push(i);
      }
    }
    return {
      type: "leaf",
      text,
      length: text.length,
      lines: newlines.length + 1,
      newlines,
    };
  }

  private concat(left: RopeNode | null, right: RopeNode | null): RopeNode {
    if (!left) return right ?? emptyLeaf();
    if (!right) return left;
    return {
      type: "node",
      left,
      right,
      length: left.length + right.length,
      lines: left.lines + right.lines - 1,
    };
  }

  private split(
    node: RopeNode,
    offset: number
  ): [RopeNode | null, RopeNode | null] {
    if (offset <= 0) {
      return [null, node];
    }
    if (offset >= node.length) {
      return [node, null];
    }

    if (node.type === "leaf") {
      const leftText = node.text.slice(0, offset);
      const rightText = node.text.slice(offset);
      const leftLeaf = this.createLeaf(leftText);
      const rightLeaf = this.createLeaf(rightText);
      return [leftLeaf, rightLeaf];
    }

    if (offset < node.left.length) {
      const [leftSplit, rightSplit] = this.split(node.left, offset);
      return [leftSplit, this.concat(rightSplit, node.right)];
    }

    const [rightLeft, rightRight] = this.split(
      node.right,
      offset - node.left.length
    );
    return [this.concat(node.left, rightLeft), rightRight];
  }

  private rebalance(node: RopeNode): RopeNode {
    const leaves: RopeLeaf[] = [];
    this.collectLeaves(node, leaves);
    return this.buildBalanced(leaves, 0, leaves.length);
  }

  private collectLeaves(node: RopeNode, leaves: RopeLeaf[]): void {
    if (node.type === "leaf") {
      if (node.length === 0) {
        return;
      }
      if (node.length > MAX_LEAF_SIZE * 2) {
        // Oversized leaf: split it.
        const rebuilt = this.fromText(node.text);
        this.collectLeaves(rebuilt, leaves);
        return;
      }
      leaves.push(node);
      return;
    }
    this.collectLeaves(node.left, leaves);
    this.collectLeaves(node.right, leaves);
  }

  private buildBalanced(
    leaves: RopeLeaf[],
    start: number,
    end: number
  ): RopeNode {
    if (start >= end) {
      return emptyLeaf();
    }
    if (end - start === 1) {
      return leaves[start];
    }
    const mid = Math.floor((start + end) / 2);
    const left = this.buildBalanced(leaves, start, mid);
    const right = this.buildBalanced(leaves, mid, end);
    return this.concat(left, right);
  }
}
