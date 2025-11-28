<!-- ebbcae85-ca2b-48fc-a573-4465743b6ab5 3528f93e-eab8-4675-9c3d-2ee96b4a369e -->
# Inline Markdown Editing Plan

1. Replace split-pane layout with an inline editor that renders every non-active line as Markdown while keeping the active line editable raw text.
2. Implement line-scoped renderer using `markdown-it` that maps `LinesModel` snapshots to sanitized HTML fragments per line with awareness of block continuity.
3. Update the `Editor` component to track active line focus, swap between raw `<textarea>` for current line and rendered `<div>` for others, and preserve cursor interactions.
4. Create controller/view wiring to handle line focus changes, cursor jumps, and future mode toggles while keeping the model authoritative.
5. Refresh styling and add targeted tests/manual QA to validate inline rendering, cursor transitions, and sanitization behavior.

### To-dos

- [ ] Prototype inline Markdown view that combines rendered HTML with editable spans tied to LinesModel
- [ ] Add controller command and shortcut to toggle between raw and rendered modes
- [ ] Implement block-level renderer that maps LinesModel output to sanitized HTML fragments
- [ ] Update CSS to support inline rendered presentation and transitions between modes
- [ ] Cover toggle behavior with tests/docs and outline Obsidian-style QA