import { _electron as electron, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..", "..");
export const fixturePath = path.join(__dirname, "fixtures", "open-source.md");
export const shortcutModifier =
  process.platform === "darwin" ? "Meta" : "Control";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const electronBinaryPath = require("electron") as string;
const needsNoSandbox = Boolean(process.env.CI) && process.platform === "linux";

const findCompiledMainEntry = async (): Promise<string> => {
  const entry = path.join(
    repoRoot,
    ".webpack",
    process.arch,
    "main",
    "index.js",
  );
  await fs.access(entry);
  return entry;
};

export const launchBedrock = async (
  options: {
    initialExternalOpenPaths?: string[];
    setup?: boolean;
    userDataDir?: string;
    mainEntry?: string;
  } = {},
): Promise<{
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
}> => {
  const mainEntry = options.mainEntry ?? await findCompiledMainEntry();
  const userDataDir =
    options.userDataDir ??
    (await fs.mkdtemp(path.join(os.tmpdir(), "bedrock-e2e-user-data-")));
  const app = await electron.launch({
    executablePath: electronBinaryPath,
    args: [...(needsNoSandbox ? ["--no-sandbox"] : []), mainEntry],
    env: {
      ...process.env,
      BEDROCK_E2E: "1",
      BEDROCK_E2E_INITIAL_EXTERNAL_OPEN_PATHS: JSON.stringify(
        options.initialExternalOpenPaths ?? [],
      ),
      BEDROCK_USER_DATA_DIR: userDataDir,
      NODE_ENV: "test",
      SENTRY_DSN: "",
    },
  });

  await app
    .context()
    .tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("heading", { name: "Home", exact: true }).waitFor();
  if (options.setup !== false) {
    await page.getByRole("button", { name: "Use suggested folder" }).click();
    if (!options.initialExternalOpenPaths?.length)
      await page.getByRole("button", { name: "New", exact: true }).click();
    await page.locator(".cm-editor").waitFor();
  }

  return { app, page, userDataDir };
};

export const getEditorText = async (page: Page): Promise<string> => {
  return page.locator(".cm-content").innerText();
};

export const configureTestHarness = async (
  page: Page,
  config: {
    nextOpenPath?: string | null;
    nextSavePath?: string | null;
    discardResponse?: boolean | null;
    nextRootPath?: string | null;
    workspaceDelayMs?: number;
  },
) => {
  await page.evaluate(async (value) => {
    await window.electronAPI.test?.configure(value);
  }, config);
};

export const getTestState = async (page: Page) => {
  return page.evaluate(async () => {
    return window.electronAPI.test?.getState() ?? null;
  });
};

export const simulateExternalOpen = async (page: Page, filePath: string) => {
  return page.evaluate(async (value) => {
    return window.electronAPI.test?.simulateExternalOpen(value) ?? false;
  }, filePath);
};

export async function disposeBedrock(
  app: ElectronApplication,
  userDataDir: string,
): Promise<void> {
  const tracePath = test
    .info()
    .outputPath(`electron-${path.basename(userDataDir)}.zip`);
  // Linux quits after its final window closes. There is no live trace to stop then.
  const canSaveTrace = app.context().pages().length > 0;
  if (canSaveTrace) await app.context().tracing.stop({ path: tracePath });
  if (canSaveTrace) await test
    .info()
    .attach("Electron UI trace", {
      path: tracePath,
      contentType: "application/zip",
    });
  const process = app.process();
  const exited = new Promise<void>((resolve) => {
    if (process.exitCode !== null || process.signalCode !== null) resolve();
    else process.once("exit", () => resolve());
  });
  await app
    .evaluate(({ app }) => app.exit(0))
    .catch((): undefined => undefined);
  await exited;
  await fs.rm(userDataDir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
