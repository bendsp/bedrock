export type ThemeName =
  | "dark"
  | "light"
  | "moonlight"
  | "aquamarine"
  | "solarized";

type Theme = {
  name: ThemeName;
  displayName: string;
  variables: Record<string, string>;
};

const themes: Record<ThemeName, Theme> = {
  dark: {
    name: "dark",
    displayName: "Dark",
    variables: {
      "--bg-body": "#282c34",
      "--text-body": "#abb2bf",
      "--shell-bg": "#1f2329",
      "--header-bg": "#21252b",
      "--header-border": "#181a1f",
      "--header-text": "#d7dae0",
      "--button-bg": "#3a3f4b",
      "--button-border": "#4b5263",
      "--button-text": "#eef1f6",
      "--ui-primary": "#4f8bff",
      "--ui-primary-foreground": "#0d1424",
      "--ui-primary-border": "#75a7ff",
      "--ui-secondary": "#3a3f4b",
      "--ui-secondary-foreground": "#eef1f6",
      "--ui-secondary-border": "#4b5263",
      "--ui-disabled-bg": "#2a2e38",
      "--ui-disabled-text": "#808695",
      "--ui-disabled-border": "#363c48",
      "--panel-bg": "#1b1e24",
      "--panel-border": "#2a2f38",
      "--panel-text": "#e6e9ef",
      "--muted-text": "#8f97a5",
      "--overlay": "rgba(0, 0, 0, 0.65)",
      "--code-bg": "#2c313a",
      "--code-inline-bg": "#2c313a",
      "--code-text": "#e6edf3",
      "--link-color": "#61afef",
      "--blockquote-border": "#3f4755",
      "--blockquote-text": "#b6beca",
    },
  },
  light: {
    name: "light",
    displayName: "Light",
    variables: {
      "--bg-body": "#f5f7fb",
      "--text-body": "#1f2430",
      "--shell-bg": "#ffffff",
      "--header-bg": "#eef1f6",
      "--header-border": "#d8dde7",
      "--header-text": "#1f2430",
      "--button-bg": "#e2e7f0",
      "--button-border": "#c8d0dd",
      "--button-text": "#1f2430",
      "--ui-primary": "#2563eb",
      "--ui-primary-foreground": "#f8fafc",
      "--ui-primary-border": "#3b82f6",
      "--ui-secondary": "#e2e7f0",
      "--ui-secondary-foreground": "#1f2430",
      "--ui-secondary-border": "#c8d0dd",
      "--ui-disabled-bg": "#dfe4ed",
      "--ui-disabled-text": "#6b7280",
      "--ui-disabled-border": "#cbd5e1",
      "--panel-bg": "#ffffff",
      "--panel-border": "#d8dde7",
      "--panel-text": "#1f2430",
      "--muted-text": "#5c6270",
      "--overlay": "rgba(0, 0, 0, 0.4)",
      "--code-bg": "#f0f4fa",
      "--code-inline-bg": "#eef2f8",
      "--code-text": "#1f2430",
      "--link-color": "#2b6cb0",
      "--blockquote-border": "#cbd5e1",
      "--blockquote-text": "#4a5568",
    },
  },
  moonlight: {
    name: "moonlight",
    displayName: "Moonlight",
    variables: {
      "--bg-body": "#1b1424",
      "--text-body": "#f5e9ff",
      "--shell-bg": "#221733",
      "--header-bg": "#24193a",
      "--header-border": "#1a102a",
      "--header-text": "#f8f0ff",
      "--button-bg": "#3a264a",
      "--button-border": "#5b3d6d",
      "--button-text": "#f7e8ff",
      "--ui-primary": "#c65bff",
      "--ui-primary-foreground": "#1b1424",
      "--ui-primary-border": "#d48aff",
      "--ui-secondary": "#3a264a",
      "--ui-secondary-foreground": "#f7e8ff",
      "--ui-secondary-border": "#5b3d6d",
      "--ui-disabled-bg": "#2c1e3d",
      "--ui-disabled-text": "#b59ed1",
      "--ui-disabled-border": "#44325b",
      "--panel-bg": "#281c3f",
      "--panel-border": "#3b2858",
      "--panel-text": "#f7ecff",
      "--muted-text": "#cdb7e5",
      "--overlay": "rgba(12, 6, 22, 0.72)",
      "--code-bg": "#311f4f",
      "--code-inline-bg": "#3b275d",
      "--code-text": "#f7ecff",
      "--link-color": "#ff6f91",
      "--blockquote-border": "#5b3d6d",
      "--blockquote-text": "#e5d4f7",
    },
  },
  aquamarine: {
    name: "aquamarine",
    displayName: "Aquamarine",
    variables: {
      "--bg-body": "#031a2b",
      "--text-body": "#d9f4ff",
      "--shell-bg": "#05233a",
      "--header-bg": "#06304d",
      "--header-border": "#042235",
      "--header-text": "#e6fbff",
      "--button-bg": "#0a4f83",
      "--button-border": "#0f71b4",
      "--button-text": "#e8fbff",
      "--ui-primary": "#34c4ff",
      "--ui-primary-foreground": "#04131d",
      "--ui-primary-border": "#5cd6ff",
      "--ui-secondary": "#0a4f83",
      "--ui-secondary-foreground": "#e8fbff",
      "--ui-secondary-border": "#0f71b4",
      "--ui-disabled-bg": "#0b3245",
      "--ui-disabled-text": "#8bbad1",
      "--ui-disabled-border": "#0f4a63",
      "--panel-bg": "#042b45",
      "--panel-border": "#0a4f83",
      "--panel-text": "#def6ff",
      "--muted-text": "#9ed6f5",
      "--overlay": "rgba(3, 20, 35, 0.7)",
      "--code-bg": "#06304d",
      "--code-inline-bg": "#0a4f83",
      "--code-text": "#e8fbff",
      "--link-color": "#4ecbff",
      "--blockquote-border": "#0f71b4",
      "--blockquote-text": "#c7eefe",
    },
  },
  solarized: {
    name: "solarized",
    displayName: "Solarized",
    variables: {
      "--bg-body": "#002b36",
      "--text-body": "#93a1a1",
      "--shell-bg": "#073642",
      "--header-bg": "#002b36",
      "--header-border": "#073642",
      "--header-text": "#eee8d5",
      "--button-bg": "#073642",
      "--button-border": "#0c3a48",
      "--button-text": "#eee8d5",
      "--ui-primary": "#268bd2",
      "--ui-primary-foreground": "#fdf6e3",
      "--ui-primary-border": "#4ba3e6",
      "--ui-secondary": "#073642",
      "--ui-secondary-foreground": "#eee8d5",
      "--ui-secondary-border": "#0c3a48",
      "--ui-disabled-bg": "#0a2b36",
      "--ui-disabled-text": "#6b7b83",
      "--ui-disabled-border": "#0f3f4f",
      "--panel-bg": "#002b36",
      "--panel-border": "#0c3a48",
      "--panel-text": "#eee8d5",
      "--muted-text": "#93a1a1",
      "--overlay": "rgba(0, 43, 54, 0.7)",
      "--code-bg": "#073642",
      "--code-inline-bg": "#0c3a48",
      "--code-text": "#fdf6e3",
      "--link-color": "#268bd2",
      "--blockquote-border": "#586e75",
      "--blockquote-text": "#93a1a1",
    },
  },
};

const hexToHslTriplet = (hex: string): string | null => {
  const raw = hex.trim();
  if (!raw.startsWith("#")) return null;
  let h = raw.slice(1);
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6) return null;
  const n = Number.parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let hue = 0;
  let sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        hue = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        hue = (b - r) / d + 2;
        break;
      default:
        hue = (r - g) / d + 4;
        break;
    }
    hue *= 60;
  }

  const hOut = Math.round(hue * 10) / 10;
  const sOut = Math.round(sat * 1000) / 10;
  const lOut = Math.round(l * 1000) / 10;
  return `${hOut} ${sOut}% ${lOut}%`;
};

const setHslVar = (
  root: HTMLElement,
  cssVar: string,
  hex: string | undefined
) => {
  if (!hex) return;
  const triplet = hexToHslTriplet(hex);
  if (!triplet) return;
  root.style.setProperty(cssVar, triplet);
};

export const applyTheme = (themeName: ThemeName) => {
  const theme = themes[themeName] ?? themes.dark;
  const root = document.documentElement;
  Object.entries(theme.variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  // Bridge Bedrock's hex-based theme variables into shadcn-style HSL tokens so
  // shadcn UI components (and opacity modifiers like /90) work as intended.
  // Base palette
  setHslVar(root, "--background", theme.variables["--bg-body"]);
  setHslVar(root, "--foreground", theme.variables["--text-body"]);
  setHslVar(root, "--card", theme.variables["--panel-bg"]);
  setHslVar(root, "--card-foreground", theme.variables["--panel-text"]);
  setHslVar(root, "--popover", theme.variables["--panel-bg"]);
  setHslVar(root, "--popover-foreground", theme.variables["--panel-text"]);
  setHslVar(root, "--primary", theme.variables["--ui-primary"]);
  setHslVar(
    root,
    "--primary-foreground",
    theme.variables["--ui-primary-foreground"]
  );
  setHslVar(root, "--secondary", theme.variables["--ui-secondary"]);
  setHslVar(
    root,
    "--secondary-foreground",
    theme.variables["--ui-secondary-foreground"]
  );
  setHslVar(root, "--muted", theme.variables["--ui-disabled-bg"]);
  setHslVar(root, "--muted-foreground", theme.variables["--muted-text"]);
  setHslVar(root, "--accent", theme.variables["--panel-border"]);
  setHslVar(root, "--accent-foreground", theme.variables["--panel-text"]);
  setHslVar(root, "--border", theme.variables["--panel-border"]);
  setHslVar(root, "--input", theme.variables["--panel-border"]);
  setHslVar(root, "--ring", theme.variables["--ui-primary-border"]);

  // Reasonable fixed destructive colors (not theme-specific today).
  root.style.setProperty("--destructive", "0 84.2% 60.2%");
  root.style.setProperty("--destructive-foreground", "0 0% 98%");

  // Sidebar palette (used by `src/renderer/components/ui/sidebar.tsx`).
  setHslVar(root, "--sidebar-background", theme.variables["--panel-bg"]);
  setHslVar(root, "--sidebar-foreground", theme.variables["--panel-text"]);
  setHslVar(root, "--sidebar-primary", theme.variables["--ui-primary"]);
  setHslVar(
    root,
    "--sidebar-primary-foreground",
    theme.variables["--ui-primary-foreground"]
  );
  setHslVar(root, "--sidebar-accent", theme.variables["--panel-border"]);
  setHslVar(
    root,
    "--sidebar-accent-foreground",
    theme.variables["--panel-text"]
  );
  setHslVar(root, "--sidebar-border", theme.variables["--panel-border"]);
  setHslVar(root, "--sidebar-ring", theme.variables["--ui-primary-border"]);
};

export const getTheme = (themeName: ThemeName): Theme => {
  return themes[themeName] ?? themes.dark;
};

export const themeOptions: ThemeName[] = [
  "dark",
  "light",
  "moonlight",
  "aquamarine",
  "solarized",
];

export const isThemeName = (value: string): value is ThemeName =>
  themeOptions.includes(value as ThemeName);

export const themeDisplayName: Record<ThemeName, string> = themeOptions.reduce(
  (acc, name) => {
    acc[name] = themes[name].displayName;
    return acc;
  },
  {} as Record<ThemeName, string>
);
