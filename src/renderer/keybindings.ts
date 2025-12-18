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

export const keyBindingLabels: Record<KeyBindingAction, string> = {
  open: "Open file",
  save: "Save file",
  openSettings: "Open settings",
  bold: "Bold",
  italic: "Italic",
  strikethrough: "Strikethrough",
};

export const clampKeyBindings = (bindings: KeyBindings): KeyBindings => ({
  open: normalizeBinding(bindings.open),
  save: normalizeBinding(bindings.save),
  openSettings: normalizeBinding(bindings.openSettings),
  bold: normalizeBinding(bindings.bold),
  italic: normalizeBinding(bindings.italic),
  strikethrough: normalizeBinding(bindings.strikethrough),
});
