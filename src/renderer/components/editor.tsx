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
import { cursorFromAbsoluteOffset } from "../utils/cursor";

interface EditorProps {
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  model: ITextModel;
}

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

    useEffect(() => {
      return () => {
        if (measurementRef.current) {
          measurementRef.current.remove();
          measurementRef.current = null;
        }
      };
    }, []);

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

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      onKeyDown?.(event);
    };

    const ensureMeasurementElement = (
      sourceElement: HTMLElement
    ): HTMLDivElement => {
      if (measurementRef.current) {
        return measurementRef.current;
      }

      const element = document.createElement("div");
      element.style.position = "fixed";
      element.style.top = "0";
      element.style.left = "0";
      element.style.visibility = "hidden";
      element.style.pointerEvents = "none";
      element.style.whiteSpace = "pre-wrap";
      element.style.wordBreak = "break-word";
      element.style.padding = "0";
      element.style.margin = "0";

      const computed = window.getComputedStyle(sourceElement);
      element.style.font = computed.font;
      element.style.lineHeight = computed.lineHeight;
      element.style.letterSpacing = computed.letterSpacing;

      document.body.appendChild(element);
      measurementRef.current = element;
      return element;
    };

    const resolveRangeFromPoint = (
      x: number,
      y: number,
      container: HTMLElement
    ): Range | null => {
      const doc = document as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
        caretPositionFromPoint?: (
          x: number,
          y: number
        ) => { offsetNode: Node; offset: number } | null;
      };

      const range = doc.caretRangeFromPoint?.(x, y);
      if (range && container.contains(range.startContainer)) {
        return range;
      }

      const caretPosition = doc.caretPositionFromPoint?.(x, y);
      if (caretPosition && container.contains(caretPosition.offsetNode)) {
        const fallback = document.createRange();
        fallback.setStart(caretPosition.offsetNode, caretPosition.offset);
        fallback.collapse(true);
        return fallback;
      }

      return null;
    };

    const getLineCharFromClick = (
      event: React.MouseEvent<HTMLElement>,
      lineText: string
    ): number => {
      const target = event.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const relativeX = event.clientX - rect.left;
      const relativeY = event.clientY - rect.top;
      const measurement = ensureMeasurementElement(target);
      const computed = window.getComputedStyle(target);

      measurement.style.font = computed.font;
      measurement.style.lineHeight = computed.lineHeight;
      measurement.style.letterSpacing = computed.letterSpacing;
      measurement.style.whiteSpace = computed.whiteSpace;
      measurement.style.wordBreak = computed.wordBreak;
      measurement.style.padding = computed.padding;
      measurement.style.margin = computed.margin;
      measurement.style.width = `${rect.width}px`;
      measurement.textContent = lineText.length > 0 ? lineText : "\u00a0";

      const measureRect = measurement.getBoundingClientRect();
      const range = resolveRangeFromPoint(
        measureRect.left + relativeX,
        measureRect.top + relativeY,
        measurement
      );

      const textLength = measurement.textContent?.length ?? 0;
      const clampToLine = (value: number) =>
        Math.max(0, Math.min(value, lineText.length));
      if (!range || !measurement.contains(range.startContainer)) {
        if (rect.width <= 0) {
          return 0;
        }
        const proportional = Math.round((relativeX / rect.width) * textLength);
        return clampToLine(
          Math.max(0, Math.min(textLength, proportional))
        );
      }

      if (range.startContainer.nodeType === Node.TEXT_NODE) {
        return clampToLine(
          Math.max(0, Math.min(range.startOffset, textLength))
        );
      }

      return clampToLine(textLength);
    };

    const handleActiveLineSelect = (
      event: React.SyntheticEvent<HTMLTextAreaElement>
    ) => {
      const selectionStart = event.currentTarget.selectionStart ?? 0;
      if (selectionStart !== cursorPosition.char) {
        model.setCursor({
          line: cursorPosition.line,
          char: selectionStart,
        });
      }
    };

    const handleRawSelectionChange = (
      event: React.SyntheticEvent<HTMLTextAreaElement>
    ) => {
      const selectionStart = event.currentTarget.selectionStart ?? 0;
      const nextCursor = cursorFromAbsoluteOffset(
        event.currentTarget.value,
        selectionStart
      );
      model.setCursor(nextCursor);
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
            onSelect={handleRawSelectionChange}
            onClick={handleRawSelectionChange}
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
                onSelect={handleActiveLineSelect}
                onClick={handleActiveLineSelect}
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
              onMouseDown={(event) => {
                event.preventDefault();
                const nextChar = getLineCharFromClick(
                  event,
                  lines[index] ?? ""
                );
                model.setCursor({ line: index, char: nextChar });
              }}
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
            onSelect={handleActiveLineSelect}
            onClick={handleActiveLineSelect}
            spellCheck={false}
          />
        )}
      </div>
    );
  }
);

export default Editor;
