import { ThemeName, isThemeName } from "./theme";

export type KeyBindingAction = "open" | "save" | "openSettings";

export type KeyBindings = Record<KeyBindingAction, string>;

export type UserSettings = {
  textSize: number;
  uiScale: number; // percentage
  keyBindings: KeyBindings;
  theme: ThemeName;
  followSystem: boolean;
  systemLightTheme: ThemeName;
  systemDarkTheme: ThemeName;
};

const STORAGE_KEY = "bedrock:settings";

export const defaultKeyBindings: KeyBindings = {
  open: "mod+o",
  save: "mod+s",
  openSettings: "mod+,",
};

export const defaultSettings: UserSettings = {
  textSize: 16,
  uiScale: 100,
  keyBindings: defaultKeyBindings,
  theme: "dark",
  followSystem: true,
  systemLightTheme: "light",
  systemDarkTheme: "dark",
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
    const uiScaleFromLegacy =
      typeof (parsed as any).uiTextSize === "number"
        ? Math.round(((parsed as any).uiTextSize / 15) * 100)
        : undefined;
    const textSize =
      typeof parsed.textSize === "number" && parsed.textSize > 8
        ? parsed.textSize
        : defaultSettings.textSize;
    const uiScaleRaw =
      typeof parsed.uiScale === "number" ? parsed.uiScale : uiScaleFromLegacy;
    const uiScale =
      typeof uiScaleRaw === "number" && uiScaleRaw >= 50 && uiScaleRaw <= 150
        ? uiScaleRaw
        : defaultSettings.uiScale;
    const keyBindings = normalizeKeyBindings(parsed.keyBindings);
    const theme =
      parsed.theme &&
      typeof parsed.theme === "string" &&
      isThemeName(parsed.theme)
        ? parsed.theme
        : defaultSettings.theme;
    const followSystem = Boolean(parsed.followSystem);
    const systemLightTheme =
      parsed.systemLightTheme &&
      typeof parsed.systemLightTheme === "string" &&
      isThemeName(parsed.systemLightTheme)
        ? parsed.systemLightTheme
        : defaultSettings.systemLightTheme;
    const systemDarkTheme =
      parsed.systemDarkTheme &&
      typeof parsed.systemDarkTheme === "string" &&
      isThemeName(parsed.systemDarkTheme)
        ? parsed.systemDarkTheme
        : defaultSettings.systemDarkTheme;
    return {
      textSize,
      uiScale,
      keyBindings,
      theme,
      followSystem,
      systemLightTheme,
      systemDarkTheme,
    };
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

export const clearSettingsStorage = () => {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore failures */
  }
};
