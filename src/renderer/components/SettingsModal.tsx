import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { KeyBindingAction, UserSettings } from "../settings";
import {
  eventToBinding,
  formatBinding,
  keyBindingLabels,
  isModifierKey,
} from "../keybindings";
import { themeOptions, ThemeName, themeDisplayName } from "../theme";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Switch } from "./ui/switch";
import { Kbd, KbdGroup } from "./ui/kbd";
import { Slider } from "./ui/slider";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "./ui/sidebar";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "./ui/item";
import {
  Info,
  Keyboard,
  Palette,
  RotateCcw,
  Type,
  Wrench,
  type LucideIcon,
} from "lucide-react";

// Webpack will bundle this asset; `require` avoids TS module resolution issues.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bedrockLogo = require("../../assets/icon.png") as string;

const ABOUT_LINKS = {
  benWebsite: "https://desprets.net/",
  githubRepo: "https://github.com/bendsp/bedrock",
} as const;

type SettingsModalProps = {
  settings: UserSettings;
  onClose: () => void;
  onChange: (settings: UserSettings) => void;
  onResetBindings: () => void;
  onClearLocalStorage: () => void;
};

type SettingsCategory =
  | "editor"
  | "appearance"
  | "keybindings"
  | "developer"
  | "about";

const SettingsModal = ({
  settings,
  onClose,
  onChange,
  onResetBindings,
  onClearLocalStorage,
}: SettingsModalProps) => {
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const [activeCategory, setActiveCategory] =
    useState<SettingsCategory>("editor");
  const [listeningFor, setListeningFor] = useState<KeyBindingAction | null>(
    null
  );
  const [pendingBinding, setPendingBinding] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const originalBindingRef = useRef<{
    action: KeyBindingAction | null;
    binding: string | null;
  }>({ action: null, binding: null });

  const openExternal = (url: string) => {
    window.electronAPI.openExternal(url);
  };

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (listeningFor) {
          setListeningFor(null);
          setPendingBinding(null);
          return;
        }
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [listeningFor, onClose]);

  useEffect(() => {
    if (!listeningFor) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!listeningFor) {
        return;
      }
      const binding = eventToBinding(event);
      if (!binding) {
        return;
      }
      event.preventDefault();
      onChange({
        ...settings,
        keyBindings: {
          ...settings.keyBindings,
          [listeningFor]: binding,
        },
      });
      setPendingBinding(binding);
      setListeningFor(null);
      originalBindingRef.current = { action: null, binding: null };
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!listeningFor) {
        return;
      }
      if (isModifierKey(event.key)) {
        return;
      }
      event.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
    };
  }, [listeningFor, onChange, pendingBinding, settings]);

  useEffect(() => {
    if (activeCategory !== "about") {
      return;
    }
    if (appVersion) {
      return;
    }
    let cancelled = false;
    window.electronAPI
      .getAppVersion()
      .then((version) => {
        if (!cancelled) {
          setAppVersion(version);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAppVersion("Unknown");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeCategory, appVersion]);

  const updateTextSize = (delta: number) => {
    const next = Math.min(28, Math.max(12, settings.textSize + delta));
    if (next !== settings.textSize) {
      onChange({ ...settings, textSize: next });
    }
  };

  const uiScaleDebounceRef = useRef<number | null>(null);
  const [uiScaleDraft, setUiScaleDraft] = useState(settings.uiScale);

  useEffect(() => {
    setUiScaleDraft(settings.uiScale);
  }, [settings.uiScale]);

  useEffect(() => {
    return () => {
      if (uiScaleDebounceRef.current !== null) {
        window.clearTimeout(uiScaleDebounceRef.current);
        uiScaleDebounceRef.current = null;
      }
    };
  }, []);

  const updateUiScale = (value: number) => {
    const clamped = Math.min(173, Math.max(63, value));
    const current = settingsRef.current;
    if (clamped !== current.uiScale) {
      onChange({ ...current, uiScale: clamped });
    }
  };

  const resetUiScale = () => {
    if (uiScaleDebounceRef.current !== null) {
      window.clearTimeout(uiScaleDebounceRef.current);
      uiScaleDebounceRef.current = null;
    }
    setUiScaleDraft(100);
    updateUiScale(100);
  };

  const renderBinding = (binding: string) => {
    const parts = binding.split("+").filter(Boolean);
    return (
      <KbdGroup>
        {parts.map((part, index) => {
          const label =
            part.toLowerCase() === "mod"
              ? "⌘"
              : part.toLowerCase() === "cmd"
              ? "⌘"
              : part.toLowerCase() === "ctrl"
              ? "Ctrl"
              : part.toLowerCase() === "shift"
              ? "⇧"
              : part.toLowerCase() === "alt"
              ? "⌥"
              : part.length === 1
              ? part.toUpperCase()
              : part;
          const showPlus = index < parts.length - 1;
          return (
            <Fragment key={`${binding}-${index}`}>
              <Kbd className="">{label}</Kbd>
              {showPlus ? <span> + </span> : null}
            </Fragment>
          );
        })}
      </KbdGroup>
    );
  };

  const categories = useMemo(() => {
    const list: Array<{
      id: SettingsCategory;
      label: string;
      icon: LucideIcon;
    }> = [
      { id: "editor", label: "Editor", icon: Type },
      { id: "appearance", label: "Appearance", icon: Palette },
      { id: "keybindings", label: "Keybindings", icon: Keyboard },
      { id: "developer", label: "Developer", icon: Wrench },
      { id: "about", label: "About", icon: Info },
    ];
    return list;
  }, []);

  const activeCategoryLabel =
    categories.find((c) => c.id === activeCategory)?.label ?? "Settings";

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-[90%] h-[90%] max-w-5xl overflow-hidden bg-card text-card-foreground border border-border rounded-lg shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="m-0 text-base font-medium tracking-[0.2px]">
            Settings
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close{" "}
            <Kbd className="ml-2 h-5 min-w-5 px-1 text-[11px] font-semibold leading-[1.15]">
              Esc
            </Kbd>
          </Button>
        </div>

        <SidebarProvider className="flex-1 min-h-0">
          <div className="flex flex-1 min-h-0 flex-col md:flex-row">
            <Sidebar
              collapsible="none"
              className="w-full md:w-[--sidebar-width] border-b md:border-b-0 md:border-r border-sidebar-border"
            >
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupLabel>Categories</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {categories.map((category) => {
                        const Icon = category.icon;
                        return (
                          <SidebarMenuItem key={category.id}>
                            <SidebarMenuButton
                              isActive={activeCategory === category.id}
                              onClick={() => setActiveCategory(category.id)}
                            >
                              <Icon />
                              <span>{category.label}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </Sidebar>

            <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6">
              <div className="max-w-3xl space-y-4">
                <div>
                  <h3 className="m-0 text-base font-medium">
                    {activeCategoryLabel}
                  </h3>
                  {activeCategory === "keybindings" ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Click Change, then press a new shortcut. Use Cmd/Ctrl
                      combos.
                    </p>
                  ) : null}
                  {activeCategory === "developer" ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Utilities for debugging and resetting local preferences.
                    </p>
                  ) : null}
                </div>

                {activeCategory === "editor" ? (
                  <ItemGroup className="rounded-md border border-border bg-background">
                    <Item
                      size="sm"
                      className="rounded-none first:rounded-t-md last:rounded-b-md"
                    >
                      <ItemContent>
                        <ItemTitle>Editor text size</ItemTitle>
                        <ItemDescription>
                          Adjust the editor font size.
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="ml-auto">
                        <Button
                          type="button"
                          aria-label="Decrease text size"
                          size="icon"
                          variant="outline"
                          onClick={() => updateTextSize(-1)}
                        >
                          –
                        </Button>
                        <span className="tabular-nums min-w-[52px] text-center">
                          {settings.textSize}px
                        </span>
                        <Button
                          type="button"
                          aria-label="Increase text size"
                          size="icon"
                          variant="outline"
                          onClick={() => updateTextSize(1)}
                        >
                          +
                        </Button>
                      </ItemActions>
                    </Item>
                    <ItemSeparator />
                    <Item
                      size="sm"
                      className="rounded-none first:rounded-t-md last:rounded-b-md"
                    >
                      <ItemContent>
                        <ItemTitle>UI scale</ItemTitle>
                      </ItemContent>
                      <ItemActions className="ml-auto">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              aria-label="Reset UI scale"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              disabled={
                                settings.uiScale === 100 && uiScaleDraft === 100
                              }
                              onClick={resetUiScale}
                            >
                              <RotateCcw className="size-4" />
                            </Button>
                            <span className="tabular-nums min-w-[56px] text-right">
                              {uiScaleDraft}%
                            </span>
                          </div>
                          <Slider
                            value={[uiScaleDraft]}
                            min={63}
                            max={173}
                            step={1}
                            className="w-[200px]"
                            onValueChange={(value: number[]) => {
                              const next = value[0] ?? uiScaleDraft;
                              setUiScaleDraft(next);

                              if (uiScaleDebounceRef.current !== null) {
                                window.clearTimeout(uiScaleDebounceRef.current);
                              }

                              uiScaleDebounceRef.current = window.setTimeout(
                                () => {
                                  uiScaleDebounceRef.current = null;
                                  updateUiScale(next);
                                },
                                180
                              );
                            }}
                            onValueCommit={(value: number[]) => {
                              const next = value[0] ?? uiScaleDraft;
                              setUiScaleDraft(next);
                              if (uiScaleDebounceRef.current !== null) {
                                window.clearTimeout(uiScaleDebounceRef.current);
                                uiScaleDebounceRef.current = null;
                              }
                              updateUiScale(next);
                            }}
                          />
                        </div>
                      </ItemActions>
                    </Item>
                  </ItemGroup>
                ) : null}

                {activeCategory === "appearance" ? (
                  <ItemGroup className="rounded-md border border-border bg-background">
                    <Item
                      size="sm"
                      className="rounded-none first:rounded-t-md last:rounded-b-md"
                    >
                      <ItemContent>
                        <ItemTitle>Follow system theme</ItemTitle>
                        <ItemDescription>
                          Automatically switch between light and dark based on
                          your OS.
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="ml-auto">
                        <Switch
                          checked={settings.followSystem}
                          onCheckedChange={(checked) =>
                            onChange({
                              ...settings,
                              followSystem: checked,
                            })
                          }
                        />
                      </ItemActions>
                    </Item>
                    <ItemSeparator />

                    {!settings.followSystem ? (
                      <Item
                        size="sm"
                        className="rounded-none first:rounded-t-md last:rounded-b-md"
                      >
                        <ItemContent>
                          <ItemTitle>Theme</ItemTitle>
                          <ItemDescription>Pick an app theme.</ItemDescription>
                        </ItemContent>
                        <ItemActions className="ml-auto">
                          <Select
                            value={settings.theme}
                            onValueChange={(value) =>
                              onChange({
                                ...settings,
                                theme: value as ThemeName,
                              })
                            }
                          >
                            <SelectTrigger className="w-[220px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {themeOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {themeDisplayName[option]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </ItemActions>
                      </Item>
                    ) : (
                      <>
                        <Item
                          size="sm"
                          className="rounded-none first:rounded-t-md last:rounded-b-md"
                        >
                          <ItemContent>
                            <ItemTitle>Light theme</ItemTitle>
                            <ItemDescription>
                              Theme used when your OS is in light mode.
                            </ItemDescription>
                          </ItemContent>
                          <ItemActions className="ml-auto">
                            <Select
                              value={settings.systemLightTheme}
                              onValueChange={(value) =>
                                onChange({
                                  ...settings,
                                  systemLightTheme: value as ThemeName,
                                })
                              }
                            >
                              <SelectTrigger className="w-[220px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {themeOptions.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {themeDisplayName[option]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </ItemActions>
                        </Item>
                        <ItemSeparator />
                        <Item
                          size="sm"
                          className="rounded-none first:rounded-t-md last:rounded-b-md"
                        >
                          <ItemContent>
                            <ItemTitle>Dark theme</ItemTitle>
                            <ItemDescription>
                              Theme used when your OS is in dark mode.
                            </ItemDescription>
                          </ItemContent>
                          <ItemActions className="ml-auto">
                            <Select
                              value={settings.systemDarkTheme}
                              onValueChange={(value) =>
                                onChange({
                                  ...settings,
                                  systemDarkTheme: value as ThemeName,
                                })
                              }
                            >
                              <SelectTrigger className="w-[220px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {themeOptions.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {themeDisplayName[option]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </ItemActions>
                        </Item>
                      </>
                    )}
                  </ItemGroup>
                ) : null}

                {activeCategory === "keybindings" ? (
                  <ItemGroup className="rounded-md border border-border bg-background">
                    {(
                      [
                        "open",
                        "save",
                        "openSettings",
                        "bold",
                        "italic",
                        "strikethrough",
                      ] as KeyBindingAction[]
                    ).map((action, index, arr) => {
                      const isActive = listeningFor === action;
                      const isLast = index === arr.length - 1;
                      return (
                        <Fragment key={action}>
                          <Item
                            size="sm"
                            className="rounded-none first:rounded-t-md last:rounded-b-md"
                          >
                            <ItemContent>
                              <ItemTitle>{keyBindingLabels[action]}</ItemTitle>
                              <ItemDescription>
                                {action === "open"
                                  ? "Open a markdown file."
                                  : action === "save"
                                  ? "Save the current file."
                                  : action === "openSettings"
                                  ? "Open this settings dialog."
                                  : action === "bold"
                                  ? "Toggle bold markdown (**…**) for the selection or word."
                                  : action === "italic"
                                  ? "Toggle italic markdown (*…*) for the selection or word."
                                  : "Toggle strikethrough markdown (~~…~~) for the selection or word."}
                              </ItemDescription>
                            </ItemContent>
                            <ItemActions className="ml-auto flex-wrap justify-end">
                              <div className="min-w-[180px] flex justify-end tabular-nums">
                                {isActive ? (
                                  pendingBinding ? (
                                    renderBinding(formatBinding(pendingBinding))
                                  ) : (
                                    <span className="text-sm text-muted-foreground">
                                      Press keys…
                                    </span>
                                  )
                                ) : (
                                  renderBinding(
                                    formatBinding(settings.keyBindings[action])
                                  )
                                )}
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="inline-flex items-center gap-2"
                                onClick={() => {
                                  if (isActive) {
                                    if (
                                      originalBindingRef.current.action ===
                                        action &&
                                      originalBindingRef.current.binding
                                    ) {
                                      onChange({
                                        ...settings,
                                        keyBindings: {
                                          ...settings.keyBindings,
                                          [action]:
                                            originalBindingRef.current.binding,
                                        },
                                      });
                                    }
                                    setPendingBinding(null);
                                    setListeningFor(null);
                                    originalBindingRef.current = {
                                      action: null,
                                      binding: null,
                                    };
                                  } else {
                                    originalBindingRef.current = {
                                      action,
                                      binding: settings.keyBindings[action],
                                    };
                                    setPendingBinding(null);
                                    setListeningFor(action);
                                  }
                                }}
                              >
                                {isActive ? (
                                  <>
                                    Cancel{" "}
                                    <Kbd className="h-5 min-w-5 px-1 text-[11px] font-semibold leading-[1.15]">
                                      Esc
                                    </Kbd>
                                  </>
                                ) : (
                                  "Change"
                                )}
                              </Button>
                            </ItemActions>
                          </Item>
                          {!isLast ? <ItemSeparator /> : null}
                        </Fragment>
                      );
                    })}
                    <ItemSeparator />
                    <Item
                      size="sm"
                      className="rounded-none first:rounded-t-md last:rounded-b-md"
                    >
                      <ItemContent>
                        <ItemTitle>Reset keybindings</ItemTitle>
                        <ItemDescription>
                          Restore the default shortcuts.
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="ml-auto">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={onResetBindings}
                        >
                          Reset
                        </Button>
                      </ItemActions>
                    </Item>
                  </ItemGroup>
                ) : null}

                {activeCategory === "developer" ? (
                  <ItemGroup className="rounded-md border border-border bg-background">
                    <Item
                      size="sm"
                      className="rounded-none first:rounded-t-md last:rounded-b-md"
                    >
                      <ItemContent>
                        <ItemTitle>Clear local storage</ItemTitle>
                        <ItemDescription>
                          Clears saved preferences to test defaults.
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="ml-auto">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={onClearLocalStorage}
                        >
                          Clear
                        </Button>
                      </ItemActions>
                    </Item>
                    <ItemSeparator />
                    <Item
                      size="sm"
                      className="rounded-none first:rounded-t-md last:rounded-b-md"
                    >
                      <ItemContent>
                        <ItemTitle>Open DevTools</ItemTitle>
                        <ItemDescription>
                          Opens Chromium DevTools for debugging.
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="ml-auto">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => window.electronAPI.openDevTools()}
                        >
                          Open
                        </Button>
                      </ItemActions>
                    </Item>
                  </ItemGroup>
                ) : null}

                {activeCategory === "about" ? (
                  <div className="rounded-md border border-border bg-background p-6">
                    <div className="flex flex-col items-center text-center gap-3">
                      <img
                        src={bedrockLogo}
                        alt="Bedrock"
                        className="h-20 w-20 rounded-xl border border-border bg-card p-2"
                      />
                      <div className="space-y-1">
                        <div className="text-lg font-semibold leading-tight">
                          Bedrock
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Version{" "}
                          <span className="font-medium text-foreground">
                            {appVersion ?? "…"}
                          </span>
                        </div>
                      </div>

                      <div className="w-full max-w-md text-left">
                        <ItemGroup className="rounded-md border border-border bg-background">
                          <Item
                            size="sm"
                            className="rounded-none first:rounded-t-md last:rounded-b-md"
                          >
                            <ItemContent>
                              <ItemTitle>Authors</ItemTitle>
                              <ItemDescription>
                                <a
                                  href={ABOUT_LINKS.benWebsite}
                                  className="underline underline-offset-4 hover:text-foreground text-muted-foreground"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    openExternal(ABOUT_LINKS.benWebsite);
                                  }}
                                >
                                  Ben Desprets
                                </a>
                                {", "}Felix Stavonhagen
                              </ItemDescription>
                            </ItemContent>
                          </Item>
                          <ItemSeparator />
                          <Item
                            size="sm"
                            className="rounded-none first:rounded-t-md last:rounded-b-md"
                          >
                            <ItemContent>
                              <ItemTitle>GitHub</ItemTitle>
                              <ItemDescription>
                                <a
                                  href={ABOUT_LINKS.githubRepo}
                                  className="underline underline-offset-4 hover:text-foreground text-muted-foreground"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    openExternal(ABOUT_LINKS.githubRepo);
                                  }}
                                >
                                  {ABOUT_LINKS.githubRepo}
                                </a>
                              </ItemDescription>
                            </ItemContent>
                          </Item>
                        </ItemGroup>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </SidebarProvider>
      </div>
    </div>
  );
};

export default SettingsModal;
