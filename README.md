## Bedrock

Bedrock is a minimal Markdown-focused text editor built with **Electron + React + CodeMirror 6**.

### Features

- **Single-window** editor
- **Open/Save/Save As** Markdown files (`.md`)
- **Hybrid Markdown mode** (renders structure while editing) + raw mode
- **Customizable keybindings** (Settings)
- **Themes + UI scaling**

### Development

- **Install**: `npm install`
- **Run (dev)**: `npm start`
- **Lint**: `npm run lint`
- **Tests**: `npm test`
- **Package/build**:
  - `npm run package`
  - `npm run build`

### Architecture (high level)

- **Main process**: `src/main/index.ts`
  - Owns file dialogs + file IO
  - Exposes safe operations via IPC handlers
- **Preload**: `src/main/preload.ts`
  - Exposes a typed `window.electronAPI` surface (no Node integration in renderer)
- **Renderer**: `src/renderer/app.tsx`
  - Hosts the React app and wires `CodeMirrorEditor`
- **Editor**:
  - `src/renderer/components/CodeMirrorEditor.tsx` mounts CodeMirror, reconfigures extensions
  - `src/renderer/editor/codemirror/*` contains CodeMirror extensions (hybrid Markdown decorations, theme, keymaps, commands)

### IPC surface

The renderer only talks to Electron via `window.electronAPI` (typed in `src/shared/types.ts`).

### Security

- Renderer runs without Node integration.
- File system access is confined to the main process.
- External URL opening is validated in main (`http(s)` only).
