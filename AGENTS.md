## Bedrock — Agent Guide

This document gives code-aware agents a concise mental model of Bedrock’s architecture, key abstractions, and safe-contribution rules. It focuses on how the text editor works today and where to extend it next (IPC/file I/O, selections, richer editing).

### What Bedrock Is

- **Electron + React** text editor with a minimal MVC-like core.
- **Single-window** app; Node integration is disabled in the renderer for security.
- The editor uses a **model (text state)**, a **controller (keyboard -> commands)**, and a **view (React `textarea`)** wired via events.

## Architecture Overview

### Processes and Entry Points

- **Main process** (`src/main/index.ts`)
  - Creates the `BrowserWindow`, wires the **preload** script, and loads the renderer bundle.
  - There is currently no app menu or IPC wiring beyond preload exposure.
- **Preload** (`src/main/preload.ts`)
  - Uses `contextBridge.exposeInMainWorld("electronAPI", {})`.
  - Currently exposes an empty surface. Add safe, typed IPC bridges here.
- **Renderer** (`src/renderer/renderer.ts`)
  - Imports global styles, logs a startup message, and boots `src/renderer/app.tsx`.

### Renderer Composition

- **App** (`src/renderer/app.tsx`)
  - Creates a `LinesModel` and an `EditorController`.
  - Passes the controller’s `handleKeyDown` and the model to the `Editor` component.
  - Binds a `ref` to receive an `EditorView` interface from `Editor`.
- **Editor component (View)** (`src/renderer/components/editor.tsx`)
  - A React `textarea` wrapped with `forwardRef` to implement the `EditorView`:
    - `render(text: string)` updates the textarea’s controlled value.
    - `setCursorPosition(position)` sets the selection to match model cursor.
  - Subscribes to model events and mirrors text/cursor to the DOM.
  - Delegates `onKeyDown` back to the controller (no DOM mutations beyond React state).
- **Controller** (`src/renderer/controllers/EditorController.ts`)
  - Translates key events to model mutations (characters, Enter, Backspace, Arrow keys).
  - Prevents default browser editing and uses model APIs instead.
  - Performs an initial `view.render(model.getAll() || "")` bootstrap.
- **Model** (`src/renderer/models/LinesModel.ts`)
  - Text is stored as an array of lines plus a single cursor with a `lastChar` cache for vertical moves.
  - Emits events on content/cursor changes; consumers update accordingly.
  - Handles multi-line insertions (splitting/joining around newline boundaries).
- **Shared types** (`src/shared/types.ts`)
  - Defines cross-layer contracts for model/view and event semantics.

### Data and Invariants

- Text is the single source of truth in the model (`lines: string[]`).
- Cursor is always clamped within current line length.
- `lastChar` caches horizontal intent when moving Up/Down.
- `getAll()` logically returns the entire buffer as one string (joined by `\n`). The type is `string | undefined` for generality; the current model returns a string.

---

## Flow of Control (Typing a Character)

1. User presses a printable key in the `textarea`.
2. `Editor` calls `onKeyDown` passed from `EditorController`.
3. Controller `preventDefault()` and calls `model.insertChar(key)`.
4. Model updates internal state and emits `CONTENT_CHANGED` (and possibly `CURSOR_MOVED`).
5. `Editor`’s listeners update the controlled `value` and caret position.

Arrow keys, Backspace, and Enter follow the same pattern via specific model APIs.

---

## Contribution Rules (Keep It Clean)

### Separation of Concerns

- **Model**: Pure state transitions + event emission. No DOM, no React, no Electron.
- **Controller**: Translates UI events to model operations. Avoid direct DOM manipulation. No business logic that belongs in the model.
- **View**: React-only. Renders from model state and delegates interactions to the controller. Keep it controlled and deterministic.

### Types and Events

- Update `src/shared/types.ts` when introducing new model/view capabilities.
- Prefer enums for event types; avoid magic strings.
- Emit events only after state is consistent. Avoid re-entrant loops (e.g., guard inside `setCursor` is already in place).

### IPC and Security

- Keep Node integration disabled in the renderer.
- Expose only necessary, typed functions through `contextBridge` in preload.
- Validate all untrusted inputs in the main process (e.g., file paths, content size).

### Coding Style

- Prefer descriptive names over abbreviations; keep functions small and focused.
- Early returns over deep nesting; avoid unnecessary try/catch.
- Maintain cursor invariants and update `lastChar` whenever vertical movement occurs.
- When modifying the model, always ensure a corresponding event is emitted.

### Testing and Manual Checks

- Basic smoke tests: launch, type, backspace, newline, move with arrows.
- When adding features, add small scenarios that exercise both state and events.

### Scratchpad / Changelog Hygiene

- Maintain the scratchpad at the end of this document.
- Add a short, dated entry for every feature or change merged (what and why, link to PR/commit).
- Keep entries concise and scoped to user-facing or architectural changes.

---

## Quick File Map

- `src/main/index.ts`: Electron app bootstrap and window creation.
- `src/main/preload.ts`: `window.electronAPI` exposure via `contextBridge`.
- `src/renderer/renderer.ts`: Renderer entry; imports CSS and starts `App`.
- `src/renderer/app.tsx`: Wires `LinesModel`, `EditorController`, and `Editor` view.
- `src/renderer/components/editor.tsx`: React `textarea` implementing `EditorView`.
- `src/renderer/controllers/EditorController.ts`: Keyboard -> model operations.
- `src/renderer/models/LinesModel.ts`: Text buffer, cursor, events.
- `src/shared/types.ts`: Shared contracts for model/view/events.

---

## Small Implementation Notes

- `LinesModel` keeps a per-line array and cursor state; `DocumentModel` is a buffer-backed implementation using a single string plus cursor offset helpers; `RopeModel` uses a balanced rope with leaf chunks (~2 KB) that stores length and line metadata.
- `RopeModel` emits the same model events as other implementations and supports undo/redo via compact change records (insert/delete). It also exposes helpers `getTextInRange` and `forEachChunk` for non-copying iteration.
- Multi-line inserts and deletes in `DocumentModel`/`RopeModel` operate on string slices; vertical movement still tracks `lastChar` for consistent column memory.
- `getAll()` returns the full text string; `EditorController` bootstraps the view with `model.getAll() || ""` to account for the broader interface contract.
- Cursor clamping prevents caret from exceeding current line length, which is important after edits and vertical moves.

---

If you’re unsure where a responsibility belongs: default to the model for text state and invariants, the controller for translating inputs to model commands, and the view for rendering+delegation only. Add new IPC in preload/main, never directly in the renderer.

---

## Scratchpad — Features & Changes

- 2025-11-10: Created `AGENTS.md` with architecture overview and contribution rules.
- 2025-11-10: Added scratchpad section and rule to keep it updated.
- 2025-11-10: Implemented Markdown open/save workflow with dirty-state confirmations.
- 2025-11-12: Added live Markdown preview using markdown-it + DOMPurify, preview UI, and shortcut regression tests.
- 2025-11-12: Swapped split preview for inline hybrid editing, added Ctrl+Shift+M raw-mode toggle, controller tests, and refreshed styling/QA notes.
- 2025-11-28: Refactored type definitions to `src/shared/types.ts` and deduplicated UI logic in `app.tsx`.
- 2025-11-28: Updated CSS for custom scrollbars and fixed box-sizing to prevent horizontal overflow.
- 2025-12-06: Added `DocumentModel` (buffer-backed text model) alongside `LinesModel`, improved hybrid Markdown rendering for fenced code blocks, and added model/markdown regression tests.
- 2025-12-06: Added `RopeModel` (balanced rope with chunked leaves, undo/redo, and chunk iteration) and a runtime model selector via `localStorage.getItem("bedrock:model")` (`document` | `lines` | `rope`); default model is now `rope`.
- 2025-12-13: Updated Settings UI to a shadcn sidebar + item-row layout and bridged Bedrock theme tokens to shadcn HSL CSS variables.
- 2025-12-13: Refactored scaling to be custom again (separate from Electron zoom) and added a shadcn Slider-based UI scale control (63%–173%).
