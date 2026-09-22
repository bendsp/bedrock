## Bedrock — Agent Guide

This document gives code-aware agents a concise mental model of Bedrock’s architecture, key abstractions, and safe-contribution rules.

### What Bedrock Is

- **Electron + React** local Markdown workspace with Home and a configurable root folder.
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
    - search signal (menu to renderer)
    - opening external links
    - opening DevTools
- **Preload** (`src/main/preload.ts`)
  - Exposes a minimal, typed surface via `contextBridge` as `window.electronAPI`.
- **Renderer** (`src/renderer/renderer.ts`)
  - Imports global CSS and boots `src/renderer/app.tsx`.

### Renderer Composition

- **App** (`src/renderer/app.tsx`)
  - Owns Home/editor navigation, workspace info, document sessions, saved-content baseline, settings, and theme.
  - Document-replacing operations lock editing; each opened document mounts a fresh editor state to isolate undo history.
  - Wires global shortcuts (open/save/settings) and updates the window title.
  - Passes a CodeMirror keymap + formatting helpers into the editor.
- **Editor host component** (`src/renderer/components/CodeMirrorEditor.tsx`)
  - Mounts an `EditorView` once per document session.
  - Reconfigures compartments for render mode, theme, and keymap.
  - Synchronizes controlled `value` (string) with the CodeMirror document.
- **CodeMirror implementation** (`src/renderer/editor/codemirror/*`)
  - `extensions.ts`: builds the extension bundle + update listeners.
  - `markdownLanguage.ts`: CommonMark/GFM plus highlight, footnote, math, and frontmatter syntax.
  - `markdownDecorations.ts` / `markdownWidgets.ts`: visible syntax styling and cached safe previews.
  - `richTables.ts` / `tables.ts`: always-rendered tables, one active cell editor, source-preserving row edits, shared undo.
  - `markdownContext.ts`: cached document references and footnote numbering shared with cells.
  - `documentText.ts`: LF editor state with original BOM and line-ending serialization.
  - `hybridMarkdown.ts`: composes hybrid decorations. Tables remain outside the raw/hybrid compartment.
  - `commands.ts`: source formatting operations.
  - `src/renderer/commands/commandSystem.ts`: declared commands, availability, palette, shortcuts, and context menus.
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
- Agent/local CI baseline: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:e2e`.

### Agent Truth Sources

- **GitHub**: source of truth for code, draft PRs, CI runs, release artifacts.
- **Linear**: source of truth for active planning and newly discovered work.
- **Sentry**: source of truth for runtime failures in Electron main/renderer.
- **Playwright artifacts**: source of truth for Electron UI regressions and reproduction evidence.

---

## Quick File Map

- `src/main/index.ts`: Electron app bootstrap, menus, IPC, file IO.
- `src/main/workspace.ts`: selected root pointer, exclusive note creation, and per-root recent-file JSON.
- `src/renderer/components/Home.tsx`: first-use root setup and recently opened notes.
- `src/main/preload.ts`: `window.electronAPI` bridge.
- `src/renderer/renderer.ts`: renderer entrypoint.
- `src/renderer/app.tsx`: React app root.
- `src/renderer/components/CodeMirrorEditor.tsx`: CodeMirror mount + reconfigure.
- `src/renderer/components/SearchPanel.tsx`: Shadcn-based search UI.
- `src/renderer/editor/codemirror/*`: CodeMirror commands/extensions/theme/search.
- `src/renderer/settings.ts`: persisted user settings.
- `src/renderer/lib/export.ts`: markdown-it HTML conversion utilities.
- `src/shared/types.ts`: shared IPC types + editor mode/cursor types.

---

## Scratchpad — Features & Changes

- 2026-09-22: Replaced the placeholder with Ben's Icon Composer folder mark, preserving its sharp notch. Source is `src/assets/bedrock.icon`; `scripts/generate-icons.py` regenerates PNG, ICNS, and ICO. The Windows installer also uses the approved icon.

- 2026-09-08: Added isolated `pnpm install:local` packaging and installation of Bedrock Dev with its own bundle ID and user data. CI is reusable and runs on main; releases require valid tags and passing checks, build both macOS architectures, validate signing/notarization, and upload a complete draft with checksums. Published releases are protected. See `docs/releases.md`; automatic updates and Windows signing remain unimplemented.

- 2026-09-08: Added Cmd/Ctrl+P quick-open for workspace filenames, paths, and contents, plus paste/drop/attach image commands. `src/main/workspaceFiles.ts` owns bounded search and exclusive attachment writes; `QuickOpen.tsx` owns the search dialog. Images live in root `Attachments/` with links relative to the canonical note path. All entry points use the command registry. Added filesystem and Electron tests for portability, aliases, table-cell paste, dirty-state navigation, and IPC boundaries.

- 2026-09-08: Added arrow entry/exit and cell navigation for rendered tables, including quotes, wrapped text, and virtual cells in short rows. Table spacing now uses measured padding to preserve cursor geometry below tables. Reference definitions retain paragraph boundaries and indentation; the command palette groups categories with a compact search layout. Follow-up coverage: `tests/e2e/navigation.e2e.spec.ts`.

- 2026-09-08: Markdown core pass added persistent active heading styles, nested inline formatting, parser-based lists/tasks/rules/fences, images, references, footnotes, math, safe HTML, frontmatter, and a shared command palette. Tables stay rendered in both modes and support cell editing, spreadsheet paste, row/column operations, and shared undo. File writes and exports are atomic, external edits are protected, original text encoding markers/line endings/permissions are preserved, IPC is restricted to the trusted frame, Electron is updated, and telemetry omits private note data. See `docs/quality/core-pass.md` for validation and remaining release constraints.

- 2026-09-07: Forge selects available renderer and logger development ports starting at 3000 and 9000 so other local servers do not block startup.

- 2026-09-06: Added first-use root selection with Documents/Bedrock suggestion, Settings → Files, root-scoped note creation and recent-file data, and Home as the normal start screen. Root switches preserve existing files. Document sessions isolate undo; saved-content comparison protects identical-content opens; navigation locks editing and serializes Finder opens. Added workspace persistence/failure and Electron workflow tests.

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
- 2025-12-22: Implemented global search functionality with a custom Shadcn `InputGroup` floating panel, integrated via CodeMirror 6's panel system and the main process menu.
- 2025-12-22: Added toggle logic to the search command and synchronized the search shortcut with user settings.
- 2025-12-21: Added support for Markdown horizontal rules (--- and ***) with hybrid decorations and context menu insert command.
- 2025-12-22: Enforced blank line requirement before horizontal rules (--- and ***) for hybrid decorations and insertion command.
- 2025-12-22: Updated release workflow to automatically set version from tags for release builds.
- 2026-03-21: Migrated the repo from npm to pnpm, added pnpm build approvals, and switched GitHub release automation to pnpm installs/builds.
- 2026-03-21: Added a Playwright-based Electron E2E harness with test-only dialog/user-data controls for reproducible agent testing.
- 2026-03-21: Added Sentry-ready telemetry hooks for Electron main/renderer plus Linear/GitHub helper scripts for agent issue and repo bootstrap workflows.
- 2026-03-22: Main-process uncaught exceptions now flush telemetry and exit, and release automation no longer pushes version-bump commits directly to protected `main`.
- 2026-03-29: Added macOS `.md` document registration plus queued Finder/open-file handling so Bedrock can appear in Finder `Open With…`, reuse the existing single window, and honor dirty-document discard prompts for externally opened Markdown files.
- 2026-04-19: Tightened external-open startup handling in the renderer and reset main-process renderer readiness after renderer termination so queued Finder opens recover more safely.
- 2026-05-09: Completed a repo quality pass adding Markdown line commands (lists, tasks, quotes, code blocks), editor font-family settings, document stats, and main-process file/export IPC hardening.
