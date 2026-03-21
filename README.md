## Bedrock

Bedrock is a minimal Markdown-focused text editor built with **Electron + React + CodeMirror 6**.

### Features

- **Single-window** editor
- **Open/Save/Save As** Markdown files (`.md`)
- **Hybrid Markdown mode** (renders structure while editing) + raw mode
- **Customizable keybindings** (Settings)
- **Themes + UI scaling**
- **Electron E2E pipeline** with Playwright traces/screenshots for agent debugging
- **Sentry-ready telemetry hooks** for main/renderer runtime failures
- **Linear + GitHub helper scripts** for agent issue and PR workflows

### Development

- **Install**: `pnpm install`
- **Run (dev)**: `pnpm dev`
- **Lint**: `pnpm lint`
- **Typecheck**: `pnpm typecheck`
- **Unit tests**: `pnpm test:unit`
- **Electron E2E**: `pnpm test:e2e`
- **Full local CI pass**: `pnpm test`
- **Package/build**:
  - `pnpm package`
  - `pnpm build`

### Agent pipeline

- CI now runs `lint`, `typecheck`, `unit`, and real Electron `e2e` jobs
- PR flow is optimized for draft PRs with artifact links and agent labels
- Runtime telemetry can be enabled with `SENTRY_DSN`
- Linear issue creation is available via `pnpm linear:create-issue`

See [docs/agent-workflow.md](./docs/agent-workflow.md) for the full agent operating model.

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
