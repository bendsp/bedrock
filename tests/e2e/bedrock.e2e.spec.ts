import { test, expect, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..", "..");
const fixturePath = path.join(__dirname, "fixtures", "open-source.md");
const shortcutModifier = process.platform === "darwin" ? "Meta" : "Control";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const electronBinaryPath = require("electron") as string;
const needsNoSandbox = Boolean(process.env.CI) && process.platform === "linux";

const walk = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walk(fullPath);
      }
      return [fullPath];
    })
  );

  return files.flat();
};

const findCompiledMainEntry = async (): Promise<string> => {
  const webpackDir = path.join(repoRoot, ".webpack");
  const files = await walk(webpackDir);
  const matches = [];

  for (const file of files) {
    if (!file.endsWith(path.join("main", "index.js"))) {
      continue;
    }

    const stat = await fs.stat(file);
    matches.push({ file, modifiedAt: stat.mtimeMs });
  }

  if (matches.length === 0) {
    throw new Error("Unable to find a compiled Forge main entry under .webpack/.");
  }

  matches.sort((left, right) => right.modifiedAt - left.modifiedAt);
  return matches[0].file;
};

const launchBedrock = async (
  options: {
    initialExternalOpenPaths?: string[];
  } = {}
): Promise<{
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
}> => {
  const mainEntry = await findCompiledMainEntry();
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "bedrock-e2e-user-data-"));
  const app = await electron.launch({
    executablePath: electronBinaryPath,
    args: [...(needsNoSandbox ? ["--no-sandbox"] : []), mainEntry],
    env: {
      ...process.env,
      BEDROCK_E2E: "1",
      BEDROCK_E2E_INITIAL_EXTERNAL_OPEN_PATHS: JSON.stringify(
        options.initialExternalOpenPaths ?? []
      ),
      BEDROCK_USER_DATA_DIR: userDataDir,
      NODE_ENV: "test",
      SENTRY_DSN: "",
    },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await page.locator(".cm-editor").waitFor();
  await page.evaluate(async () => {
    await window.electronAPI.test?.reset();
  });

  return { app, page, userDataDir };
};

const getEditorText = async (page: Page): Promise<string> => {
  return page.locator(".cm-content").innerText();
};

const configureTestHarness = async (
  page: Page,
  config: {
    nextOpenPath?: string | null;
    nextSavePath?: string | null;
    discardResponse?: boolean | null;
  }
) => {
  await page.evaluate(async (value) => {
    await window.electronAPI.test?.configure(value);
  }, config);
};

const getTestState = async (page: Page) => {
  return page.evaluate(async () => {
    return window.electronAPI.test?.getState() ?? null;
  });
};

const setUpdaterState = async (
  page: Page,
  value: Record<string, unknown>
) => {
  return page.evaluate(async (snapshot) => {
    return window.electronAPI.test?.setUpdaterState(snapshot) ?? null;
  }, value);
};

const emitUpdaterEvent = async (
  page: Page,
  value:
    | { type: "update-available" }
    | { type: "update-not-available" }
    | { type: "error"; message: string }
    | { type: "update-downloaded"; version: string; releaseNotes?: string | null }
) => {
  return page.evaluate(async (event) => {
    return window.electronAPI.test?.emitUpdaterEvent(event) ?? null;
  }, value);
};

const simulateExternalOpen = async (page: Page, filePath: string) => {
  return page.evaluate(async (value) => {
    return window.electronAPI.test?.simulateExternalOpen(value) ?? false;
  }, filePath);
};

test.describe("Bedrock Electron pipeline", () => {
  test("launches, edits, searches, saves, opens fixtures, and handles dirty close prompts", async () => {
    const { app, page, userDataDir } = await launchBedrock();
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "bedrock-e2e-output-"));
    const savePath = path.join(outputDir, "saved-from-e2e.md");

    try {
      await page.locator(".cm-content").click();
      await page.keyboard.type("Bedrock agent pipeline smoke test");
      await expect(page.locator("header")).toContainText("*Untitled.md");

      await page.keyboard.press(`${shortcutModifier}+F`);
      await expect(page.getByPlaceholder("Find...")).toBeVisible();
      await page.getByPlaceholder("Find...").fill("pipeline");
      await page.keyboard.press("Enter");
      await page.getByTitle("Close (Esc)").click();
      await expect(page.getByPlaceholder("Find...")).toHaveCount(0);

      await page.getByLabel("Settings").click();
      await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
      await page.getByRole("button", { name: /Close/i }).click();
      await expect(page.getByRole("heading", { name: "Settings" })).toHaveCount(0);

      await configureTestHarness(page, { nextSavePath: savePath });
      await page.getByRole("button", { name: /^Save$/ }).click();
      await expect.poll(() => fs.readFile(savePath, "utf8")).toContain(
        "Bedrock agent pipeline smoke test"
      );

      await configureTestHarness(page, {
        nextOpenPath: fixturePath,
        discardResponse: true,
      });
      await page.getByLabel("Open…").click();
      await expect(page.locator("header")).toContainText("open-source.md");
      await expect.poll(() => getEditorText(page)).toContain("Opened From Fixture");

      await page.locator(".cm-content").click();
      await page.keyboard.type("\nUnsaved change");
      await configureTestHarness(page, { discardResponse: false });
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.close();
      });

      const cancelledState = await getTestState(page);
      expect(cancelledState?.lastDiscardPrompt?.action).toBe("close");
      await expect(page.locator(".cm-editor")).toBeVisible();

      await configureTestHarness(page, { discardResponse: true });
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.close();
      });
      await expect
        .poll(async () => {
          return app.evaluate(({ BrowserWindow }) => {
            return BrowserWindow.getAllWindows().length;
          });
        })
        .toBe(0);
    } finally {
      await app.close().catch((): undefined => undefined);
      await fs.rm(outputDir, { recursive: true, force: true });
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("queues startup external opens and reuses discard confirmation for running-app opens", async () => {
    const { app, page, userDataDir } = await launchBedrock({
      initialExternalOpenPaths: [fixturePath],
    });

    try {
      await expect(page.locator("header")).toContainText("open-source.md");
      await expect.poll(() => getEditorText(page)).toContain("Opened From Fixture");

      await page.locator(".cm-content").click();
      await page.keyboard.type("\nUnsaved change");

      await configureTestHarness(page, { discardResponse: false });
      await expect(await simulateExternalOpen(page, fixturePath)).toBe(true);

      const cancelledState = await getTestState(page);
      expect(cancelledState?.lastDiscardPrompt?.action).toBe("open");
      await expect(page.locator("header")).toContainText("*open-source.md");
      await expect.poll(() => getEditorText(page)).toContain("Unsaved change");

      await configureTestHarness(page, { discardResponse: true });
      await expect(await simulateExternalOpen(page, fixturePath)).toBe(true);

      await expect(page.locator("header")).toContainText("open-source.md");
      await expect.poll(() => getEditorText(page)).not.toContain("Unsaved change");
    } finally {
      await app.close().catch((): undefined => undefined);
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("surfaces manual update checks, ready banner, and install requests", async () => {
    const { app, page, userDataDir } = await launchBedrock();

    try {
      await page.getByLabel("Settings").click();
      const settingsDialog = page.getByRole("dialog");
      await settingsDialog.getByRole("button", { name: "Updates" }).click();

      await settingsDialog.getByRole("button", { name: "Check for Updates…" }).click();
      await emitUpdaterEvent(page, { type: "update-not-available" });
      await expect(settingsDialog.getByText("You’re up to date.")).toBeVisible();

      await setUpdaterState(page, {
        status: "downloading",
        source: "manual",
      });
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send("app:check-for-updates");
      });
      await expect(
        settingsDialog.getByText(
          "Bedrock is already checking for or downloading an update."
        )
      ).toBeVisible();

      await setUpdaterState(page, {
        status: "checking",
        source: "startup",
      });
      await emitUpdaterEvent(page, {
        type: "update-downloaded",
        version: "1.3.4",
        releaseNotes: "Bug fixes and improvements.",
      });

      await expect(page.getByText("Update ready to install")).toBeVisible();
      await expect(
        page.getByText("Bedrock 1.3.4 has been downloaded and is ready to install.")
      ).toBeVisible();

      await settingsDialog.getByRole("button", { name: "Restart to Update" }).click();
      await expect
        .poll(async () => (await getTestState(page))?.updaterInstallRequested)
        .toBe(true);
    } finally {
      await app.close().catch((): undefined => undefined);
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  });
});
