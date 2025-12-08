export type UserSettings = {
  textSize: number;
};

const STORAGE_KEY = "bedrock:settings";

export const defaultSettings: UserSettings = {
  textSize: 16,
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
    return { textSize };
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
