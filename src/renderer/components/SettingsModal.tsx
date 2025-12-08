import React from "react";
import { UserSettings } from "../settings";

type SettingsModalProps = {
  settings: UserSettings;
  onClose: () => void;
  onChange: (settings: UserSettings) => void;
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  width: "90%",
  height: "90%",
  backgroundColor: "#1b1e24",
  border: "1px solid #2a2f38",
  borderRadius: "12px",
  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45)",
  color: "#e6e9ef",
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
  borderBottom: "1px solid #2e3440",
  paddingBottom: "12px",
};

const closeButtonStyle: React.CSSProperties = {
  backgroundColor: "#3a3f4b",
  border: "1px solid #4b5263",
  borderRadius: "4px",
  color: "#eef1f6",
  cursor: "pointer",
  fontSize: "12px",
  padding: "4px 10px",
};

const SettingsModal = ({ settings, onClose, onChange }: SettingsModalProps) => {
  const updateTextSize = (delta: number) => {
    const next = Math.min(28, Math.max(12, settings.textSize + delta));
    if (next !== settings.textSize) {
      onChange({ ...settings, textSize: next });
    }
  };

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
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
