import { ThemeName, isThemeName } from "./theme";
import { RenderMode } from "../shared/types";

export type KeyBindingAction =
  | "new"
  | "open"
  | "save"
  | "saveAs"
  | "openSettings"
  | "bold"
  | "italic"
  | "link"
  | "inlineCode"
  | "strikethrough"
  | "undo"
  | "redo"
  | "find";

export type KeyBindings = Record<KeyBindingAction, string>;

export type FontFamilyOption =
  | "system"
  | "inter"
  | "satoshi"
  | "helvetica"
  | "roboto"
  | "vercelPixel"
  | "serif";

type FontFamilyStacks = {
  appFontFamily: string;
  editorFontFamily: string;
};

const SYSTEM_SANS_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const INTER_STACK =
  '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const SATOSHI_STACK =
  '"Satoshi", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const HELVETICA_STACK =
  '"Helvetica Neue", Helvetica, Arial, sans-serif';

const ROBOTO_STACK =
  '"Roboto", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

const VERCEL_PIXEL_STACK =
  '"Geist Pixel Square", "GeistPixelSquare", "Geist Pixel Grid", "GeistPixelGrid", "Geist Pixel Circle", "GeistPixelCircle", "Geist Pixel Triangle", "GeistPixelTriangle", "Geist Pixel Line", "GeistPixelLine", "Geist Pixel", "Geist Sans", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

const SERIF_STACK =
  'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';

export const fontFamilyOptions: FontFamilyOption[] = [
  "system",
  "inter",
  "satoshi",
  "helvetica",
  "roboto",
  "vercelPixel",
  "serif",
];

export const fontFamilyDisplayName: Record<FontFamilyOption, string> = {
  system: "System Sans",
  inter: "Inter",
  satoshi: "Satoshi",
  helvetica: "Helvetica",
  roboto: "Roboto",
  vercelPixel: "Vercel Pixel",
  serif: "Serif",
};

const fontFamilyStacks: Record<FontFamilyOption, FontFamilyStacks> = {
  system: {
    appFontFamily: SYSTEM_SANS_STACK,
    editorFontFamily: SYSTEM_SANS_STACK,
  },
  inter: {
    appFontFamily: INTER_STACK,
    editorFontFamily: INTER_STACK,
  },
  satoshi: {
    appFontFamily: SATOSHI_STACK,
    editorFontFamily: SATOSHI_STACK,
  },
  helvetica: {
    appFontFamily: HELVETICA_STACK,
    editorFontFamily: HELVETICA_STACK,
  },
  roboto: {
    appFontFamily: ROBOTO_STACK,
    editorFontFamily: ROBOTO_STACK,
  },
  vercelPixel: {
    appFontFamily: VERCEL_PIXEL_STACK,
    editorFontFamily: VERCEL_PIXEL_STACK,
  },
  serif: {
    appFontFamily: SERIF_STACK,
    editorFontFamily: SERIF_STACK,
  },
};

export const isFontFamilyOption = (
  value: string
): value is FontFamilyOption =>
  fontFamilyOptions.includes(value as FontFamilyOption);

export const resolveFontFamily = (
  fontFamily: FontFamilyOption
): FontFamilyStacks => fontFamilyStacks[fontFamily] ?? fontFamilyStacks.system;

export type UserSettings = {
  fontFamily: FontFamilyOption;
  textSize: number;
  uiScale: number; // percentage; custom UI scaling (separate from Electron zoom)
  keyBindings: KeyBindings;
  theme: ThemeName;
  followSystem: boolean;
  systemLightTheme: ThemeName;
  systemDarkTheme: ThemeName;
  renderMode: RenderMode;
  openLastFileOnStartup: boolean;
  lastOpenedFilePath: string | null;
};

const STORAGE_KEY = "bedrock:settings";

export const defaultKeyBindings: KeyBindings = {
  new: "mod+n",
  open: "mod+o",
  save: "mod+s",
  saveAs: "mod+shift+s",
  openSettings: "mod+,",
  bold: "mod+b",
  italic: "mod+i",
  link: "mod+k",
  inlineCode: "mod+`",
  strikethrough: "mod+shift+x",
  undo: "mod+z",
  redo: "mod+y",
  find: "mod+f",
};

export const defaultSettings: UserSettings = {
  fontFamily: "system",
  textSize: 16,
  uiScale: 100,
  keyBindings: defaultKeyBindings,
  theme: "dark",
  followSystem: true,
  systemLightTheme: "light",
  systemDarkTheme: "dark",
  renderMode: "hybrid",
  openLastFileOnStartup: true,
  lastOpenedFilePath: null,
};

const normalizeKeyBindings = (
  stored: Partial<KeyBindings> | undefined
): KeyBindings => {
  return {
    new:
      stored?.new && typeof stored.new === "string"
        ? stored.new
        : defaultKeyBindings.new,
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
    bold:
      stored?.bold && typeof stored.bold === "string"
        ? stored.bold
        : defaultKeyBindings.bold,
    italic:
      stored?.italic && typeof stored.italic === "string"
        ? stored.italic
        : defaultKeyBindings.italic,
    link:
      stored?.link && typeof stored.link === "string"
        ? stored.link
        : defaultKeyBindings.link,
    inlineCode:
      stored?.inlineCode && typeof stored.inlineCode === "string"
        ? stored.inlineCode
        : defaultKeyBindings.inlineCode,
    strikethrough:
      stored?.strikethrough && typeof stored.strikethrough === "string"
        ? stored.strikethrough
        : defaultKeyBindings.strikethrough,
    saveAs:
      stored?.saveAs && typeof stored.saveAs === "string"
        ? stored.saveAs
        : defaultKeyBindings.saveAs,
    undo:
      stored?.undo && typeof stored.undo === "string"
        ? stored.undo
        : defaultKeyBindings.undo,
    redo:
      stored?.redo && typeof stored.redo === "string"
        ? stored.redo
        : defaultKeyBindings.redo,
    find:
      stored?.find && typeof stored.find === "string"
        ? stored.find
        : defaultKeyBindings.find,
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
    type StoredSettings = Partial<UserSettings> & {
      uiTextSize?: unknown;
      uiScale?: unknown;
    };
    const parsed = JSON.parse(raw) as StoredSettings;
    const uiScaleFromLegacy =
      typeof parsed.uiTextSize === "number"
        ? Math.round((parsed.uiTextSize / 15) * 100)
        : undefined;
    const textSize =
      typeof parsed.textSize === "number" && parsed.textSize > 8
        ? parsed.textSize
        : defaultSettings.textSize;
    const uiScaleRaw =
      typeof parsed.uiScale === "number" ? parsed.uiScale : uiScaleFromLegacy;
    const uiScale =
      typeof uiScaleRaw === "number" && uiScaleRaw >= 63 && uiScaleRaw <= 173
        ? uiScaleRaw
        : defaultSettings.uiScale;
    const fontFamily =
      parsed.fontFamily &&
      typeof parsed.fontFamily === "string" &&
      isFontFamilyOption(parsed.fontFamily)
        ? parsed.fontFamily
        : defaultSettings.fontFamily;
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
    const renderMode =
      parsed.renderMode === "raw" || parsed.renderMode === "hybrid"
        ? parsed.renderMode
        : defaultSettings.renderMode;
    const openLastFileOnStartup =
      typeof parsed.openLastFileOnStartup === "boolean"
        ? parsed.openLastFileOnStartup
        : defaultSettings.openLastFileOnStartup;
    const lastOpenedFilePath =
      typeof parsed.lastOpenedFilePath === "string" ||
      parsed.lastOpenedFilePath === null
        ? parsed.lastOpenedFilePath
        : defaultSettings.lastOpenedFilePath;

    return {
      fontFamily,
      textSize,
      uiScale,
      keyBindings,
      theme,
      followSystem,
      systemLightTheme,
      systemDarkTheme,
      renderMode,
      openLastFileOnStartup,
      lastOpenedFilePath,
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
