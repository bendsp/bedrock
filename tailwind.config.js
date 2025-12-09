/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        background: "var(--bg-body)",
        foreground: "var(--text-body)",
        panel: "var(--panel-bg)",
        border: "var(--panel-border)",
        muted: "var(--muted-text)",
        button: {
          DEFAULT: "var(--button-bg)",
          border: "var(--button-border)",
          foreground: "var(--button-text)",
        },
      },
      borderRadius: {
        lg: "12px",
        md: "10px",
        sm: "8px",
      },
    },
  },
  plugins: [],
};

