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

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "var(--overlay)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  width: "90%",
  height: "90%",
  backgroundColor: "var(--panel-bg)",
  border: "1px solid var(--panel-border)",
  borderRadius: "12px",
  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45)",
  color: "var(--panel-text)",
  display: "flex",
  flexDirection: "column",
  padding: "24px",
  gap: "16px",
  fontSize: "var(--editor-font-size, 16px)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  borderBottom: "1px solid var(--panel-border)",
  paddingBottom: "12px",
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
      <div
        key={action}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ width: 120, color: "#c1c7d0", fontSize: "0.9em" }}>
          {keyBindingLabels[action]}
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minHeight: 32,
          }}
        >
          <span
            style={{
              color: "#dfe3ea",
              fontVariantNumeric: "tabular-nums",
              minWidth: 80,
            }}
          >
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
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={modalStyle}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: "18px", letterSpacing: "0.2px" }}>
            Settings
          </h2>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div style={{ flex: 1, overflow: "auto", paddingTop: "4px" }}>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Label
                htmlFor="text-size"
                style={{ width: 120, color: "#c1c7d0", fontSize: "0.9em" }}
              >
                Text size
              </Label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Button
                  type="button"
                  aria-label="Decrease text size"
                  size="icon"
                  onClick={() => updateTextSize(-1)}
                >
                  –
                </Button>
                <span
                  style={{
                    color: "#dfe3ea",
                    fontVariantNumeric: "tabular-nums",
                    minWidth: 48,
                    textAlign: "center",
                  }}
                >
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
            <p style={{ color: "#8f97a5", margin: "4px 0 0 0", fontSize: 12 }}>
              Adjust the editor font size. Changes apply immediately.
            </p>
          </section>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h3 style={{ margin: "12px 0 0 0", fontSize: "1em" }}>Theme</h3>
            <p style={{ color: "var(--muted-text)", margin: 0, fontSize: 12 }}>
              Pick a theme. Colors apply across the app.
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Switch
                  checked={settings.followSystem}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...settings,
                      followSystem: checked,
                    })
                  }
                />
                <span
                  style={{ color: "var(--panel-text)", fontSize: "0.95em" }}
                >
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
                    <SelectValue
                      placeholder={themeDisplayName[settings.theme]}
                    />
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
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "var(--muted-text)", fontSize: 12 }}>
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
                      <SelectValue
                        placeholder={
                          themeDisplayName[settings.systemLightTheme]
                        }
                      />
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
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "var(--muted-text)", fontSize: 12 }}>
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
                      <SelectValue
                        placeholder={themeDisplayName[settings.systemDarkTheme]}
                      />
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
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h3 style={{ margin: "12px 0 0 0", fontSize: "1em" }}>
              Keybindings
            </h3>
            <p style={{ color: "var(--muted-text)", margin: 0, fontSize: 12 }}>
              Click change, then press a new shortcut. Use Cmd/Ctrl combos.
            </p>
            {keyBindingRows}
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <Button
                type="button"
                variant="secondary"
                onClick={onResetBindings}
              >
                Reset bindings
              </Button>
            </div>
          </section>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h3 style={{ margin: "12px 0 0 0", fontSize: "1em" }}>Developer</h3>
            <p style={{ color: "var(--muted-text)", margin: 0, fontSize: 12 }}>
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
