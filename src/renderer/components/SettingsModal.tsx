import React from "react";

type SettingsModalProps = {
  onClose: () => void;
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

const SettingsModal = ({ onClose }: SettingsModalProps) => {
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
          <p style={{ color: "#b9bec9", marginTop: 0 }}>
            Configure your Bedrock experience. Add controls and sections here.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
