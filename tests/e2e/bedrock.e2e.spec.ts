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

const launchBedrock = async (): Promise<{
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
      BEDROCK_USER_DATA_DIR: userDataDir,
      NODE_ENV: "test",
      SENTRY_DSN: "",
    },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await page.locator(".cm-editor").waitFor();

  return { app, page, userDataDir };
};

const closeBedrock = async (app: ElectronApplication) => {
  const process = app.process();
  await Promise.race([
    app.close().catch((): undefined => undefined),
    new Promise<void>((resolve) => {
      setTimeout(() => {
        if (!process.killed) {
          process.kill("SIGKILL");
        }
        void app.waitForEvent("close").catch((): undefined => undefined).finally(resolve);
      }, 2000);
    }),
  ]);
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

const updateStoredSettings = async (
  page: Page,
  update: Record<string, unknown>
) => {
  await page.evaluate((next) => {
    const raw = localStorage.getItem("bedrock:settings");
    const current = raw ? JSON.parse(raw) : {};
    localStorage.setItem(
      "bedrock:settings",
      JSON.stringify({
        ...current,
        ...next,
      })
    );
  }, update);
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
      await closeBedrock(app);
      await fs.rm(outputDir, { recursive: true, force: true });
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("renders Markdown tables in hybrid mode and keeps raw Markdown available in raw mode", async () => {
    const { app, page, userDataDir } = await launchBedrock();
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "bedrock-e2e-table-output-"));
    const inputPath = path.join(outputDir, "table-source.md");

    try {
      await fs.writeFile(
        inputPath,
        [
          "| Column 1 | Column 2 | Column 3 |",
          "| --- | --- | --- |",
          "| **Alice** | *Engineer* | [Paris](https://example.com) |",
          "| Bob | `Designer` | Berlin |",
          "",
          "This is some text coming after",
        ].join("\n"),
        "utf8"
      );

      await page.locator(".cm-editor").click({
        button: "right",
        position: { x: 80, y: 60 },
      });
      const insertMenu = page.getByRole("menuitem", { name: "Insert" });
      await expect(insertMenu).toBeVisible();
      await page.keyboard.press("Escape");

      await configureTestHarness(page, { nextOpenPath: inputPath, discardResponse: true });
      await page.getByLabel("Open…").click();

      const headerCell = page.locator(
        '[data-bedrock-table-cell="true"][data-table-section="header"][data-table-row="0"][data-table-column="0"]'
      );
      const firstBodyCell = page.locator(
        '[data-bedrock-table-cell="true"][data-table-section="body"][data-table-row="0"][data-table-column="0"]'
      );
      const secondRowFirstCell = page.locator(
        '[data-bedrock-table-cell="true"][data-table-section="body"][data-table-row="1"][data-table-column="0"]'
      );
      const secondRowThirdCell = page.locator(
        '[data-bedrock-table-cell="true"][data-table-section="body"][data-table-row="1"][data-table-column="2"]'
      );

      await expect(headerCell).toBeVisible();
      await expect(firstBodyCell.locator("strong")).toContainText("Alice");
      await expect(
        page.locator(
          '[data-bedrock-table-cell="true"][data-table-section="body"][data-table-row="0"][data-table-column="1"] em'
        )
      ).toContainText("Engineer");
      await expect(
        page.locator(
          '[data-bedrock-table-cell="true"][data-table-section="body"][data-table-row="1"][data-table-column="1"] code'
        )
      ).toContainText("Designer");
      await expect(
        page.locator(
          '[data-bedrock-table-cell="true"][data-table-section="body"][data-table-row="0"][data-table-column="2"] a'
        )
      ).toContainText("Paris");
      await expect(page.getByText("This is some text coming after")).toBeVisible();

      await firstBodyCell.click();
      const firstBodyEditor = page.locator(
        '[data-bedrock-table-editor="true"][data-table-section="body"][data-table-row="0"][data-table-column="0"]'
      );
      await expect(firstBodyEditor).toHaveValue("**Alice**");
      await firstBodyEditor.fill("**Alice Updated**");
      await firstBodyEditor.press("Tab");
      await expect
        .poll(() =>
          page.evaluate(() => {
            const active = document.activeElement as HTMLInputElement | null;
            return active?.dataset.tableColumn ?? null;
          })
        )
        .toBe("1");

      const secondRowFirstEditor = page.locator(
        '[data-bedrock-table-editor="true"][data-table-section="body"][data-table-row="1"][data-table-column="0"]'
      );
      await secondRowFirstCell.click();
      await secondRowFirstEditor.press(`${shortcutModifier}+A`);
      await secondRowFirstEditor.press(`${shortcutModifier}+I`);
      await page.getByText("This is some text coming after").click();
      await expect(secondRowFirstCell.locator("em")).toContainText("Bob");

      await secondRowThirdCell.click();
      const secondRowThirdEditor = page.locator(
        '[data-bedrock-table-editor="true"][data-table-section="body"][data-table-row="1"][data-table-column="2"]'
      );
      await secondRowThirdEditor.press(`${shortcutModifier}+A`);
      await secondRowThirdEditor.press(`${shortcutModifier}+B`);
      await page.getByText("This is some text coming after").click();
      await expect(secondRowThirdCell.locator("strong")).toContainText("Berlin");

      await firstBodyCell.click({ button: "right" });
      const firstTableMenu = page.getByRole("menuitem", { name: "Table" });
      await expect(firstTableMenu).toBeVisible();
      await firstTableMenu.press("ArrowRight");
      await page.getByRole("menuitem", { name: "Add row below" }).click();
      await expect(page.locator('tbody tr')).toHaveCount(3);

      await firstBodyCell.click({ button: "right" });
      const secondTableMenu = page.getByRole("menuitem", { name: "Table" });
      await expect(secondTableMenu).toBeVisible();
      await secondTableMenu.press("ArrowRight");
      await page.getByRole("menuitem", { name: "Add column right" }).click();
      await expect(
        page.locator(
          'thead [data-bedrock-table-cell="true"][data-table-section="header"]'
        )
      ).toHaveCount(4);

      const insertedColumnCell = page.locator(
        '[data-bedrock-table-cell="true"][data-table-section="body"][data-table-row="0"][data-table-column="2"]'
      );
      await insertedColumnCell.click({ button: "right" });
      const thirdTableMenu = page.getByRole("menuitem", { name: "Table" });
      await expect(thirdTableMenu).toBeVisible();
      await thirdTableMenu.press("ArrowRight");
      await page.getByRole("menuitem", { name: "Remove column" }).click();
      await expect(
        page.locator(
          'thead [data-bedrock-table-cell="true"][data-table-section="header"]'
        )
      ).toHaveCount(3);

      await page.getByText("This is some text coming after").click();
      await page.keyboard.type(" updated");
      await expect.poll(() => getEditorText(page)).toContain("updated");

      await page.getByRole("button", { name: /^Save$/ }).click();
      await expect.poll(() => fs.readFile(inputPath, "utf8")).toContain("**Alice Updated**");
      await expect.poll(() => fs.readFile(inputPath, "utf8")).toContain("*Bob*");
      await expect.poll(() => fs.readFile(inputPath, "utf8")).toContain("**Berlin**");
      await expect.poll(() => fs.readFile(inputPath, "utf8")).toContain("updated");

      await updateStoredSettings(page, { renderMode: "raw" });
      await page.reload();
      await page.locator(".cm-editor").waitFor();

      await expect.poll(() => getEditorText(page)).toContain("**Alice Updated**");
      await expect.poll(() => getEditorText(page)).toContain("**Berlin**");
      await expect(page.locator('[data-bedrock-table-cell="true"]')).toHaveCount(0);
    } finally {
      await closeBedrock(app);
      await fs.rm(outputDir, { recursive: true, force: true });
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("falls back to raw Markdown when a contiguous table block becomes malformed", async () => {
    const { app, page, userDataDir } = await launchBedrock();
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "bedrock-e2e-invalid-table-"));
    const inputPath = path.join(outputDir, "invalid-table.md");

    try {
      await fs.writeFile(
        inputPath,
        [
          "| Top 10 rizzlers | gyatt | Column 3 |",
          "| --- | --- | --- |",
          "| rizz ohio | | |",
          "| | # swag | asd |Hello",
          "This is some text coming after",
        ].join("\n"),
        "utf8"
      );

      await configureTestHarness(page, { nextOpenPath: inputPath, discardResponse: true });
      await page.getByLabel("Open…").click();

      await expect(page.locator('[data-bedrock-table-cell="true"]')).toHaveCount(0);
      await expect.poll(() => getEditorText(page)).toContain("| | # swag | asd |Hello");
      await expect.poll(() => getEditorText(page)).toContain(
        "This is some text coming after"
      );
    } finally {
      await closeBedrock(app);
      await fs.rm(outputDir, { recursive: true, force: true });
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  });
});
