import { undo, redo } from "@codemirror/commands";
import { openSearchPanel, closeSearchPanel } from "@codemirror/search";
import type { EditorView, KeyBinding } from "@codemirror/view";
import { markdownToHtml } from "../lib/export";
import {
  createMarkdownLinkCommand,
  createWrapSelectionOrWordCommand,
  insertHorizontalRuleCommand,
} from "../editor/codemirror/commands";
import {
  bindingToCodeMirrorKey,
  formatBindingShortcut,
  normalizeBinding,
} from "../keybindings";
import type { KeyBindingAction, UserSettings } from "../settings";
import type { ThemeName } from "../theme";

export type CommandId =
  | "file.open"
  | "file.save"
  | "file.saveAs"
  | "app.openSettings"
  | "format.bold"
  | "format.italic"
  | "format.strikethrough"
  | "format.inlineCode"
  | "insert.link"
  | "insert.horizontalRule"
  | "theme.set"
  | "editor.undo"
  | "editor.redo"
  | "editor.find"
  | "file.exportHtml"
  | "file.exportPdf";

export type CommandArgs = {
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
  "theme.set": { theme: ThemeName };
  "editor.undo": void;
  "editor.redo": void;
  "editor.find": void;
  "file.exportHtml": void;
  "file.exportPdf": void;
};

export type CommandCategory =
  | "File"
  | "App"
  | "Format"
  | "Insert"
  | "Theme"
  | "Edit";

export type CommandDefinition<ID extends CommandId = CommandId> = {
  [K in ID]: {
    id: K;
    title: string;
    category: CommandCategory;
    description?: string;
    /**
     * Default binding in Bedrock normalized form (e.g. "mod+shift+x").
     * If omitted, the command has no keyboard shortcut by default.
     */
    defaultBinding?: string;
    /**
     * If set, the command will use the binding from UserSettings.keyBindings[settingsKey]
     * if it exists, overriding the defaultBinding.
     */
    settingsKey?: KeyBindingAction;
    /**
     * If true, the command requires an active CodeMirror editor view.
     * The runner will automatically check this and return false if missing.
     */
    requiresEditor?: boolean;
    /**
     * If true, this command can be triggered via a global window-level shortcut
     * even if the editor isn't focused.
     */
    isGlobal?: boolean;
    /**
     * Run the command.
     *
     * - Return true if handled.
     * - Return false if it could not run.
     */
    run: (
      ctx: CommandRunContext,
      args: CommandArgs[K]
    ) => boolean | Promise<boolean>;
  };
}[ID];

export type CommandRunContext = {
  getEditorView: () => EditorView | null;
  openFile: () => Promise<void>;
  saveFile: () => Promise<void>;
  saveFileAs: () => Promise<void>;
  openSettings: () => void;
  setTheme: (theme: ThemeName) => void;
  exportFile: (format: "html" | "pdf") => Promise<void>;
};

export type CommandRegistry = {
  get: (id: CommandId) => CommandDefinition;
  list: () => CommandDefinition[];
};

const byId = <T extends CommandDefinition>(
  commands: T[]
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
} as const;

export const createCommandRegistry = (): CommandRegistry => {
  const commands: CommandDefinition[] = [
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
      defaultBinding: "mod+k",
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
        const isPanelVisible = view.dom.querySelector(".cm-search-panel-container");
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
  settings: UserSettings
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
  settings: UserSettings
): string | null => {
  const binding = resolveCommandBinding(registry, id, settings);
  return binding ? formatBindingShortcut(binding) : null;
};

export const resolveCommandCodeMirrorKey = (
  registry: CommandRegistry,
  id: CommandId,
  settings: UserSettings
): string | null => {
  const binding = resolveCommandBinding(registry, id, settings);
  return binding ? bindingToCodeMirrorKey(binding) : null;
};

export const createCommandRunner = (
  registry: CommandRegistry,
  ctx: CommandRunContext
) => {
  const run = async <ID extends CommandId>(
    id: ID,
    ...args: CommandArgs[ID] extends void ? [] : [CommandArgs[ID]]
  ): Promise<boolean> => {
    const cmd = registry.get(id) as CommandDefinition<ID>;

    // Automatic editor check
    if (cmd.requiresEditor && !ctx.getEditorView()) {
      return false;
    }

    return await cmd.run(
      ctx,
      (args[0] as CommandArgs[ID]) ?? (undefined as CommandArgs[ID])
    );
  };

  const runWithView = async <ID extends CommandId>(
    id: ID,
    view: EditorView,
    ...args: CommandArgs[ID] extends void ? [] : [CommandArgs[ID]]
  ): Promise<boolean> => {
    const cmd = registry.get(id) as CommandDefinition<ID>;

    return await cmd.run(
      {
        ...ctx,
        getEditorView: () => view,
      },
      (args[0] as CommandArgs[ID]) ?? (undefined as CommandArgs[ID])
    );
  };

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
    settings: UserSettings
  ): CommandId | null => {
    const normalized = normalizeBinding(binding);
    for (const cmd of registry.list()) {
      const cmdBinding = resolveCommandBinding(registry, cmd.id, settings);
      if (cmdBinding && cmdBinding === normalized) {
        return cmd.id;
      }
    }
    return null;
  };

  return {
    run,
    runWithView,
    buildCodeMirrorKeymap,
    findByBinding,
  };
};

export type CommandRunner = ReturnType<typeof createCommandRunner>;
