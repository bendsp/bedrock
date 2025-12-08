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
import { cn } from "../lib/utils";

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

    const handleLineClick = (lineIndex: number) => {
      if (renderMode !== "hybrid") {
        return;
      }
      if (lineIndex === cursorPosition.line) {
        activeLineRef.current?.focus();
        return;
      }

      model.setCursor({ line: lineIndex, char: 0 });
    };

    const containerClass = cn(
      `inline-editor inline-editor--${renderMode}`,
      "w-full max-w-3xl mx-auto text-[color:var(--panel-text)]"
    );

    if (renderMode === "raw") {
      return (
        <div className={containerClass} ref={containerRef}>
          <textarea
            ref={rawTextareaRef}
            className="inline-editor__raw-input"
            value={text}
            onKeyDown={handleKeyDown}
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
                handleLineClick(index);
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
            spellCheck={false}
          />
        )}
      </div>
    );
  }
);

export default Editor;
