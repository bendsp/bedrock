# Hybrid Markdown (CodeMirror 6) — Architecture Notes

This document describes Bedrock’s **hybrid Markdown** behavior as implemented in CodeMirror 6.

## Overview

Bedrock uses CodeMirror’s Markdown language package for parsing and a custom view plugin to provide a hybrid experience:

- **Raw mode**: normal CodeMirror markdown editing.
- **Hybrid mode**: adds _decorations_ that style Markdown structure and hide certain markers when the cursor/selection isn’t in that region.

## Where it lives

- `src/renderer/editor/codemirror/extensions.ts`
  - Builds the extension bundle and update listeners.
  - Enables `hybridMarkdown()` only when render mode is `"hybrid"`.
- `src/renderer/editor/codemirror/hybridMarkdown.ts`
  - Implements a `ViewPlugin` that classifies lines (headings/lists/quotes/fences) and applies:
    - line decorations (classes)
    - mark decorations to hide syntax markers when inactive

## Rendering model

Hybrid mode is **not** HTML preview. It is still CodeMirror text rendering + decorations.

Why:

- Avoids `dangerouslySetInnerHTML`
- Keeps selection/IME behavior stable
- Keeps performance predictable (recomputes only on doc/selection/viewport changes)

## QA checklist

- Toggle hybrid/raw mode and verify headings/lists/quotes/fences behave.
- Ensure markers hide/show correctly as you move the cursor into/out of regions.
- Verify right-click formatting targets the expected word when there is no selection.
