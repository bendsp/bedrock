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

export const applyTheme = (themeName: ThemeName) => {
  const theme = themes[themeName] ?? themes.dark;
  const root = document.documentElement;
  Object.entries(theme.variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
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
