import { KeyBindingAction, KeyBindings } from "./settings";

const MOD_LABEL = navigator.platform.includes("Mac") ? "Cmd" : "Ctrl";

const order = ["mod", "ctrl", "alt", "shift"] as const;

const normalizePart = (part: string): string => {
  const lower = part.trim().toLowerCase();
  if (lower === "cmd" || lower === "meta") {
    return "mod";
  }
  if (lower === "control" || lower === "ctrl") {
    return "ctrl";
  }
  if (lower === "option") {
    return "alt";
  }
  return lower;
};

export const isModifierKey = (key: string): boolean => {
  const lower = key.toLowerCase();
  return (
    lower === "meta" ||
    lower === "cmd" ||
    lower === "control" ||
    lower === "ctrl" ||
    lower === "shift" ||
    lower === "alt" ||
    lower === "option"
  );
};

export const normalizeBinding = (binding: string): string => {
  const rawParts = binding.split("+").map(normalizePart).filter(Boolean);
  const keyPart = rawParts.find(
    (part) => !order.includes(part as (typeof order)[number])
  );

  const modifiers = rawParts.filter((part) =>
    order.includes(part as (typeof order)[number])
  );

  const sortedModifiers = order.filter((mod) => modifiers.includes(mod));

  return [...sortedModifiers, keyPart].filter(Boolean).join("+");
};

export const eventToBinding = (
  event: KeyboardEvent | React.KeyboardEvent
): string | null => {
  const key = event.key.toLowerCase();

  // Require a modifier to avoid capturing plain typing.
  if (!event.metaKey && !event.ctrlKey) {
    return null;
  }

  // Avoid committing when only modifier keys are pressed.
  if (isModifierKey(key)) {
    return null;
  }

  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) {
    parts.push("mod");
  }
  if (event.altKey) {
    parts.push("alt");
  }
  if (event.shiftKey) {
    parts.push("shift");
  }

  parts.push(key);

  return normalizeBinding(parts.join("+"));
};

export const matchesBinding = (eventBinding: string, stored: string): boolean =>
  normalizeBinding(eventBinding) === normalizeBinding(stored);

export const formatBinding = (binding: string): string => {
  const parts = normalizeBinding(binding).split("+").filter(Boolean);
  return parts
    .map((part) => {
      if (part === "mod") {
        return MOD_LABEL;
      }
      if (part === "ctrl") {
        return "Ctrl";
      }
      if (part === "alt") {
        return "Alt";
      }
      if (part === "shift") {
        return "Shift";
      }
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join("+");
};

/**
 * Formats a binding for compact UI "shortcut" display.
 *
 * - On macOS, uses symbol glyphs (e.g. "⌘⇧B")
 * - Elsewhere, uses readable labels with "+" (e.g. "Ctrl+Shift+B")
 */
export const formatBindingShortcut = (binding: string): string => {
  const isMac = navigator.platform.includes("Mac");
  const parts = normalizeBinding(binding).split("+").filter(Boolean);
  const joiner = isMac ? "" : "+";

  return parts
    .map((part) => {
      if (part === "mod") {
        return isMac ? "⌘" : "Ctrl";
      }
      if (part === "ctrl") {
        return "Ctrl";
      }
      if (part === "alt") {
        return isMac ? "⌥" : "Alt";
      }
      if (part === "shift") {
        return isMac ? "⇧" : "Shift";
      }
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join(joiner);
};

/**
 * Converts a normalized binding like `mod+shift+x` into a CodeMirror key string
 * like `Mod-Shift-x`.
 */
export const bindingToCodeMirrorKey = (binding: string): string => {
  const parts = normalizeBinding(binding).split("+").filter(Boolean);
  const mapped = parts.map((part) => {
    const lower = part.toLowerCase();
    if (lower === "mod") return "Mod";
    if (lower === "cmd") return "Mod";
    if (lower === "ctrl") return "Ctrl";
    if (lower === "shift") return "Shift";
    if (lower === "alt" || lower === "option") return "Alt";
    if (lower === "arrowleft") return "ArrowLeft";
    if (lower === "arrowright") return "ArrowRight";
    if (lower === "arrowup") return "ArrowUp";
    if (lower === "arrowdown") return "ArrowDown";
    if (lower === "escape" || lower === "esc") return "Escape";
    if (lower === "enter" || lower === "return") return "Enter";
    if (lower === "backspace") return "Backspace";
    if (lower === "delete" || lower === "del") return "Delete";
    if (lower === "tab") return "Tab";
    if (lower === "space" || lower === " ") return "Space";
    if (lower === "home") return "Home";
    if (lower === "end") return "End";
    if (lower === "pageup") return "PageUp";
    if (lower === "pagedown") return "PageDown";
    return part.length === 1 ? lower : part;
  });
  return mapped.join("-");
};

export const keyBindingLabels: Record<KeyBindingAction, string> = {
  open: "Open file",
  save: "Save file",
  saveAs: "Save as",
  openSettings: "Open settings",
  bold: "Bold",
  italic: "Italic",
  link: "Insert link",
  inlineCode: "Inline code",
  strikethrough: "Strikethrough",
  undo: "Undo",
  redo: "Redo",
  find: "Find",
};

export const clampKeyBindings = (bindings: KeyBindings): KeyBindings => ({
  open: normalizeBinding(bindings.open),
  save: normalizeBinding(bindings.save),
  saveAs: normalizeBinding(bindings.saveAs),
  openSettings: normalizeBinding(bindings.openSettings),
  bold: normalizeBinding(bindings.bold),
  italic: normalizeBinding(bindings.italic),
  link: normalizeBinding(bindings.link),
  inlineCode: normalizeBinding(bindings.inlineCode),
  strikethrough: normalizeBinding(bindings.strikethrough),
  undo: normalizeBinding(bindings.undo),
  redo: normalizeBinding(bindings.redo),
  find: normalizeBinding(bindings.find),
});
