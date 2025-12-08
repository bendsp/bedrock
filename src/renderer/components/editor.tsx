import React, {
  useState,
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
  useMemo,
} from "react";
import {
  CursorPosition,
  EditorView,
  ITextModel,
  ModelEventType,
  RenderMode,
} from "../../shared/types";
import { renderMarkdownLines } from "../services/markdownRenderer";

interface EditorProps {
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  model: ITextModel;
}

const absoluteIndexToCursor = (
  absoluteIndex: number,
  contentLines: string[]
): CursorPosition => {
  const normalizedIndex = Math.max(0, absoluteIndex);
  let remaining = normalizedIndex;

  for (let line = 0; line < contentLines.length; line += 1) {
    const lineLength = contentLines[line]?.length ?? 0;
    if (remaining <= lineLength) {
      return { line, char: remaining };
    }
    remaining -= lineLength + 1; // account for newline
  }

  const lastLineIndex = Math.max(contentLines.length - 1, 0);
  return {
    line: lastLineIndex,
    char: contentLines[lastLineIndex]?.length ?? 0,
  };
};

const Editor = forwardRef<EditorView, EditorProps>(
  ({ onKeyDown, model }, ref) => {
    const [text, setText] = useState<string>("");
    const [cursorPosition, setCursorPosition] = useState<CursorPosition>({
      line: 0,
      char: 0,
    });
    const [renderMode, setRenderModeState] = useState<RenderMode>("hybrid");

    const activeLineRef = useRef<HTMLTextAreaElement>(null);
    const rawTextareaRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const measurementRef = useRef<HTMLDivElement | null>(null);

    useEffect(
      () => () => {
        if (measurementRef.current) {
          measurementRef.current.remove();
          measurementRef.current = null;
        }
      },
      []
    );

    useEffect(() => {
      if (renderMode === "hybrid") {
        activeLineRef.current?.focus();
      } else {
        rawTextareaRef.current?.focus();
      }
    }, [renderMode]);

    useEffect(() => {
      const handleContentChange = () => {
        const newText = model.getAll() ?? "";
        setText(newText);
      };

      const handleCursorChange = (newPos: CursorPosition) => {
        setCursorPosition(newPos);
      };

      setText(model.getAll() ?? "");
      setCursorPosition(model.getCursor());

      model.on(ModelEventType.CONTENT_CHANGED, handleContentChange);
      model.on(ModelEventType.CURSOR_MOVED, handleCursorChange);

      return () => {
        model.off(ModelEventType.CONTENT_CHANGED, handleContentChange);
        model.off(ModelEventType.CURSOR_MOVED, handleCursorChange);
      };
    }, [model]);

    const lines = useMemo(() => text.split("\n"), [text]);
    const renderedLines = useMemo(() => renderMarkdownLines(text), [text]);

    useEffect(() => {
      if (renderMode === "hybrid") {
        const textarea = activeLineRef.current;
        if (!textarea) {
          return;
        }
        const position = Math.min(cursorPosition.char, textarea.value.length);
        textarea.setSelectionRange(position, position);
      } else {
        const textarea = rawTextareaRef.current;
        if (!textarea) {
          return;
        }
        let absoluteIndex = 0;
        for (let i = 0; i < cursorPosition.line; i++) {
          absoluteIndex += (lines[i]?.length ?? 0) + 1;
        }
        absoluteIndex += cursorPosition.char;
        absoluteIndex = Math.min(absoluteIndex, textarea.value.length);
        textarea.setSelectionRange(absoluteIndex, absoluteIndex);
      }
    }, [cursorPosition, renderMode, lines]);

    useEffect(() => {
      if (renderMode === "hybrid") {
        activeLineRef.current?.focus();
      } else {
        rawTextareaRef.current?.focus();
      }
    }, [cursorPosition.line, renderMode]);

    useImperativeHandle(ref, () => ({
      render: (newText: string) => {
        setText(newText);
      },
      setCursorPosition: (newPos: CursorPosition) => {
        setCursorPosition(newPos);
      },
      setRenderMode: (mode: RenderMode) => {
        setRenderModeState(mode);
      },
    }));

    const ensureMeasurementElement = (
      sourceElement: HTMLElement
    ): HTMLDivElement => {
      if (measurementRef.current) {
        return measurementRef.current;
      }
      const element = document.createElement("div");
      element.style.position = "fixed";
      element.style.top = "-10000px";
      element.style.left = "-10000px";
      element.style.opacity = "0";
      element.style.pointerEvents = "none";
      element.style.whiteSpace = "pre-wrap";
      element.style.wordBreak = "break-word";
      element.style.padding = "0";
      element.style.margin = "0";
      element.style.zIndex = "-1";
      const computed = window.getComputedStyle(sourceElement);
      element.style.font = computed.font;
      element.style.lineHeight = computed.lineHeight;
      document.body.appendChild(element);
      measurementRef.current = element;
      return element;
    };

    const syncMeasurementStyles = (
      measurement: HTMLDivElement,
      sourceElement: HTMLElement
    ) => {
      const computed = window.getComputedStyle(sourceElement);
      const rect = sourceElement.getBoundingClientRect();
      measurement.style.font = computed.font;
      measurement.style.fontSize = computed.fontSize;
      measurement.style.fontWeight = computed.fontWeight;
      measurement.style.lineHeight = computed.lineHeight;
      measurement.style.letterSpacing = computed.letterSpacing;
      measurement.style.padding = computed.padding;
      measurement.style.border = computed.border;
      measurement.style.boxSizing = computed.boxSizing;
      measurement.style.width = `${rect.width}px`;
    };

    const getCharIndexFromClick = (
      event: React.MouseEvent<HTMLDivElement>,
      lineText: string
    ): number => {
      const measurement = ensureMeasurementElement(event.currentTarget);
      syncMeasurementStyles(measurement, event.currentTarget);

      measurement.textContent = lineText.length > 0 ? lineText : "\u00a0";

      const sourceRect = event.currentTarget.getBoundingClientRect();
      const measurementRect = measurement.getBoundingClientRect();
      const relativeX = event.clientX - sourceRect.left;
      const relativeY = event.clientY - sourceRect.top;

      const pointX =
        measurementRect.left +
        Math.max(0, Math.min(relativeX, sourceRect.width));
      const pointY = measurementRect.top + Math.max(0, relativeY);

      const textNode = measurement.firstChild as Text | null;
      const length = lineText.length;

      const range =
        typeof document.caretRangeFromPoint === "function"
          ? document.caretRangeFromPoint(pointX, pointY)
          : null;

      if (range && measurement.contains(range.startContainer)) {
        if (range.startContainer === textNode) {
          return Math.min(Math.max(range.startOffset, 0), length);
        }
        if (range.startContainer === measurement && textNode) {
          const offset = range.startOffset >= 1 ? textNode.data.length : 0;
          return Math.min(Math.max(offset, 0), length);
        }
      }

      const fallbackRange = (
        document as Document & {
          caretPositionFromPoint?: (
            x: number,
            y: number
          ) => { offset: number; offsetNode: Node } | null;
        }
      ).caretPositionFromPoint?.(pointX, pointY);

      if (fallbackRange && measurement.contains(fallbackRange.offsetNode)) {
        if (fallbackRange.offsetNode === textNode) {
          return Math.min(Math.max(fallbackRange.offset, 0), length);
        }
        if (fallbackRange.offsetNode === measurement && textNode) {
          const offset = fallbackRange.offset >= 1 ? textNode.data.length : 0;
          return Math.min(Math.max(offset, 0), length);
        }
      }

      const clampedRatio =
        sourceRect.width > 0
          ? Math.min(Math.max(relativeX / sourceRect.width, 0), 1)
          : 0;
      return Math.floor(clampedRatio * length);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      onKeyDown?.(event);
    };

    const handleRenderedLineMouseDown = (
      event: React.MouseEvent<HTMLDivElement>,
      lineIndex: number
    ) => {
      if (renderMode !== "hybrid") {
        return;
      }
      event.preventDefault();
      const targetLine = lines[lineIndex] ?? "";
      const charIndex = getCharIndexFromClick(event, targetLine);
      model.setCursor({ line: lineIndex, char: charIndex });
    };

    const syncActiveLineCursor = (
      event: React.SyntheticEvent<HTMLTextAreaElement>
    ) => {
      if (renderMode !== "hybrid") {
        return;
      }
      const nextChar = event.currentTarget.selectionStart ?? 0;
      model.setCursor({ line: cursorPosition.line, char: nextChar });
    };

    const syncRawCursor = (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
      if (renderMode !== "raw") {
        return;
      }
      const start = event.currentTarget.selectionStart ?? 0;
      const newCursor = absoluteIndexToCursor(start, lines);
      model.setCursor(newCursor);
    };

    const containerClass = `inline-editor inline-editor--${renderMode}`;

    if (renderMode === "raw") {
      return (
        <div className={containerClass} ref={containerRef}>
          <textarea
            ref={rawTextareaRef}
            className="inline-editor__raw-input"
            value={text}
            onKeyDown={handleKeyDown}
            onSelect={syncRawCursor}
            onClick={syncRawCursor}
            spellCheck={false}
            placeholder="Start typing…"
          />
        </div>
      );
    }

    return (
      <div className={containerClass} ref={containerRef}>
        {lines.map((line, index) => {
          const key = index;
          if (index === cursorPosition.line) {
            return (
              <textarea
                key={key}
                ref={activeLineRef}
                className="inline-editor__line inline-editor__line--active"
                value={line}
                rows={1}
                onKeyDown={handleKeyDown}
                onSelect={syncActiveLineCursor}
                onClick={syncActiveLineCursor}
                spellCheck={false}
                onFocus={(event) => {
                  event.currentTarget.setSelectionRange(
                    cursorPosition.char,
                    cursorPosition.char
                  );
                }}
              />
            );
          }

          const html = renderedLines[index] ?? "&nbsp;";
          const safeHtml = html.trim().length > 0 ? html : "&nbsp;";
          const hasContent = safeHtml.trim().length > 0;

          return (
            <div
              key={key}
              className="inline-editor__line inline-editor__line--rendered"
              onMouseDown={(event) => handleRenderedLineMouseDown(event, index)}
              dangerouslySetInnerHTML={{
                __html: hasContent ? safeHtml : "<span>&nbsp;</span>",
              }}
            />
          );
        })}
        {lines.length === 0 && (
          <textarea
            ref={activeLineRef}
            className="inline-editor__line inline-editor__line--active"
            value=""
            rows={1}
            onKeyDown={handleKeyDown}
            onSelect={syncActiveLineCursor}
            onClick={syncActiveLineCursor}
            spellCheck={false}
          />
        )}
      </div>
    );
  }
);

export default Editor;
