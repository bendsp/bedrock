---
name: run-bedrock
description: Build, run, and drive Bedrock (the Electron markdown editor). Use when asked to start Bedrock, run the app, take a screenshot of its UI, verify a change in the running editor, or run its tests.
---

Bedrock is a single-window Electron + React markdown editor (CodeMirror 6).
Drive it programmatically with the REPL driver at
`.claude/skills/run-bedrock/driver.mjs`, run inside tmux. The driver launches
the app via Playwright `_electron` in the app's built-in test mode
(`BEDROCK_E2E=1`), which replaces native file dialogs with scriptable hooks.

All paths below are relative to the repo root.

## Setup

```bash
pnpm install
```

(Compiles one native module, `macos-alias`, on the way — warnings are normal.)

## Build

The driver launches `.webpack/<current architecture>/main/index.js` from the last package build.
Build it with:

```bash
pnpm run build:e2e   # electron-forge package; ~1-2 min
```

Rebuild after any `src/` change — the driver runs the compiled bundle, not the
source.

## Run (agent path)

The app now starts on Home. On a fresh disposable profile, run
`click button:has-text("Use suggested folder")` to set up an isolated root,
then `click [aria-label="New"]` before typing. The test-mode suggested folder
is under the disposable user-data directory, not the user's Documents folder.

The driver executes commands strictly in order (each waits for the previous),
so you can send them back-to-back. One-shot flows can be piped on stdin:

```bash
printf 'launch\nclick .cm-content\ntype Hello from the driver\nss hello\nquit\n' \
  | node .claude/skills/run-bedrock/driver.mjs
```

For interactive sessions, run it in tmux:

```bash
tmux new-session -d -s bedrock -x 200 -y 50 'node .claude/skills/run-bedrock/driver.mjs'
timeout 30 bash -c 'until tmux capture-pane -t bedrock -p | grep -q "bedrock-driver ready"; do sleep 0.2; done'
tmux send-keys -t bedrock 'launch' Enter
tmux send-keys -t bedrock 'click .cm-content' Enter
tmux send-keys -t bedrock 'type Hello from the driver' Enter
tmux send-keys -t bedrock 'ss hello' Enter
timeout 60 bash -c 'until tmux capture-pane -t bedrock -p | grep -q "bedrock-shots/hello.png"; do sleep 0.5; done'
tmux capture-pane -t bedrock -p | grep -v '^$' | tail -8
```

Screenshots land in `/tmp/bedrock-shots/<name>.png` — read the file to verify
what's on screen. When done: `tmux send-keys -t bedrock 'quit' Enter`, then
`tmux kill-session -t bedrock`.

Driver commands (one per line; each prints `OK <result>` or `ERR <message>`):

| command | what it does |
|---|---|
| `launch [file.md ...]` | start the app; optional paths simulate files opened via the OS |
| `ss [name]` | screenshot → `/tmp/bedrock-shots/<name>.png` |
| `click <selector>` | click a Playwright selector (e.g. `.cm-content`, `[aria-label="Open…"]`) |
| `type <text>` / `press <keys>` | keyboard input (`press Meta+S`, `press Enter`) |
| `fill <selector> :: <text>` | fill an input |
| `text [selector]` | innerText (default `.cm-content` = editor body; also `header`, `footer`) |
| `eval <js>` | run JS in the renderer |
| `evalmain <js>` | run JS in the main process (`electron` module in scope) |
| `setopen <path>` | next Open resolves to this file instead of a native dialog |
| `setsave <path>` | next Save writes here instead of a native dialog |
| `setdiscard <true\|false>` | answer for the next unsaved-changes prompt |
| `state` | dump test-harness state (pending paths, last discard prompt) |
| `quit` | close app and exit |

A verified save/open flow:

```bash
tmux send-keys -t bedrock 'setsave /tmp/out.md' Enter
tmux send-keys -t bedrock 'press Meta+S' Enter            # writes /tmp/out.md
tmux send-keys -t bedrock 'setopen tests/e2e/fixtures/open-source.md' Enter
tmux send-keys -t bedrock 'setdiscard true' Enter
tmux send-keys -t bedrock 'click [aria-label="Open…"]' Enter
tmux send-keys -t bedrock 'text header' Enter             # → open-source.md
```

## Run (human path)

```bash
pnpm dev   # electron-forge start → a window opens. Ctrl-C to stop.
```

## Test

```bash
pnpm run test:unit   # ts-node suite, ~10s, all green
pnpm run test:e2e    # rebuilds the package, then Playwright e2e (tests/e2e/)
```

## Gotchas

- **Always `setopen`/`setsave` before clicking Open/Save.** Even in E2E mode,
  if no path is queued the main process falls through to a real macOS dialog
  (`src/main/index.ts`, `file:open` handler) that the driver cannot dismiss.
- **The driver runs the compiled `.webpack/` bundle, not `src/`.** Source
  edits are invisible until you re-run `pnpm run build:e2e`. The driver uses the current architecture's package entry, so a dev-server build does not replace it.
- **Import `_electron` from `@playwright/test`, not `playwright`** — pnpm's
  strict node_modules only exposes declared dependencies, and only
  `@playwright/test` is declared.
- **On macOS a real window opens and takes focus.** No xvfb equivalent needed;
  just expect the window to appear during driver runs.
- **`launch` uses a throwaway user-data dir** (`BEDROCK_USER_DATA_DIR` in a
  tmpdir), so settings/themes reset every run and your real Bedrock profile is
  untouched.
