import { syntaxTree } from "@codemirror/language";
import {
  activeTableCell,
  tableCellOwners,
} from "../editor/codemirror/tableCellContext";
import {
  insertTable,
  tableCommand,
  tableAt,
} from "../editor/codemirror/tables";
import { undo, redo } from "@codemirror/commands";
import { openSearchPanel, closeSearchPanel } from "@codemirror/search";
import type { EditorView, KeyBinding } from "@codemirror/view";
import {
  headingCommand,
  insertImageCommand,
  insertFootnoteCommand,
  createSnippetCommand,
  createMarkdownLinkCommand,
  createWrapSelectionOrWordCommand,
  insertHorizontalRuleCommand,
  toggleBlockquoteCommand,
  toggleTaskCheckCommand,
  toggleFencedCodeBlockCommand,
  toggleOrderedListCommand,
  toggleTaskListCommand,
  toggleUnorderedListCommand,
} from "../editor/codemirror/commands";
import {
  bindingToCodeMirrorKey,
  formatBindingShortcut,
  normalizeBinding,
} from "../keybindings";
import type { KeyBindingAction, UserSettings } from "../settings";
import {
  isThemeName,
  ThemeName,
  themeOptions,
  themeDisplayName,
} from "../theme";
import { followSourceLink, sourceLink } from "../editor/codemirror/links";

export type CommandId = keyof CommandArgs;

export type CommandArgs = {
  "app.commandPalette": void;
  "file.quickOpen": void;
  "insert.attachImages": { files: File[] } | undefined;
  "insert.pasteImage": void;
  "format.heading1": void;
  "format.heading2": void;
  "format.heading3": void;
  "format.heading4": void;
  "format.heading5": void;
  "format.heading6": void;
  "format.paragraph": void;
  "format.highlight": void;
  "insert.image": void;
  "insert.table": void;
  "insert.footnote": void;
  "insert.math": void;
  "insert.frontmatter": void;
  "table.row.add": void;
  "table.row.addAbove": void;
  "table.row.delete": void;
  "table.row.moveUp": void;
  "table.row.moveDown": void;
  "table.column.add": void;
  "table.column.addLeft": void;
  "table.column.delete": void;
  "table.column.moveLeft": void;
  "table.column.moveRight": void;
  "table.delete": void;
  "table.align.left": void;
  "table.align.center": void;
  "table.align.right": void;
  "table.format": void;
  "file.new": void;
  "file.open": void;
  "file.save": void;
  "file.saveAs": void;
  "app.openSettings": void;
  "format.bold": void;
  "format.italic": void;
  "format.strikethrough": void;
  "format.inlineCode": void;
  "insert.link": void;
  "insert.horizontalRule": void;
  "insert.unorderedList": void;
  "insert.orderedList": void;
  "insert.taskList": void;
  "insert.taskCheck": void;
  "insert.blockquote": void;
  "insert.codeBlock": void;
  "theme.set": { theme: ThemeName };
  "editor.undo": void;
  "editor.redo": void;
  "editor.find": void;
  "editor.followLink": void;
  "file.exportHtml": void;
  "file.exportPdf": void;
} & { [Theme in ThemeName as `theme.${Theme}`]: void };

export type CommandCategory =
  "File" | "App" | "Format" | "Insert" | "Theme" | "Edit" | "Table";

type CommandMetadata = {
  title: string;
  category: CommandCategory;
  description?: string;
  defaultBinding?: string;
  alternateBindings?: readonly string[];
  settingsKey?: KeyBindingAction;
  requiresEditor?: boolean;
  isGlobal?: boolean;
};
export type CommandDefinition = CommandMetadata &
  (
    | {
        id: Exclude<CommandId, "theme.set" | "insert.attachImages">;
        run: (ctx: CommandRunContext, args: void) => boolean | Promise<boolean>;
      }
    | {
        id: "insert.attachImages";
        run: (
          ctx: CommandRunContext,
          args: { files: File[] } | undefined,
        ) => boolean | Promise<boolean>;
      }
    | {
        id: "theme.set";
        run: (
          ctx: CommandRunContext,
          args: { theme: ThemeName },
        ) => boolean | Promise<boolean>;
      }
  );

export type CommandRunContext = {
  getEditorView: () => EditorView | null;
  newFile: () => Promise<void>;
  openFile: () => Promise<void>;
  saveFile: () => Promise<void>;
  saveFileAs: () => Promise<void>;
  openSettings: () => void;
  openCommandPalette: () => void;
  quickOpen: () => void;
  attachImages: (
    view: EditorView,
    source:
      | { kind: "clipboard" }
      | { kind: "files"; files: File[] }
      | { kind: "choose" },
  ) => Promise<void>;
  setTheme: (theme: ThemeName) => void;
  exportFile: (format: "html" | "pdf") => Promise<void>;
};

export type CommandRegistry = {
  get: (id: CommandId) => CommandDefinition;
  list: () => CommandDefinition[];
};

const byId = <T extends CommandDefinition>(
  commands: T[],
): Map<CommandId, T> => {
  const map = new Map<CommandId, T>();
  for (const cmd of commands) {
    if (map.has(cmd.id)) {
      throw new Error(`Duplicate command id: ${cmd.id}`);
    }
    map.set(cmd.id, cmd);
  }
  return map;
};

// Editor commands (single implementation used by keymap + context menu)
const editorCommands = {
  bold: createWrapSelectionOrWordCommand({
    before: "**",
    after: "**",
    nodeName: "StrongEmphasis",
    emptySnippet: "****",
    emptyCursorOffset: 2,
  }),
  italic: createWrapSelectionOrWordCommand({
    before: "*",
    after: "*",
    nodeName: "Emphasis",
    emptySnippet: "**",
    emptyCursorOffset: 1,
  }),
  strikethrough: createWrapSelectionOrWordCommand({
    before: "~~",
    after: "~~",
    nodeName: "Strikethrough",
    emptySnippet: "~~~~",
    emptyCursorOffset: 2,
  }),
  inlineCode: createWrapSelectionOrWordCommand({
    before: "`",
    after: "`",
    nodeName: "InlineCode",
    emptySnippet: "``",
    emptyCursorOffset: 1,
  }),
  link: createMarkdownLinkCommand,
  horizontalRule: insertHorizontalRuleCommand,
  unorderedList: toggleUnorderedListCommand,
  orderedList: toggleOrderedListCommand,
  taskList: toggleTaskListCommand,
  taskCheck: toggleTaskCheckCommand,
  blockquote: toggleBlockquoteCommand,
  codeBlock: toggleFencedCodeBlockCommand,
} as const;

export const createCommandRegistry = (): CommandRegistry => {
  const formatting: Array<{
    id: Exclude<CommandId, "theme.set" | "insert.attachImages">;
    title: string;
    category: CommandCategory;
    run: (view: EditorView) => boolean;
  }> = [
    {
      id: "format.heading1",
      title: "Heading 1",
      category: "Format",
      run: headingCommand(1),
    },
    {
      id: "format.heading2",
      title: "Heading 2",
      category: "Format",
      run: headingCommand(2),
    },
    {
      id: "format.heading3",
      title: "Heading 3",
      category: "Format",
      run: headingCommand(3),
    },
    {
      id: "format.heading4",
      title: "Heading 4",
      category: "Format",
      run: headingCommand(4),
    },
    {
      id: "format.heading5",
      title: "Heading 5",
      category: "Format",
      run: headingCommand(5),
    },
    {
      id: "format.heading6",
      title: "Heading 6",
      category: "Format",
      run: headingCommand(6),
    },
    {
      id: "format.paragraph",
      title: "Paragraph",
      category: "Format",
      run: headingCommand(0),
    },
    {
      id: "format.highlight",
      title: "Highlight",
      category: "Format",
      run: createWrapSelectionOrWordCommand({
        before: "==",
        after: "==",
        nodeName: "Highlight",
      }),
    },
    {
      id: "insert.image",
      title: "Image link",
      category: "Insert",
      run: insertImageCommand,
    },
    {
      id: "insert.table",
      title: "Table",
      category: "Insert",
      run: insertTable,
    },
    {
      id: "insert.footnote",
      title: "Footnote",
      category: "Insert",
      run: insertFootnoteCommand,
    },
    {
      id: "insert.math",
      title: "Math expression",
      category: "Insert",
      run: createSnippetCommand("$e^{i\\pi} + 1 = 0$", 1),
    },
    {
      id: "insert.frontmatter",
      title: "Frontmatter",
      category: "Insert",
      run: (view) => {
        const exists =
          syntaxTree(view.state).topNode.firstChild?.name === "Frontmatter";
        view.dispatch({
          changes: exists
            ? undefined
            : { from: 0, insert: "---\ntitle: \ntags: []\n---\n\n" },
          selection: { anchor: exists ? 4 : 11 },
          userEvent: "input",
          scrollIntoView: true,
        });
        view.focus();
        return true;
      },
    },
    ...(
      [
        "row.add",
        "row.addAbove",
        "row.delete",
        "row.moveUp",
        "row.moveDown",
        "column.add",
        "column.addLeft",
        "column.delete",
        "column.moveLeft",
        "column.moveRight",
        "delete",
        "align.left",
        "align.center",
        "align.right",
        "format",
      ] as const
    ).map((action) => ({
      id: `table.${action}` as const,
      title: {
        "row.add": "Add row below",
        "row.addAbove": "Add row above",
        "row.delete": "Delete row",
        "row.moveUp": "Move row up",
        "row.moveDown": "Move row down",
        "column.add": "Add column right",
        "column.addLeft": "Add column left",
        "column.delete": "Delete column",
        "column.moveLeft": "Move column left",
        "column.moveRight": "Move column right",
        delete: "Delete table",
        "align.left": "Align column left",
        "align.center": "Align column center",
        "align.right": "Align column right",
        format: "Format table",
      }[action],
      category: "Table" as const,
      run: tableCommand(action),
    })),
  ];
  const commands: CommandDefinition[] = [
    ...themeOptions.map((theme) => ({
      id: `theme.${theme}` as const,
      title: `${themeDisplayName[theme]} theme`,
      category: "Theme" as const,
      run: (ctx: CommandRunContext) => {
        ctx.setTheme(theme);
        return true;
      },
    })),
    {
      id: "editor.followLink",
      title: "Follow link",
      category: "Edit",
      requiresEditor: true,
      defaultBinding: "mod+enter",
      run: (ctx) => {
        const view = ctx.getEditorView();
        return view ? followSourceLink(activeTableCell(view) ?? view) : false;
      },
    },
    ...formatting.map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      requiresEditor: true,
      run: (ctx: CommandRunContext) => {
        const view = ctx.getEditorView();
        return view ? item.run(view) : false;
      },
    })),
    {
      id: "file.quickOpen",
      title: "Quick open…",
      category: "File",
      defaultBinding: "mod+p",
      settingsKey: "quickOpen",
      isGlobal: true,
      run: (ctx) => {
        ctx.quickOpen();
        return true;
      },
    },
    {
      id: "insert.attachImages",
      title: "Attach images…",
      category: "Insert",
      requiresEditor: true,
      run: async (ctx, args) => {
        const view = ctx.getEditorView();
        if (!view) return false;
        await ctx.attachImages(
          view,
          args ? { kind: "files", files: args.files } : { kind: "choose" },
        );
        return true;
      },
    },
    {
      id: "insert.pasteImage",
      title: "Paste image",
      category: "Insert",
      requiresEditor: true,
      run: async (ctx) => {
        const view = ctx.getEditorView();
        if (!view) return false;
        await ctx.attachImages(view, { kind: "clipboard" });
        return true;
      },
    },
    {
      id: "app.commandPalette",
      title: "Command palette",
      category: "App",
      defaultBinding: "mod+k",
      alternateBindings: ["ctrl+k"],
      settingsKey: "commandPalette",
      isGlobal: true,
      run: (ctx) => {
        ctx.openCommandPalette();
        return true;
      },
    },
    {
      id: "file.new",
      title: "New",
      category: "File",
      description: "Create a new Markdown file.",
      defaultBinding: "mod+n",
      settingsKey: "new",
      isGlobal: true,
      run: async (ctx) => {
        await ctx.newFile();
        return true;
      },
    },
    {
      id: "file.open",
      title: "Open…",
      category: "File",
      description: "Open a Markdown file from your computer.",
      defaultBinding: "mod+o",
      settingsKey: "open",
      isGlobal: true,
      run: async (ctx) => {
        await ctx.openFile();
        return true;
      },
    },
    {
      id: "file.save",
      requiresEditor: true,
      title: "Save",
      category: "File",
      description: "Save the current file to disk.",
      defaultBinding: "mod+s",
      settingsKey: "save",
      isGlobal: true,
      run: async (ctx) => {
        await ctx.saveFile();
        return true;
      },
    },
    {
      id: "file.saveAs",
      requiresEditor: true,
      title: "Save As…",
      category: "File",
      description: "Save the current file with a new name.",
      defaultBinding: "mod+shift+s",
      settingsKey: "saveAs",
      isGlobal: true,
      run: async (ctx) => {
        await ctx.saveFileAs();
        return true;
      },
    },
    {
      id: "app.openSettings",
      title: "Settings",
      category: "App",
      description: "Open the Bedrock settings dialog.",
      defaultBinding: "mod+,",
      settingsKey: "openSettings",
      isGlobal: true,
      run: (ctx) => {
        ctx.openSettings();
        return true;
      },
    },
    {
      id: "format.bold",
      title: "Bold",
      category: "Format",
      description: "Make the selection or current word bold.",
      defaultBinding: "mod+b",
      settingsKey: "bold",
      requiresEditor: true,
      run: (ctx) => {
        const view = ctx.getEditorView();
        return view ? editorCommands.bold(view) : false;
      },
    },
    {
      id: "format.italic",
      title: "Italic",
      category: "Format",
      description: "Make the selection or current word italic.",
      defaultBinding: "mod+i",
      settingsKey: "italic",
      requiresEditor: true,
      run: (ctx) => {
        const view = ctx.getEditorView();
        return view ? editorCommands.italic(view) : false;
      },
    },
    {
      id: "format.strikethrough",
      title: "Strikethrough",
      category: "Format",
      description: "Add strikethrough to the selection or current word.",
      defaultBinding: "mod+shift+x",
      settingsKey: "strikethrough",
      requiresEditor: true,
      run: (ctx) => {
        const view = ctx.getEditorView();
        return view ? editorCommands.strikethrough(view) : false;
      },
    },
    {
      id: "format.inlineCode",
      title: "Inline code",
      category: "Format",
      description: "Wrap the selection or current word in backticks.",
      defaultBinding: "mod+`",
      settingsKey: "inlineCode",
      requiresEditor: true,
      run: (ctx) => {
        const view = ctx.getEditorView();
        return view ? editorCommands.inlineCode(view) : false;
      },
    },
    {
      id: "insert.link",
      title: "Insert link",
      category: "Insert",
      description: "Create a Markdown link from the selection.",
      defaultBinding: "mod+shift+k",
      settingsKey: "link",
      requiresEditor: true,
      run: (ctx) => {
        const view = ctx.getEditorView();
        return view ? editorCommands.link(view) : false;
      },
    },
    {
      id: "insert.horizontalRule",
      title: "Horizontal rule",
      category: "Insert",
      description: "Insert a horizontal rule.",
      requiresEditor: true,
      run: (ctx) => {
        const view = ctx.getEditorView();
        return view ? editorCommands.horizontalRule(view) : false;
      },
    },
    {
      id: "insert.unorderedList",
      title: "Bulleted list",
      category: "Insert",
      description: "Toggle a bulleted list for the selected lines.",
      defaultBinding: "mod+alt+l",
      settingsKey: "unorderedList",
      requiresEditor: true,
      run: (ctx) => {
        const view = ctx.getEditorView();
        return view ? editorCommands.unorderedList(view) : false;
      },
    },
    {
      id: "insert.orderedList",
      title: "Numbered list",
      category: "Insert",
      description: "Toggle a numbered list for the selected lines.",
      defaultBinding: "mod+alt+o",
      settingsKey: "orderedList",
      requiresEditor: true,
      run: (ctx) => {
        const view = ctx.getEditorView();
        return view ? editorCommands.orderedList(view) : false;
      },
    },
    {
      id: "insert.taskList",
      title: "Task list",
      category: "Insert",
      description: "Toggle a task checklist for the selected lines.",
      defaultBinding: "mod+alt+t",
      settingsKey: "taskList",
      requiresEditor: true,
      run: (ctx) => {
        const view = ctx.getEditorView();
        return view ? editorCommands.taskList(view) : false;
      },
    },
    {
      id: "insert.taskCheck",
      title: "Toggle task check",
      category: "Insert",
      description: "Toggle checked state for task checklist items.",
      requiresEditor: true,
      run: (ctx) => {
        const view = ctx.getEditorView();
        return view ? editorCommands.taskCheck(view) : false;
      },
    },
    {
      id: "insert.blockquote",
      title: "Quote",
      category: "Insert",
      description: "Toggle a blockquote for the selected lines.",
      defaultBinding: "mod+alt+q",
      settingsKey: "blockquote",
      requiresEditor: true,
      run: (ctx) => {
        const view = ctx.getEditorView();
        return view ? editorCommands.blockquote(view) : false;
      },
    },
    {
      id: "insert.codeBlock",
      title: "Code block",
      category: "Insert",
      description: "Wrap the selection in a fenced code block.",
      defaultBinding: "mod+alt+c",
      settingsKey: "codeBlock",
      requiresEditor: true,
      run: (ctx) => {
        const view = ctx.getEditorView();
        return view ? editorCommands.codeBlock(view) : false;
      },
    },
    {
      id: "editor.undo",
      title: "Undo",
      category: "Edit",
      description: "Undo the last change.",
      defaultBinding: "mod+z",
      settingsKey: "undo",
      requiresEditor: true,
      run: (ctx) => {
        const view = ctx.getEditorView();
        if (!view) return false;
        return undo(view);
      },
    },
    {
      id: "editor.redo",
      title: "Redo",
      category: "Edit",
      description: "Redo the last undone change.",
      defaultBinding: "mod+y",
      settingsKey: "redo",
      requiresEditor: true,
      run: (ctx) => {
        const view = ctx.getEditorView();
        if (!view) return false;
        return redo(view);
      },
    },
    {
      id: "editor.find",
      title: "Find",
      category: "Edit",
      description: "Search for text in the current file.",
      defaultBinding: "mod+f",
      settingsKey: "find",
      requiresEditor: true,
      run: (ctx) => {
        const view = ctx.getEditorView();
        if (!view) return false;

        // Toggle logic: if the search panel is already visible in this view, close it.
        const isPanelVisible = view.dom.querySelector(
          ".cm-search-panel-container",
        );
        if (isPanelVisible) {
          closeSearchPanel(view);
        } else {
          openSearchPanel(view);
        }
        return true;
      },
    },
    {
      id: "file.exportHtml",
      requiresEditor: true,
      title: "Export to HTML",
      category: "File",
      description: "Save the current file as a styled HTML document.",
      run: async (ctx) => {
        await ctx.exportFile("html");
        return true;
      },
    },
    {
      id: "file.exportPdf",
      requiresEditor: true,
      title: "Export to PDF",
      category: "File",
      description: "Save the current file as a PDF document.",
      run: async (ctx) => {
        await ctx.exportFile("pdf");
        return true;
      },
    },
    {
      id: "theme.set",
      title: "Set theme",
      category: "Theme",
      description: "Change the editor color theme.",
      run: (ctx, args) => {
        ctx.setTheme(args.theme);
        return true;
      },
    },
  ];

  const map = byId(commands);

  return {
    get: (id) => {
      const cmd = map.get(id);
      if (!cmd) {
        throw new Error(`Unknown command: ${id}`);
      }
      return cmd;
    },
    list: () => [...map.values()],
  };
};

export const resolveCommandBinding = (
  registry: CommandRegistry,
  id: CommandId,
  settings: UserSettings,
): string | null => {
  const cmd = registry.get(id);
  const raw = cmd.settingsKey
    ? settings.keyBindings[cmd.settingsKey]
    : cmd.defaultBinding;

  if (!raw) return null;
  return normalizeBinding(raw);
};

export const resolveCommandShortcutLabel = (
  registry: CommandRegistry,
  id: CommandId,
  settings: UserSettings,
): string | null => {
  const binding = resolveCommandBinding(registry, id, settings);
  return binding ? formatBindingShortcut(binding) : null;
};

export const resolveCommandCodeMirrorKey = (
  registry: CommandRegistry,
  id: CommandId,
  settings: UserSettings,
): string | null => {
  const binding = resolveCommandBinding(registry, id, settings);
  return binding ? bindingToCodeMirrorKey(binding) : null;
};

export const createCommandRunner = (
  registry: CommandRegistry,
  ctx: CommandRunContext,
) => {
  const inlineCommands = new Set<CommandId>([
    "format.bold",
    "format.italic",
    "format.strikethrough",
    "format.highlight",
    "format.inlineCode",
    "insert.link",
    "insert.image",
    "insert.attachImages",
    "insert.pasteImage",
    "insert.math",
  ]);
  const canRun = (id: CommandId, view = ctx.getEditorView()): boolean => {
    const cmd = registry.get(id);
    if (cmd.requiresEditor && !view) return false;
    if (!view) return !id.startsWith("table.");
    const outer = tableCellOwners.get(view) ?? view;
    if (id === "editor.followLink")
      return sourceLink(activeTableCell(outer) ?? view) !== null;
    const table = tableAt(outer);
    if (id.startsWith("table.")) {
      if (!table) return false;
      if (id === "table.row.delete" && table.row < 2) return false;
      if (id === "table.row.moveUp" && table.row <= 2) return false;
      if (
        id === "table.row.moveDown" &&
        (table.row < 2 || table.row === table.rows.length - 1)
      )
        return false;
      if (id === "table.column.moveLeft" && table.column === 0) return false;
      if (
        id === "table.column.moveRight" &&
        table.column === table.rows[0].cells.length - 1
      )
        return false;
      if (id === "table.column.delete" && table.rows[0].cells.length < 2)
        return false;
      return true;
    }
    const structural =
      id.startsWith("format.heading") ||
      [
        "format.paragraph",
        "insert.unorderedList",
        "insert.orderedList",
        "insert.taskList",
        "insert.taskCheck",
        "insert.blockquote",
        "insert.codeBlock",
        "insert.horizontalRule",
        "insert.table",
        "insert.frontmatter",
      ].includes(id);
    if (
      structural ||
      ((inlineCommands.has(id) || id === "insert.footnote") &&
        !activeTableCell(outer))
    ) {
      let overlaps = !!table;
      const range = outer.state.selection.main;
      syntaxTree(outer.state).iterate({
        from: range.from,
        to: range.to,
        enter(node) {
          if (node.name === "Table") {
            overlaps = true;
            return false;
          }
        },
      });
      if (overlaps) return false;
    }
    return true;
  };
  const execute = async (
    context: CommandRunContext,
    id: CommandId,
    args?: unknown,
  ): Promise<boolean> => {
    const view = context.getEditorView();
    if (!canRun(id, view)) return false;
    const outer = view ? (tableCellOwners.get(view) ?? view) : null;
    const inline = inlineCommands.has(id);
    const target = outer && inline ? (activeTableCell(outer) ?? view) : outer;
    context = { ...context, getEditorView: () => target };
    const cmd = registry.get(id);
    if (cmd.requiresEditor && !context.getEditorView()) return false;
    if (cmd.id === "insert.attachImages") {
      if (args === undefined) return cmd.run(context, undefined);
      if (
        !args ||
        typeof args !== "object" ||
        !("files" in args) ||
        !Array.isArray(args.files) ||
        !args.files.every((file) => file instanceof File)
      )
        return false;
      return cmd.run(context, { files: args.files });
    }
    if (cmd.id === "theme.set") {
      if (
        !args ||
        typeof args !== "object" ||
        !("theme" in args) ||
        typeof args.theme !== "string" ||
        !isThemeName(args.theme)
      )
        return false;
      return cmd.run(context, { theme: args.theme });
    }
    return cmd.run(context, undefined);
  };
  const run = <ID extends CommandId>(
    id: ID,
    ...args: undefined extends CommandArgs[ID]
      ? [args?: CommandArgs[ID]]
      : [CommandArgs[ID]]
  ) => execute(ctx, id, args[0]);
  const runWithView = <ID extends CommandId>(
    id: ID,
    view: EditorView,
    ...args: undefined extends CommandArgs[ID]
      ? [args?: CommandArgs[ID]]
      : [CommandArgs[ID]]
  ) =>
    execute(
      { ...ctx, getEditorView: () => (ctx.getEditorView() ? view : null) },
      id,
      args[0],
    );

  const buildCodeMirrorKeymap = (settings: UserSettings): KeyBinding[] => {
    const keymap: KeyBinding[] = [];

    for (const cmd of registry.list()) {
      // Skip global commands as they are handled by the window-level listener
      // in App.tsx. Adding them here causes double-triggering.
      if (cmd.isGlobal) continue;

      const key = resolveCommandCodeMirrorKey(registry, cmd.id, settings);
      if (!key) continue;

      keymap.push({
        key,
        preventDefault: true,
        run: (view) => {
          // Fire and forget: CodeMirror expects sync boolean.
          void runWithView(cmd.id as CommandId, view);
          return true;
        },
      });
    }

    return keymap;
  };

  const findByBinding = (
    binding: string,
    settings: UserSettings,
  ): CommandId | null => {
    const normalized = normalizeBinding(binding);
    for (const cmd of registry.list()) {
      const cmdBinding = resolveCommandBinding(registry, cmd.id, settings);
      if (cmdBinding && cmdBinding === normalized) {
        return cmd.id;
      }
    }
    for (const cmd of registry.list()) {
      if (
        cmd.alternateBindings?.some(
          (alias) => normalizeBinding(alias) === normalized,
        )
      )
        return cmd.id;
    }
    return null;
  };

  return {
    run,
    runWithView,
    buildCodeMirrorKeymap,
    findByBinding,
    canRun,
  };
};

export type CommandRunner = ReturnType<typeof createCommandRunner>;
