import { ITextModel, EditorView, RenderMode } from "../../shared/types";

type ShortcutEvent = React.KeyboardEvent<HTMLTextAreaElement>;

interface ShortcutHandler {
    when: (event: ShortcutEvent) => boolean;
    run: (event: ShortcutEvent) => void;
    preventDefault?: boolean;
}

const TAB_INDENT = "  ";

export class EditorController {
    private model: ITextModel;
    private view: EditorView;
    private shortcutHandlers: ShortcutHandler[];
    private renderMode: RenderMode = "hybrid";

    constructor(model: ITextModel, view: EditorView) {
        this.model = model;
        this.view = view;

        this.view.render(this.model.getAll() || "");

        this.shortcutHandlers = [
            {
                when: this.isTabIndent,
                run: this.handleTabIndent,
            },
            {
                when: this.isTabOutdent,
                run: this.handleTabOutdent,
            },
            {
                when: this.isBoldShortcut,
                run: () => this.insertSnippet("****", 2),
            },
            {
                when: this.isItalicShortcut,
                run: () => this.insertSnippet("**", 1),
            },
            {
                when: this.isLinkShortcut,
                run: () => this.insertSnippet("[](url)", 1),
            },
            {
                when: this.isCommandPaletteShortcut,
                run: () =>
                    console.log(
                        "[EditorController] Command palette shortcut pressed."
                    ),
            },
            {
                when: this.isToggleRenderModeShortcut,
                run: () => this.toggleRenderMode(),
            },
            {
                when: this.isEnterKey,
                run: () => this.insertText("\n"),
            },
            {
                when: this.isBackspaceKey,
                run: () => this.model.deleteChar(),
            },
            {
                when: this.isArrowLeftKey,
                run: () => this.model.moveCursorLeft(),
            },
            {
                when: this.isArrowRightKey,
                run: () => this.model.moveCursorRight(),
            },
            {
                when: this.isArrowUpKey,
                run: () => this.model.moveCursorUp(),
            },
            {
                when: this.isArrowDownKey,
                run: () => this.model.moveCursorDown(),
            },
            {
                when: this.isPrintableCharacter,
                run: (event) => this.insertText(event.key),
            },
        ];
    }

    public handleKeyDown = (event: ShortcutEvent): void => {
        for (const handler of this.shortcutHandlers) {
            if (handler.when(event)) {
                if (handler.preventDefault !== false) {
                    event.preventDefault();
                }
                handler.run(event);
                return;
            }
        }
    };

    private insertText(characters: string): void {
        this.model.insertChar(characters);
    }

    private insertSnippet(snippet: string, cursorOffset: number): void {
        const cursor = this.model.getCursor();
        this.model.insert(cursor.line, cursor.char, snippet);
        this.model.setCursor({
            line: cursor.line,
            char: cursor.char + cursorOffset,
        });
    }

    private handleTabIndent = (): void => {
        const cursor = this.model.getCursor();
        this.model.insert(cursor.line, 0, TAB_INDENT);
        this.model.setCursor({
            line: cursor.line,
            char: cursor.char + TAB_INDENT.length,
        });
    };

    private handleTabOutdent = (): void => {
        const cursor = this.model.getCursor();
        const line = this.model.getLine(cursor.line) ?? "";

        if (!line.startsWith(TAB_INDENT)) {
            return;
        }

        this.model.delete(cursor.line, TAB_INDENT.length, TAB_INDENT.length);
        this.model.setCursor({
            line: cursor.line,
            char: Math.max(cursor.char - TAB_INDENT.length, 0),
        });
    };

    private isPrintableCharacter = (event: ShortcutEvent): boolean => {
        if (event.key.length !== 1) {
            return false;
        }
        if (event.ctrlKey || event.metaKey || event.altKey) {
            return false;
        }
        return true;
    };

    private isBackspaceKey = (event: ShortcutEvent): boolean =>
        event.key === "Backspace" && !event.ctrlKey && !event.metaKey;

    private isEnterKey = (event: ShortcutEvent): boolean =>
        event.key === "Enter" && !event.ctrlKey && !event.metaKey;

    private isArrowLeftKey = (event: ShortcutEvent): boolean =>
        event.key === "ArrowLeft" && !event.ctrlKey && !event.metaKey;

    private isArrowRightKey = (event: ShortcutEvent): boolean =>
        event.key === "ArrowRight" && !event.ctrlKey && !event.metaKey;

    private isArrowUpKey = (event: ShortcutEvent): boolean =>
        event.key === "ArrowUp" && !event.ctrlKey && !event.metaKey;

    private isArrowDownKey = (event: ShortcutEvent): boolean =>
        event.key === "ArrowDown" && !event.ctrlKey && !event.metaKey;

    private isTabIndent = (event: ShortcutEvent): boolean =>
        event.key === "Tab" &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey;

    private isTabOutdent = (event: ShortcutEvent): boolean =>
        event.key === "Tab" &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey;

    private isBoldShortcut = (event: ShortcutEvent): boolean =>
        this.isModKey(event) && !event.shiftKey && this.isKey(event, "b");

    private isItalicShortcut = (event: ShortcutEvent): boolean =>
        this.isModKey(event) && !event.shiftKey && this.isKey(event, "i");

    private isLinkShortcut = (event: ShortcutEvent): boolean =>
        this.isModKey(event) && !event.shiftKey && this.isKey(event, "k");

    private isCommandPaletteShortcut = (event: ShortcutEvent): boolean =>
        this.isModKey(event) && event.shiftKey && this.isKey(event, "p");

    private isToggleRenderModeShortcut = (event: ShortcutEvent): boolean =>
        this.isModKey(event) && event.shiftKey && this.isKey(event, "m");

    private toggleRenderMode(): void {
        this.renderMode = this.renderMode === "hybrid" ? "raw" : "hybrid";
        this.view.setRenderMode(this.renderMode);
    }

    private isKey(event: ShortcutEvent, key: string): boolean {
        return event.key.toLowerCase() === key.toLowerCase();
    }

    private isModKey(event: ShortcutEvent): boolean {
        return event.metaKey || event.ctrlKey;
    }
}
