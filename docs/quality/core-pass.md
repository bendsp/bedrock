# Markdown and application core verification

Verified locally on 8 September 2026, macOS arm64. This pass preserves plain Markdown files, CodeMirror 6, and the Electron main/preload/renderer boundary. It builds on the existing Home and root-folder work in this checkout.

## Editor behavior

| Area | Implemented and checked |
| --- | --- |
| Headings | ATX levels 1–6 and setext headings. Active source keeps its heading size and weight; inactive markers collapse. Distinct levels and theme-aware colors. |
| Inline formatting | Bold, italic, nested emphasis, strikethrough, highlight, inline code with embedded backticks, Unicode words, escapes, and decoded entities. Formatting toggles preserve selection and undo. |
| Lists and quotes | Ordered and unordered lists, nesting, task checkboxes, Markdown Enter continuation, blockquotes with nested indentation. Task clicks use the same command as keyboard/menu actions. |
| Code and rules | Backtick and tilde fences, language highlighting, indented code, continuous code-block backgrounds, and thematic rules. Code contents are excluded from Markdown transformations. |
| Links | Inline, reference, autolinks, titles, same-note headings, duplicate heading IDs, and relative sibling notes with heading fragments. Modifier-click follows links; Follow link is also a declared command. |
| Images | Safe HTTPS and relative raster images. Local resolution stays in the main process, validates paths/content, limits size, and loads visible images with bounded concurrency. Removed previews dispose observers and listeners. |
| Note extensions | Highlights, inline/display math, footnotes with document-wide numbering, and YAML frontmatter. Metadata remains editable and is omitted from exports, including BOM/CRLF files. |
| HTML | Sanitized inline and block previews, including nested emphasis and quote/list containers. Scripts, handlers, forms, frames, styles, and executable resource URLs are excluded. |
| Export | HTML and PDF share the Markdown renderer. Tables, links, heading anchors, footnotes, local images, and native MathML survive export. Aggregate image/output budgets protect memory and existing export files. |

### Tables have their own editor

Tables remain grids in both Hybrid and Raw modes. Focusing, editing, changing settings, saving, undoing, or opening a context menu does not expose the pipe grid. The saved file remains portable Markdown.

Only the active cell mounts an embedded CodeMirror editor. Inactive cells render sanitized content, including images, math, references, and footnotes. Tab/Shift-Tab moves between cells; Enter advances rows; Shift-Enter inserts a cell line break; Escape returns to the document. Spreadsheet TSV paste can grow the grid. Formatting shares the outer document's undo history and editing lock.

Declared commands cover adding, deleting, and moving rows/columns; column alignment; table normalization; and table deletion. Boundary actions are disabled when unavailable. Tests cover escaped pipes, terminal backslashes, empty cells, borderless/tight tables, short rows, quoted tables, multi-cell paste, focus restoration, and undo. Editing one cell preserves untouched source spacing; explicit table formatting normalizes the table.

### Commands and presentation

One typed registry provides command execution, availability, keyboard bindings, the Cmd/Ctrl+K palette, and context menus. Configured shortcuts take precedence inside table cells too. Palette close restores focus before executing a command; saves restore focus after releasing the editing lock. Native Find no longer reserves a key independently of user settings.

Formatting after tables and math previews has a dedicated regression: replaced blocks split CodeMirror's visible ranges, so the decoration walker must revisit shared ancestors without duplicating decorations. This was found through direct visual inspection.

## Architecture and file integrity

- Markdown structure comes from Lezer's CommonMark/GFM tree. Custom note extensions are contained in `markdownLanguage.ts`; table parsing and edits are isolated in `tables.ts`, and table UI/lifecycle in `richTables.ts`.
- Visible Markdown decorations, cached block previews, document reference context, resource loading, and serialization have separate owners. Cursor movement reuses document context. Table extraction is linear rather than repeatedly scanning rows.
- App operations serialize document replacement and saving, lock both outer and cell editors, and surface failures. Fresh editor sessions isolate undo history. Saved-content comparison handles identical-content opens correctly.
- Notes and exports use same-directory temporary files, flush before replacement, preserve permissions, and clean up failed writes. Revision checks reject overwriting a file changed outside Bedrock; Save As preserves the editor's version.
- Internal LF text is separated from file serialization. UTF-8 BOM and CRLF/CR/LF conventions survive editing and saving. Invalid UTF-8/NUL inputs are rejected.
- Workspace metadata is bounded, written atomically, and serialized. Corrupt metadata is preserved with an error; missing roots are not silently recreated. Failure to update recents does not turn a successful note creation into a reported failure.
- The renderer is sandboxed with context isolation and no Node access. Main IPC validates sender frames, approved paths, content limits, URL schemes, and local resource containment. Unrequested windows, navigation, permissions, and destructive reload shortcuts are blocked.
- Telemetry strips note content, local paths, identities, request/context payloads, breadcrumbs, source context, and stack locals. Native dumps, screenshots, and attachments are disabled. Tests run without a telemetry DSN.
- Webpack preserves ESM input consistently, avoiding duplicate CommonJS/ESM CodeMirror internals when loading code languages. Keyword colors are verified in both themes.
- Electron is pinned to 43.6.0. Forge and compatible dependencies were updated. Development startup selects available renderer/logger ports starting at 3000/9000.

## Verification

The required baseline passes: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, and `pnpm test:e2e`. The E2E command creates a macOS arm64 package before launching real Electron instances.

- **79 unit checks** cover Markdown transactions and undo, table boundary cases, shortcuts, file validation, atomic writes, workspace failures, serialization, and telemetry privacy.
- **34 Electron workflows** cover Home/root setup/restart, external opens, dirty-state prompts, editor sessions, formatting, command routing, tables, settings, save locks/focus, exports, malicious note content, unauthorized IPC, external file conflicts, file encoding, and a one-megabyte note.
- Electron context traces include screenshots, snapshots, and source attachments. Local results are in `playwright-report/` and `test-results/`; the large-note measurement is retained beside this report.
- A separate read-only review exercised 84 table edit/undo probes and verified nested parser containers, frontmatter incremental parsing, image disposal, and shortcut precedence. Findings were fixed and rechecked.
- Development collision check occupied ports 3000 and 9000, then launched the actual Forge app on 3001 and 9001. Computer use confirmed a working Home/editor through `localhost:3001/main_window/index.html`; owned processes were stopped afterward.
- Direct computer use compared active heading behavior with Obsidian and inspected the packaged Bedrock build. The final fixture covers heading levels, nested emphasis/quotes/lists, code, tasks, tables, footnotes, math, and safe HTML. Screenshots below record the inspected states.

Performance is a local regression signal, not a scale guarantee. The one-megabyte test types 15 characters through Playwright with Electron tracing enabled, then verifies the exact saved bytes. The final measured median was **30 ms**, with a **99 ms** maximum. Its JSON includes every duration; protocol and tracing overhead are included. Table extraction and reference caching were also checked separately: 2,000-row extraction fell from approximately 118 ms to 1.62 ms, and cached context refresh from approximately 12 ms to 0.017 ms in the review probes.

## Visual record

[Active headings, light](screenshots/headings-light.png) · [Active headings, dark](screenshots/headings-dark.png) · [Code and tasks](screenshots/code-dark.png) · [Table editing, dark](screenshots/table-dark.png) · [Table editing, light](screenshots/table-light.png) · [Table commands](screenshots/table-commands.png) · [Math, HTML, and rules](screenshots/math-html-light.png)

The table screenshots include a deliberate edit to a disposable fixture. The note remains a grid with focus inside its next cell. Heading screenshots show editable source markers at the same size as the heading.

[Verification results](evidence/verification.json) · [Typing measurements](evidence/large-note-timings.json) · [Runtime dependency audit](evidence/audit-runtime.json) · [Full dependency audit](evidence/audit-all.json)

## Release boundaries

`pnpm audit --prod` reports **zero runtime dependency advisories**. The full audit still reports three high-severity advisories with no published patched version in the resolved build-tool chains:

- `maker-dmg → appdmg → image-size`: [ICNS infinite loop](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and [JXL/HEIF infinite loops](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq).
- `@electron/packager → extract-zip`: [symlink path traversal](https://github.com/advisories/GHSA-jmr9-qjv8-65gv).

These affect packaging inputs, not installed runtime dependencies. Release builds still need trusted packaging inputs and an upstream fix or reviewed mitigation. The audit snapshots are retained beside this report.

The local build was not signed or notarized because credentials were unavailable. Windows, Linux, Intel macOS, assistive-technology workflows, and sustained production workloads were not certified by this run. There was no release, deployment, or telemetry upload.

This remains a manual-save editor; this pass does not add crash recovery or a background draft store. Revision checks protect the tested external-change workflow but are not a cross-application filesystem lock. Input limits are 10 MB for notes/local images and 25 MB for exported HTML; frontmatter recognition is bounded to 128 KB.

The scope is common Markdown plus the note extensions above. It is not a complete implementation of Obsidian's product-specific syntax or plugins: wikilinks, transclusion, callouts, Mermaid, and plugin ecosystems remain separate work. Indented multi-paragraph footnote definitions are grouped in the editor; advanced nested block rendering inside definitions has not been certified for complete Obsidian parity. Passing this bounded suite does not establish reliability for a million users.

## References

- [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/) and [GitHub Flavored Markdown](https://github.github.com/gfm/).
- [Obsidian basic syntax](https://obsidian.md/help/syntax) and [advanced syntax](https://obsidian.md/help/advanced-syntax).
- Installed CodeMirror, Lezer, MarkdownIt, and Electron source/types for this checkout's APIs.
- [Electron releases](https://releases.electronjs.org/) and [Electron 43](https://www.electronjs.org/blog/electron-43-0).


## Playground follow-up — 8 September 2026

Fixed the issues reported during manual testing of `Markdown playground.md`:

- Arrow keys enter rendered tables from above and below, move between cells, and leave at table boundaries. Wrapped cell content retains ordinary vertical movement. Quoted tables and header-only tables use the same navigation path.
- Missing cells in short GFM rows remain virtual until edited. Their row and column identity is shared with table commands, so navigation does not reformat the document.
- Replaced table widget margins with padding. CodeMirror measures the widget box without external margins; those margins displaced its cursor hit testing below tables. The JavaScript fence was the first affected block in the playground. Browser rectangle hit tests now round-trip exactly on all nine code/fence lines checked in the full note.
- Reference definitions now retain blank separators and continuation indentation. A multiline footnote no longer absorbs the image definition that follows it. The playground's existing local PNG renders without changing the note or attachment.
- Cmd/Ctrl+K retains the command registry, with category groups, a simpler search field, aligned shortcuts, and keyboard hints.

Validation: lint and typecheck passed, all 79 unit checks passed, and all 34 Electron workflows passed (35.2 seconds in the final run). Five new workflows cover table entry/exit, wrapped and quoted cells, short rows, mouse/vertical code navigation, and local reference images after multiline footnotes. Independent review findings were fixed and reviewed again.

Visual evidence from the rebuilt app: [palette](evidence/navigation-palette.png), [local image](evidence/navigation-image.png), [JavaScript fence](evidence/navigation-code.png). Checks used a disposable copy of the playground and isolated application profiles.


## Workspace files follow-up — 8 September 2026

Added quick-open on Cmd/Ctrl+P and Home, searching filenames, folder paths, and note
contents directly from the selected root. Searches are debounced, cancellable, and
bounded; the dialog reports when results are limited. Opening a result uses the
existing dirty-document confirmation and document-session lifecycle.

Paste, drop, and Attach images commands create uniquely named files in the root's
`Attachments/` directory and insert relative Markdown links. Import works in table
cells as well as the main editor. Canonical note paths keep links consistent when a
note is opened through a symlink. Files stay usable after moving the whole root.
Imports validate file signatures, sizes, the active document, and folder containment.

Validation: lint and typecheck passed, 82 unit checks passed, and 39 Electron workflows
passed (38.7 seconds). The five new workflows cover paste/drop, undo/redo, save/reopen,
table-cell imports, quick-open and dirty-state prompts, unauthorized paths and IPC,
and notes opened through aliases. An independent review identified the canonical-path
mismatch; it was fixed and covered by unit and Electron tests.

Inspected screenshots from a disposable Electron profile:
[quick-open](evidence/workspace-quick-open.png) and
[pasted image](evidence/workspace-image-paste.png). Native computer use was unavailable
for this follow-up because the Mac was locked; the Electron driver provided the
rendered visual checks. The user's existing development process was left running.
