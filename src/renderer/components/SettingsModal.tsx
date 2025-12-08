import React, { useEffect, useState } from "react";
import { KeyBindingAction, UserSettings } from "../settings";
import {
  eventToBinding,
  formatBinding,
  keyBindingLabels,
  isModifierKey,
} from "../keybindings";
import { themeOptions, ThemeName, themeDisplayName } from "../theme";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Switch } from "./ui/switch";

type SettingsModalProps = {
  settings: UserSettings;
  onClose: () => void;
  onChange: (settings: UserSettings) => void;
  onResetBindings: () => void;
  onClearLocalStorage: () => void;
};

const SettingsModal = ({
  settings,
  onClose,
  onChange,
  onResetBindings,
  onClearLocalStorage,
}: SettingsModalProps) => {
  const [listeningFor, setListeningFor] = useState<KeyBindingAction | null>(
    null
  );
  const [pendingBinding, setPendingBinding] = useState<string | null>(null);

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
      const binding = eventToBinding(event);
      if (!binding) {
        return;
      }
      setPendingBinding(binding);
      event.preventDefault();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isModifierKey(event.key)) {
        return;
      }
      if (!pendingBinding) {
        return;
      }
      onChange({
        ...settings,
        keyBindings: {
          ...settings.keyBindings,
          [listeningFor]: pendingBinding,
        },
      });
      setPendingBinding(null);
      setListeningFor(null);
      event.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
    };
  }, [listeningFor, onChange, pendingBinding, settings]);

  const updateTextSize = (delta: number) => {
    const next = Math.min(28, Math.max(12, settings.textSize + delta));
    if (next !== settings.textSize) {
      onChange({ ...settings, textSize: next });
    }
  };

  const keyBindingRows = (
    ["open", "save", "openSettings"] as KeyBindingAction[]
  ).map((action) => {
    const isActive = listeningFor === action;
    return (
      <div key={action} className="flex items-center gap-3">
        <span className="w-32 text-[0.9em] text-[color:var(--muted-text)]">
          {keyBindingLabels[action]}
        </span>
        <div className="flex items-center gap-2 min-h-8">
          <span className="text-[color:var(--panel-text)] tabular-nums min-w-[80px]">
            {isActive
              ? pendingBinding
                ? formatBinding(pendingBinding)
                : "Press keys…"
              : formatBinding(settings.keyBindings[action])}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setListeningFor(isActive ? null : action)}
          >
            {isActive ? "Cancel" : "Change"}
          </Button>
        </div>
      </div>
    );
  });

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-[color:var(--overlay)]"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-[90%] h-[90%] bg-[color:var(--panel-bg)] border border-[color:var(--panel-border)] rounded-xl shadow-2xl text-[color:var(--panel-text)] flex flex-col p-6 gap-4 text-base">
        <div className="flex items-center justify-between border-b border-[color:var(--panel-border)] pb-3">
          <h2 className="m-0 text-lg tracking-[0.2px]">Settings</h2>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 overflow-auto pt-1 space-y-4">
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Label className="w-28 text-[0.9em] text-[color:var(--muted-text)]">
                Text size
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  aria-label="Decrease text size"
                  size="icon"
                  onClick={() => updateTextSize(-1)}
                >
                  –
                </Button>
                <span className="text-[color:var(--panel-text)] tabular-nums min-w-[48px] text-center">
                  {settings.textSize}px
                </span>
                <Button
                  type="button"
                  aria-label="Increase text size"
                  size="icon"
                  onClick={() => updateTextSize(1)}
                >
                  +
                </Button>
              </div>
            </div>
            <p className="text-[color:var(--muted-text)] mt-1 text-xs">
              Adjust the editor font size. Changes apply immediately.
            </p>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="mt-3 text-base">Theme</h3>
            <p className="text-[color:var(--muted-text)] m-0 text-xs">
              Pick a theme. Colors apply across the app.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Switch
                  checked={settings.followSystem}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...settings,
                      followSystem: checked,
                    })
                  }
                />
                <span className="text-[color:var(--panel-text)] text-[0.95em]">
                  Follow system theme
                </span>
              </div>
              {!settings.followSystem && (
                <Select
                  value={settings.theme}
                  onValueChange={(value) =>
                    onChange({
                      ...settings,
                      theme: value as ThemeName,
                    })
                  }
                >
                  <SelectTrigger>
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
              )}
            </div>
            {settings.followSystem && (
              <div className="flex gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-[color:var(--muted-text)] text-xs">
                    Light mode
                  </span>
                  <Select
                    value={settings.systemLightTheme}
                    onValueChange={(value) =>
                      onChange({
                        ...settings,
                        systemLightTheme: value as ThemeName,
                      })
                    }
                  >
                    <SelectTrigger>
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
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[color:var(--muted-text)] text-xs">
                    Dark mode
                  </span>
                  <Select
                    value={settings.systemDarkTheme}
                    onValueChange={(value) =>
                      onChange({
                        ...settings,
                        systemDarkTheme: value as ThemeName,
                      })
                    }
                  >
                    <SelectTrigger>
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
                </div>
              </div>
            )}
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="mt-3 text-base">Keybindings</h3>
            <p className="text-[color:var(--muted-text)] m-0 text-xs">
              Click change, then press a new shortcut. Use Cmd/Ctrl combos.
            </p>
            {keyBindingRows}
            <div className="flex justify-start">
              <Button
                type="button"
                variant="secondary"
                onClick={onResetBindings}
              >
                Reset bindings
              </Button>
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="mt-3 text-base">Developer</h3>
            <p className="text-[color:var(--muted-text)] m-0 text-xs">
              Clear saved preferences to test defaults.
            </p>
            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={onClearLocalStorage}
              >
                Clear local storage
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
