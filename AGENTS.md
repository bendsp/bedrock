## Bedrock — Agent Guide

This document gives code-aware agents a concise mental model of Bedrock’s architecture, key abstractions, and safe-contribution rules.

### What Bedrock Is

- **Electron + React** text editor.
- **Single-window** app.
- The editor surface is **CodeMirror 6** (not a custom textarea editor).
- Node integration is disabled in the renderer; all privileged work happens in the **main** process.

## Architecture Overview

### Processes and Entry Points

- **Main process** (`src/main/index.ts`)
  - Creates the `BrowserWindow`, installs the application menu, and owns privileged APIs.
  - Implements IPC handlers for:
    - file open/save
    - discard-change confirmation
    - app version
    - opening external links
    - opening DevTools
- **Preload** (`src/main/preload.ts`)
  - Exposes a minimal, typed surface via `contextBridge` as `window.electronAPI`.
- **Renderer** (`src/renderer/renderer.ts`)
  - Imports global CSS and boots `src/renderer/app.tsx`.

### Renderer Composition

- **App** (`src/renderer/app.tsx`)
  - Owns app state: `doc`, file path, dirty state, settings, and theme.
  - Wires global shortcuts (open/save/settings) and updates the window title.
  - Passes a CodeMirror keymap + formatting helpers into the editor.
- **Editor host component** (`src/renderer/components/CodeMirrorEditor.tsx`)
  - Mounts an `EditorView` once.
  - Reconfigures compartments for render mode, theme, and keymap.
  - Synchronizes controlled `value` (string) with the CodeMirror document.
- **CodeMirror implementation** (`src/renderer/editor/codemirror/*`)
  - `extensions.ts`: builds the extension bundle + update listeners.
  - `hybridMarkdown.ts`: hybrid Markdown decorations (line + marker hiding).
  - `commands.ts`: formatting commands (wrap selection/word, markdown link).
  - `theme.ts`: CodeMirror theme bridge.

### Shared Types

- **Shared contracts** live in `src/shared/types.ts`.
  - Includes `RenderMode`, `CursorPosition`, and IPC payload/result types.

---

## Flow of Control (Typing)

1. User types in CodeMirror.
2. CodeMirror updates its internal document.
3. The update listener in `extensions.ts` calls `onDocChange(docString)`.
4. `App` stores the new doc string and marks the document dirty.
5. `CodeMirrorEditor` ignores redundant value updates (string equality check) to avoid feedback loops.

---

## Contribution Rules (Keep It Clean)

### Separation of Concerns

- **Main**: file dialogs, filesystem operations, OS integration.
- **Preload**: minimal, typed bridge only; no business logic.
- **Renderer**: UI + editor composition; no filesystem or Node APIs.
- **CodeMirror extensions**: isolated, testable logic for editing behaviors.

### IPC and Security

- Keep Node integration disabled in the renderer.
- Expose only necessary functions through `contextBridge`.
- Validate all untrusted inputs in the main process (file paths, URLs, content size).

### Testing and Manual Checks

- Smoke test: launch, type, open/save, toggle settings, verify dirty-state prompts.
- Formatting commands: bold/italic/link behave for both empty selection and selection.

---

## Quick File Map

- `src/main/index.ts`: Electron app bootstrap, menus, IPC, file IO.
- `src/main/preload.ts`: `window.electronAPI` bridge.
- `src/renderer/renderer.ts`: renderer entrypoint.
- `src/renderer/app.tsx`: React app root.
- `src/renderer/components/CodeMirrorEditor.tsx`: CodeMirror mount + reconfigure.
- `src/renderer/editor/codemirror/*`: CodeMirror commands/extensions/theme.
- `src/renderer/lib/*`: shared renderer utilities (editor logic, etc).
- `src/renderer/settings.ts`: persisted user settings.
- `src/shared/types.ts`: shared IPC types + editor mode/cursor types.

---

## Scratchpad — Features & Changes

- 2025-11-10: Created `AGENTS.md` with architecture overview and contribution rules.
- 2025-11-10: Added scratchpad section and rule to keep it updated.
- 2025-11-10: Implemented Markdown open/save workflow with dirty-state confirmations.
- 2025-11-12: Added live Markdown preview and shortcut regression tests.
- 2025-11-12: Added hybrid/raw mode toggle and refreshed styling/QA notes.
- 2025-11-28: Refactored type definitions to `src/shared/types.ts` and deduplicated UI logic in `app.tsx`.
- 2025-11-28: Updated CSS for custom scrollbars and fixed box-sizing to prevent horizontal overflow.
- 2025-12-13: Updated Settings UI to a shadcn sidebar + item-row layout and bridged Bedrock theme tokens to shadcn HSL CSS variables.
- 2025-12-13: Refactored scaling to be custom again (separate from Electron zoom) and added a shadcn Slider-based UI scale control (63%–173%).
- 2025-12-19: Removed legacy textarea/model editor stack and deprecated markdown-it/DOMPurify preview pipeline in favor of CodeMirror-first hybrid Markdown decorations.
- 2025-12-20: Fixed double-triggering of global shortcuts (Open/Save/Settings) by respecting `event.defaultPrevented` in the global keydown listener.
- 2025-12-21: Added support for Markdown horizontal rules (--- and \*\*\*) with hybrid decorations and context menu insert command.
