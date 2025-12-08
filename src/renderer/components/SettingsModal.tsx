import React, { useEffect, useState } from "react";
import { KeyBindingAction, UserSettings } from "../settings";
import {
  eventToBinding,
  formatBinding,
  keyBindingLabels,
  isModifierKey,
} from "../keybindings";
import { themeOptions, ThemeName, themeDisplayName } from "../theme";

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

const closeButtonStyle: React.CSSProperties = {
  backgroundColor: "var(--button-bg)",
  border: "1px solid var(--button-border)",
  borderRadius: "4px",
  color: "var(--button-text)",
  cursor: "pointer",
  fontSize: "12px",
  padding: "4px 10px",
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
          <button
            type="button"
            style={closeButtonStyle}
            onClick={() => setListeningFor(isActive ? null : action)}
          >
            {isActive ? "Cancel" : "Change"}
          </button>
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
          <button type="button" style={closeButtonStyle} onClick={onClose}>
            Close
          </button>
        </div>
        <div style={{ flex: 1, overflow: "auto", paddingTop: "4px" }}>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label
                htmlFor="text-size"
                style={{ width: 120, color: "#c1c7d0", fontSize: "0.9em" }}
              >
                Text size
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  aria-label="Decrease text size"
                  style={closeButtonStyle}
                  onClick={() => updateTextSize(-1)}
                >
                  –
                </button>
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
                <button
                  type="button"
                  aria-label="Increase text size"
                  style={closeButtonStyle}
                  onClick={() => updateTextSize(1)}
                >
                  +
                </button>
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
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--panel-text)",
                  fontSize: "0.95em",
                }}
              >
                <input
                  type="checkbox"
                  checked={settings.followSystem}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      followSystem: e.target.checked,
                    })
                  }
                />
                Follow system theme
              </label>
              {!settings.followSystem && (
                <select
                  value={settings.theme}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      theme: e.target.value as ThemeName,
                    })
                  }
                  style={{
                    backgroundColor: "var(--panel-bg)",
                    color: "var(--panel-text)",
                    border: "1px solid var(--panel-border)",
                    borderRadius: 6,
                    padding: "6px 10px",
                  }}
                >
                  {themeOptions.map((option) => (
                    <option key={option} value={option}>
                      {themeDisplayName[option]}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {settings.followSystem && (
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "var(--muted-text)", fontSize: 12 }}>
                    Light mode
                  </span>
                  <select
                    value={settings.systemLightTheme}
                    onChange={(e) =>
                      onChange({
                        ...settings,
                        systemLightTheme: e.target.value as ThemeName,
                      })
                    }
                    style={{
                      backgroundColor: "var(--panel-bg)",
                      color: "var(--panel-text)",
                      border: "1px solid var(--panel-border)",
                      borderRadius: 6,
                      padding: "6px 10px",
                    }}
                  >
                    {themeOptions.map((option) => (
                      <option key={option} value={option}>
                        {themeDisplayName[option]}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "var(--muted-text)", fontSize: 12 }}>
                    Dark mode
                  </span>
                  <select
                    value={settings.systemDarkTheme}
                    onChange={(e) =>
                      onChange({
                        ...settings,
                        systemDarkTheme: e.target.value as ThemeName,
                      })
                    }
                    style={{
                      backgroundColor: "var(--panel-bg)",
                      color: "var(--panel-text)",
                      border: "1px solid var(--panel-border)",
                      borderRadius: 6,
                      padding: "6px 10px",
                    }}
                  >
                    {themeOptions.map((option) => (
                      <option key={option} value={option}>
                        {themeDisplayName[option]}
                      </option>
                    ))}
                  </select>
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
              <button
                type="button"
                style={{ ...closeButtonStyle, padding: "6px 12px" }}
                onClick={onResetBindings}
              >
                Reset bindings
              </button>
            </div>
          </section>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h3 style={{ margin: "12px 0 0 0", fontSize: "1em" }}>Developer</h3>
            <p style={{ color: "var(--muted-text)", margin: 0, fontSize: 12 }}>
              Clear saved preferences to test defaults.
            </p>
            <div>
              <button
                type="button"
                style={{ ...closeButtonStyle, padding: "6px 12px" }}
                onClick={onClearLocalStorage}
              >
                Clear local storage
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
