export type KeyBindingAction = "open" | "save" | "openSettings";

export type KeyBindings = Record<KeyBindingAction, string>;

export type UserSettings = {
  textSize: number;
  keyBindings: KeyBindings;
};

const STORAGE_KEY = "bedrock:settings";

export const defaultKeyBindings: KeyBindings = {
  open: "mod+o",
  save: "mod+s",
  openSettings: "mod+,",
};

export const defaultSettings: UserSettings = {
  textSize: 16,
  keyBindings: defaultKeyBindings,
};

const normalizeKeyBindings = (
  stored: Partial<KeyBindings> | undefined
): KeyBindings => {
  return {
    open:
      stored?.open && typeof stored.open === "string"
        ? stored.open
        : defaultKeyBindings.open,
    save:
      stored?.save && typeof stored.save === "string"
        ? stored.save
        : defaultKeyBindings.save,
    openSettings:
      stored?.openSettings && typeof stored.openSettings === "string"
        ? stored.openSettings
        : defaultKeyBindings.openSettings,
  };
};

export const loadSettings = (): UserSettings => {
  if (typeof localStorage === "undefined") {
    return defaultSettings;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultSettings;
    }
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    const textSize =
      typeof parsed.textSize === "number" && parsed.textSize > 8
        ? parsed.textSize
        : defaultSettings.textSize;
    const keyBindings = normalizeKeyBindings(parsed.keyBindings);
    return { textSize, keyBindings };
  } catch {
    return defaultSettings;
  }
};

export const saveSettings = (settings: UserSettings) => {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore storage failures */
  }
};
