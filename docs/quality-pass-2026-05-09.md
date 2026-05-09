# Bedrock Quality Pass — 2026-05-09

## Repository Status

- Branch baseline: `main` at tag `1.3.4`, with no local changes and no open GitHub PRs.
- Local baseline before edits: `pnpm test` passed lint, typecheck, unit tests, and Electron E2E.
- Linear did not show active Bedrock work; GitHub issues were the relevant planning source.
- Open GitHub issues suggested Markdown editing and editor-preference work: font family options, lists, checkmarks, quotes, and code blocks.

## Implemented Feature/Fix Draft

1. Add editor font-family options in Settings (`sans`, `serif`, `mono`) for GitHub issue #84.
2. Add a compact document stats bar with line, word, character, and reading-time counts.
3. Add a bulleted-list toggle command for selected Markdown lines.
4. Add a numbered-list toggle command with automatic line numbering.
5. Add a task-list toggle command for Markdown checklists.
6. Render inactive task-list markers as hybrid checkboxes, including checked-state styling.
7. Add a blockquote toggle command for selected Markdown lines.
8. Add a fenced-code-block command that wraps and unwraps selected Markdown lines.
9. Wire the new Markdown commands into context menus and customizable keybindings.
10. Harden main-process file/export IPC with Markdown size checks, extension normalization, export extension enforcement, and guaranteed hidden PDF-window cleanup.

## Validation Plan

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test:e2e`
