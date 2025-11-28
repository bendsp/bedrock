# Markdown Preview Architecture Notes

## Library Selection

-   **Renderer**: [`markdown-it`](https://github.com/markdown-it/markdown-it) chosen for its small bundle size (~35 kB minified), CommonMark compliance, rich plugin ecosystem, and first-class TypeScript types.
-   **Sanitizer**: [`dompurify`](https://github.com/cure53/DOMPurify) runs in the renderer process, strips scriptable attributes, and keeps the output DOM-safe without depending on Node APIs.
-   **Alternatives considered**:
    -   `remark`: flexible AST tooling but substantially larger; requires additional bridges (unified, rehype) to reach HTML output.
    -   `marked`: very small footprint but lacks built-in plugin system and produces raw HTML without guards; hardening would require custom patches.
-   **Configuration assumptions**:
    -   We only enable built-in Markdown rules (no HTML by default); `markdown-it` is constructed with `html: false`, `linkify: true`, `typographer: true`.
    -   Sanitization runs on every render; custom plugins must emit safe output or register whitelists with DOMPurify.
    -   Rendering occurs entirely in the renderer thread; expensive plugins should be avoided to keep typing latency low.

## Rendering Pipeline Overview

1. Assemble the full buffer via `LinesModel.getAll()`.
2. Pass the string through `markdown-it` for HTML generation.
3. Sanitize the resulting markup with `dompurify`.
4. Render sanitized HTML inside `MarkdownPreview` using `dangerouslySetInnerHTML`.
5. Use throttled updates (250 ms default) to balance responsiveness and performance.

## Inline Editing Mode

-   Every non-active line now renders as Markdown inline while the focused line stays raw for editing.
-   `Ctrl+Shift+M` toggles between the hybrid inline mode and a full raw-text mode for parity with traditional editors.
-   Click interactions move the cursor to the start of the requested line; keyboard navigation still flows entirely through the controller.
-   Both modes share the same controller shortcuts and sanitization pipeline, keeping future features consistent.

## Extension Points

-   Future plugins are registered in `markdownRenderer.ts` before export.
-   Syntax highlighting for fenced code blocks can be added by wiring `markdown-it`'s `highlight` callback to a client-safe highlighter such as `shiki` or `prism`.
-   IPC hooks can later hydrate the renderer with persisted Markdown documents or export HTML.

## QA Checklist

-   Launch via `npm start`, type Markdown in the editor, and confirm the preview mirrors content within 250 ms.
-   Exercise formatting shortcuts (`Ctrl/Cmd+B`, `Ctrl/Cmd+I`, `Ctrl/Cmd+K`) and verify rendered output matches expectations.
-   Paste potentially unsafe HTML (for example `<script>alert(1)</script>`) and ensure it is stripped from the preview.
-   Test multi-line documents and code fences to confirm scrolling and block styling remain stable.
-   Toggle between hybrid and raw modes (`Ctrl+Shift+M`) while editing headings, lists, and fenced code blocks to confirm active-line swapping and sanitization fidelity.
