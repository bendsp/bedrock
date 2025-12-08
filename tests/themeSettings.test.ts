import { strict as assert } from "assert";
import {
  clearSettingsStorage,
  defaultSettings,
  loadSettings,
} from "../src/renderer/settings";

class MemoryStorage implements Storage {
  private data: Record<string, string> = {};

  get length(): number {
    return Object.keys(this.data).length;
  }

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.data, key)
      ? this.data[key]
      : null;
  }

  setItem(key: string, value: string): void {
    this.data[key] = value;
  }

  key(index: number): string | null {
    const keys = Object.keys(this.data);
    return index >= 0 && index < keys.length ? keys[index] : null;
  }

  removeItem(key: string): void {
    delete this.data[key];
  }

  clear(): void {
    this.data = {};
  }
}

const runTest = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
};

const installStorage = () => {
  globalThis.localStorage = new MemoryStorage();
};

const STORAGE_KEY = "bedrock:settings";

declare global {
  // eslint-disable-next-line no-var
  var localStorage: Storage;
}

runTest("defaults apply when storage is empty", () => {
  installStorage();
  clearSettingsStorage();

  const settings = loadSettings();
  assert.deepEqual(settings, defaultSettings);
});

runTest("invalid themes fall back to defaults", () => {
  installStorage();
  const invalidPayload = {
    theme: "invalid-theme",
    followSystem: false,
    systemLightTheme: "nope",
    systemDarkTheme: "moonlight",
  };
  globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(invalidPayload));

  const settings = loadSettings();
  assert.equal(settings.theme, defaultSettings.theme);
  assert.equal(settings.systemLightTheme, defaultSettings.systemLightTheme);
  assert.equal(settings.systemDarkTheme, "moonlight");
  assert.equal(settings.followSystem, false);
});

runTest("valid themes and followSystem load correctly", () => {
  installStorage();
  const payload = {
    theme: "aquamarine",
    followSystem: true,
    systemLightTheme: "light",
    systemDarkTheme: "solarized",
  };
  globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

  const settings = loadSettings();
  assert.equal(settings.theme, "aquamarine");
  assert.equal(settings.followSystem, true);
  assert.equal(settings.systemLightTheme, "light");
  assert.equal(settings.systemDarkTheme, "solarized");
});

runTest("clearSettingsStorage removes persisted data", () => {
  installStorage();
  globalThis.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ theme: "light" })
  );
  clearSettingsStorage();
  const stored = globalThis.localStorage.getItem(STORAGE_KEY);
  assert.equal(stored, null);
});

if (process.exitCode && process.exitCode !== 0) {
  throw new Error("One or more tests failed.");
}
