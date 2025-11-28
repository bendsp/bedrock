import React, {
  useState,
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
} from "react";
import {
  CursorPosition,
  EditorView,
  ITextModel,
  ModelEventType,
} from "../../shared/types";

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

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Initial focus on mount
    useEffect(() => {
      textareaRef.current?.focus();
    }, []);

    useEffect(() => {
      const handleContentChange = () => {
        const newText = model.getAll();
        // console.log("View: handleContentChange - setting text to:", newText);
        setText(newText);
      };

      const handleCursorChange = (newPos: CursorPosition) => {
        // console.log("View: handleCursorChange - setting cursor to:", newPos);
        setCursorPosition(newPos);
      };

      setText(model.getAll());
      setCursorPosition(model.getCursor());

      model.on(ModelEventType.CONTENT_CHANGED, handleContentChange);
      model.on(ModelEventType.CURSOR_MOVED, handleCursorChange);

      return () => {
        model.off(ModelEventType.CONTENT_CHANGED, handleContentChange);
        model.off(ModelEventType.CURSOR_MOVED, handleCursorChange);
      };
    }, [model]);

    useEffect(() => {
      if (textareaRef.current) {
        const textarea = textareaRef.current;
        const currentTextValue = textarea.value;

        let pos = 0;
        const lines = currentTextValue.split("\n");

        for (let i = 0; i < cursorPosition.line && i < lines.length; i++) {
          pos += lines[i].length + 1;
        }
        pos += cursorPosition.char;

        pos = Math.min(pos, currentTextValue.length);

        textarea.setSelectionRange(pos, pos);
      }
    }, [cursorPosition, text]);

    useImperativeHandle(ref, () => ({
      render: (newText: string) => {
        setText(newText);
      },
      setCursorPosition: (newPos: CursorPosition) => {
        setCursorPosition(newPos);
      },
    }));

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      onKeyDown?.(event);
    };

    return (
      <textarea
        ref={textareaRef}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          padding: "20px",
          fontSize: "16px",
          fontFamily: "monospace",
          outline: "none",
          backgroundColor: "#282c34",
          color: "#abb2bf",
          resize: "none",
          boxSizing: "border-box",
        }}
        value={text}
        onKeyDown={handleKeyDown}
        placeholder="Start typing here..."
      />
    );
  }
);

export default Editor;
