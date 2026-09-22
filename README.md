## Bedrock

Bedrock is a local Markdown workspace built with **Electron + React + CodeMirror 6**.

### Root folder and Home

On first launch, choose a root folder or use the suggested `~/Documents/Bedrock`.
Change it later in **Settings → Files → Root folder**. Switching folders does
not move or delete existing files.

Home lists the 20 most recently opened or created notes for that root. New
creates `Untitled.md`, then `Untitled 2.md`, and so on without overwriting files.
Open and Save As start in the root folder; external Markdown files can still
be opened and edited in place. Home navigation asks before discarding edits.
Normal startup opens Home; opening a Markdown file from Finder opens that file.

Notes remain plain Markdown. Recent-file data is stored in
`.bedrock/recent-files.json` inside the root, with relative paths for notes
inside it and absolute paths for external notes. Only the root-folder pointer
is stored in `workspace-location.json` in Electron's user-data directory.
Appearance and keyboard preferences remain local app settings.

### Find notes and add images

Press **Cmd/Ctrl+P** to find notes by filename, folder path, or content. Use the
arrow keys and Enter to open a result. Quick-open also appears on Home and in
the command palette. It searches Markdown files directly, including subfolders.
Hidden folders and symbolic links are skipped; a footer indicates limited results.
Search returns up to 80 notes and scans up to 50,000 directory entries. Content
search reads notes up to 1 MB, with a 32 MB total budget per query.

Paste or drop images into a note, or choose **Attach images…** in the command
palette or editor context menu. Bedrock copies them into `Attachments/` under
your root folder and inserts ordinary relative Markdown links. Moving the whole
folder keeps the links working. Notes opened outside the root must first be
saved inside it to import images.

PNG, JPEG, GIF, and WebP files are supported: up to 10 images at once, 10 MB each,
and 25 MB combined. Undo removes the inserted links but retains attachment files,
which may also be used by other notes.

### Features

- **Single-window** editor
- **Open/Save/Save As** Markdown files (`.md`)
- **Hybrid Markdown mode** keeps headings and inline formatting styled while exposing editable markers
- **Rendered tables in both modes** with cell editing, Tab/Enter navigation, spreadsheet paste, alignment, row/column insertion, deletion and movement
- **Command palette** on Ctrl/Cmd+K, with formatting and table context menus from the same registry
- **CommonMark/GFM** lists, tasks, quotes, fences, references, images, escapes and rules, plus highlights, footnotes, math, safe HTML and YAML frontmatter
- **HTML/PDF export** with local raster images embedded and scripts removed
- **Customizable keybindings** (Settings)
- **Themes + UI scaling**
- **Electron E2E pipeline** with Playwright traces/screenshots for agent debugging
- **Sentry-ready telemetry hooks** for main/renderer runtime failures
- **Linear + GitHub helper scripts** for agent issue and PR workflows

### Development

- **Install**: `pnpm install`
- **Install local app**: `pnpm install:local` builds and opens a separate `~/Applications/Bedrock Dev.app`
- **Run (dev)**: `pnpm dev` selects available renderer/logger ports starting at 3000/9000
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
- The sandboxed renderer and its trusted main frame use a narrow, validated IPC bridge. Navigation and new windows are blocked.
- External links allow `http`, `https`, and `mailto`; relative note/image links stay within the permitted folder.
- Notes and exports use atomic replacement. A changed disk file cannot silently overwrite either version; Save As preserves your edits.
- UTF-8 files retain BOM and line-ending format. Invalid encodings fail before editing. Notes are limited to 10 MB and exported HTML to 25 MB.
- Telemetry excludes note text, file paths, breadcrumbs, screenshots, local variables and native memory dumps.

See [the core verification record](docs/quality/core-pass.md) for feature coverage, tests, and release constraints.

See [builds and releases](docs/releases.md) for local installation, release tags, signing, and update limitations.
