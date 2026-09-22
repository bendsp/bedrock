#!/usr/bin/env node
// Bedrock agent driver — a line-based REPL around Playwright's _electron.
//
// Usage:  node .claude/skills/run-bedrock/driver.mjs
// Run it inside tmux and talk to it with send-keys / capture-pane, or pipe
// commands on stdin. Requires `pnpm run build:e2e` (or any electron-forge
// build that populates .webpack/) to have run first.
//
// Commands (one per line):
//   launch [file.md ...]   start the app; optional paths simulate "opened via OS"
//   ss [name]              screenshot -> /tmp/bedrock-shots/<name|shot-N>.png
//   click <selector>       click a Playwright selector
//   type <text>            type into the focused element
//   press <keys>           keyboard press, e.g. Meta+F, Enter
//   fill <selector> :: <text>
//   text [selector]        innerText of selector (default .cm-content = editor)
//   eval <js>              run JS in the renderer (page.evaluate)
//   evalmain <js>          run JS in the main process; `electron` is in scope
//   setopen <path>         next Open… dialog resolves to this file (test hook)
//   setsave <path>         next Save dialog resolves to this file (test hook)
//   setdiscard <true|false> answer for the next discard-changes prompt
//   state                  dump the test-harness state (last prompts, etc.)
//   quit                   close app and exit

import { _electron as electron } from "@playwright/test";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const electronBinaryPath = require("electron");
const shotDir = "/tmp/bedrock-shots";

let app = null;
let page = null;
let userDataDir = null;
let shotCount = 0;

const findCompiledMainEntry = async () => {
  const entry = path.join(repoRoot, ".webpack", process.arch, "main", "index.js");
  await fs.access(entry);
  return entry;
};

const launch = async (externalOpenPaths) => {
  if (app) throw new Error("already launched");
  const mainEntry = await findCompiledMainEntry();
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "bedrock-driver-user-data-"));
  app = await electron.launch({
    executablePath: electronBinaryPath,
    args: [mainEntry],
    env: {
      ...process.env,
      BEDROCK_E2E: "1",
      BEDROCK_E2E_INITIAL_EXTERNAL_OPEN_PATHS: JSON.stringify(externalOpenPaths),
      BEDROCK_USER_DATA_DIR: userDataDir,
      NODE_ENV: "test",
      SENTRY_DSN: "",
    },
  });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await page.locator('.cm-editor, [aria-label="Root folder setup"], [aria-label="Recently opened files"]').first().waitFor();
  return "launched";
};

const configure = (config) =>
  page.evaluate((value) => window.electronAPI.test?.configure(value), config);

const handlers = {
  launch: (arg) => launch(arg ? arg.split(/\s+/).map((p) => path.resolve(p)) : []),
  ss: async (arg) => {
    await fs.mkdir(shotDir, { recursive: true });
    const file = path.join(shotDir, `${arg || `shot-${++shotCount}`}.png`);
    await page.screenshot({ path: file });
    return file;
  },
  click: (arg) => page.locator(arg).first().click().then(() => "clicked"),
  type: (arg) => page.keyboard.type(arg).then(() => "typed"),
  press: (arg) => page.keyboard.press(arg).then(() => "pressed"),
  fill: async (arg) => {
    const [selector, text] = arg.split(" :: ");
    await page.locator(selector).first().fill(text ?? "");
    return "filled";
  },
  text: (arg) => page.locator(arg || ".cm-content").first().innerText(),
  eval: (arg) => page.evaluate(arg).then((r) => JSON.stringify(r)),
  evalmain: (arg) =>
    // `electron` (the module: BrowserWindow, app, …) is the first param in scope
    app.evaluate((electron, code) => eval(code), arg).then((r) => JSON.stringify(r)),
  setopen: (arg) => configure({ nextOpenPath: path.resolve(arg) }).then(() => "ok"),
  setsave: (arg) => configure({ nextSavePath: path.resolve(arg) }).then(() => "ok"),
  setdiscard: (arg) => configure({ discardResponse: arg === "true" }).then(() => "ok"),
  state: () =>
    page
      .evaluate(() => window.electronAPI.test?.getState() ?? null)
      .then((r) => JSON.stringify(r, null, 2)),
  quit: async () => {
    if (app) {
      const child = app.process();
      const exited = new Promise(resolve => child.exitCode !== null || child.signalCode !== null ? resolve() : child.once("exit", resolve));
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await exited;
    }
    if (userDataDir) await fs.rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    process.exit(0);
  },
};

const rl = readline.createInterface({ input: process.stdin });
console.log("bedrock-driver ready. Commands: " + Object.keys(handlers).join(", "));
// Commands run strictly in order — each waits for the previous to finish, so
// back-to-back tmux send-keys (even right after `launch`) are safe.
let queue = Promise.resolve();
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  queue = queue.then(async () => {
    const space = trimmed.indexOf(" ");
    const cmd = space === -1 ? trimmed : trimmed.slice(0, space);
    const arg = space === -1 ? "" : trimmed.slice(space + 1);
    const handler = handlers[cmd];
    if (!handler) {
      console.log(`ERR unknown command: ${cmd}`);
      return;
    }
    if (!app && cmd !== "launch" && cmd !== "quit") {
      console.log("ERR not launched — run `launch` first");
      return;
    }
    try {
      console.log(`OK ${await handler(arg)}`);
    } catch (err) {
      console.log(`ERR ${err.message?.split("\n")[0]}`);
    }
  });
});
rl.on("close", () => queue.then(() => handlers.quit()));
