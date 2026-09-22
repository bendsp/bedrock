import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  disposeBedrock,
  fixturePath,
  shortcutModifier,
  launchBedrock,
  getEditorText,
  configureTestHarness,
  getTestState,
  simulateExternalOpen,
} from "./support";

test.describe("Bedrock Electron pipeline", () => {
  test("slow Home navigation locks edits and queues external opens", async () => {
    const { app, page, userDataDir } = await launchBedrock();
    try {
      await page.locator(".cm-content").fill("Keep this note");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Home", exact: true }),
      ).toBeEnabled();
      await configureTestHarness(page, { workspaceDelayMs: 800 });
      await page.getByRole("button", { name: "Home", exact: true }).click();
      await expect(page.locator(".cm-content")).toHaveAttribute(
        "contenteditable",
        "false",
      );
      await page.keyboard.type("Must not enter the document");
      await page.keyboard.press(`${shortcutModifier}+b`);
      await expect(page.locator(".cm-content")).toHaveText("Keep this note");
      await simulateExternalOpen(page, fixturePath);
      await expect(page.locator("header")).toContainText("open-source.md");
      await expect(page.locator(".cm-content")).toHaveAttribute(
        "contenteditable",
        "true",
      );
      const info = await page.evaluate(() => window.electronAPI.getWorkspace());
      if (!info.rootPath) throw new Error("Expected root");
      expect(
        await fs.readFile(path.join(info.rootPath, "Untitled.md"), "utf8"),
      ).toBe("Keep this note");
    } finally {
      await disposeBedrock(app, userDataDir);
    }
  });

  test("root setup, Home recents, settings folder switch, and restart preserve files", async () => {
    const initial = await launchBedrock({ setup: false });
    let app = initial.app;
    let page = initial.page;
    const userDataDir = initial.userDataDir;
    const alternate = path.join(userDataDir, "alternate");
    try {
      await expect(page.getByLabel("Root folder setup")).toContainText(
        path.join("Documents", "Bedrock"),
      );
      await page.getByRole("button", { name: "Use suggested folder" }).click();
      await expect(page.getByLabel("Recently opened files")).toContainText(
        "Files you open or create will appear here.",
      );
      const root = await page.evaluate(
        async () => (await window.electronAPI.getWorkspace()).rootPath,
      );
      if (!root) throw new Error("Expected a root folder");

      await page.getByRole("button", { name: "New", exact: true }).click();
      await page.locator(".cm-content").fill("My first note");
      await page.getByRole("button", { name: "Home", exact: true }).click();
      await expect(page.locator(".cm-editor")).toBeVisible();
      expect((await getTestState(page))?.lastDiscardPrompt?.action).toBe(
        "home",
      );
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect
        .poll(() => fs.readFile(path.join(root, "Untitled.md"), "utf8"))
        .toBe("My first note");
      await page.getByRole("button", { name: "Home", exact: true }).click();
      await page.getByRole("button", { name: /^Untitled\.md/ }).click();
      await expect(page.locator(".cm-content")).toHaveText("My first note");

      await page.getByRole("button", { name: "New", exact: true }).click();
      await expect(page.locator("header")).toContainText("Untitled 2.md");
      await page.getByRole("button", { name: "Home", exact: true }).click();
      await app.close();
      ({ app, page } = await launchBedrock({ setup: false, userDataDir }));
      await expect(
        page.getByLabel("Recently opened files").getByRole("button"),
      ).toHaveCount(2);
      await expect(page.locator(".cm-editor")).toHaveCount(0);

      await configureTestHarness(page, { nextRootPath: alternate });
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("button", { name: "Files", exact: true }).click();
      await page
        .getByRole("button", { name: "Choose folder…", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText(alternate);
      await page.getByRole("button", { name: /Close/i }).click();
      await expect(page.getByLabel("Recently opened files")).toContainText(
        "Files you open or create will appear here.",
      );
      await page.getByRole("button", { name: "New", exact: true }).click();
      await page.locator(".cm-content").fill("In the new root");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect
        .poll(() => fs.readFile(path.join(alternate, "Untitled.md"), "utf8"))
        .toBe("In the new root");
      expect(await fs.readFile(path.join(root, "Untitled.md"), "utf8")).toBe(
        "My first note",
      );
      await app.close();
      ({ app, page } = await launchBedrock({ setup: false, userDataDir }));
      await expect(
        page.getByLabel("Recently opened files").getByRole("button"),
      ).toHaveCount(1);
      await page.getByRole("button", { name: /^Untitled\.md/ }).click();
      await expect(page.locator(".cm-content")).toHaveText("In the new root");
    } finally {
      await disposeBedrock(app, userDataDir);
    }
  });

  test("opening identical content protects the first edit and isolates undo history", async () => {
    const { app, page, userDataDir } = await launchBedrock();
    try {
      const first = path.join(userDataDir, "first.md");
      const second = path.join(userDataDir, "second.md");
      await fs.writeFile(first, "same content");
      await fs.writeFile(second, "same content");
      for (const file of [first, second]) {
        await configureTestHarness(page, { nextOpenPath: file });
        await page.getByLabel("Open…").click();
        await expect(page.locator("header")).toContainText(path.basename(file));
      }
      await page.locator(".cm-content").press("End");
      await page.keyboard.type("X");
      await expect(page.locator("header")).toContainText("*second.md");
      await page.keyboard.press(`${shortcutModifier}+z`);
      await expect(page.locator(".cm-content")).toHaveText("same content");
      await expect(page.locator("header")).not.toContainText("*");
      await configureTestHarness(page, { nextOpenPath: fixturePath });
      await page.getByLabel("Open…").click();
      await expect(page.locator("header")).toContainText("open-source.md");
      await page.keyboard.press(`${shortcutModifier}+z`);
      await expect(page.locator(".cm-content")).toContainText(
        "Opened From Fixture",
      );
    } finally {
      await disposeBedrock(app, userDataDir);
    }
  });

  test("launches, edits, searches, saves, opens fixtures, and handles dirty close prompts", async () => {
    const { app, page, userDataDir } = await launchBedrock();
    const outputDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "bedrock-e2e-output-"),
    );
    const savePath = path.join(outputDir, "saved-from-e2e.md");

    try {
      await page.locator(".cm-content").click();
      await page.keyboard.type("Bedrock agent pipeline smoke test");
      await expect(page.locator("header")).toContainText("*Untitled.md");
      await expect(page.locator("footer")).toContainText("5 words");

      await page.keyboard.press(`${shortcutModifier}+F`);
      await expect(page.getByPlaceholder("Find...")).toBeVisible();
      await page.getByPlaceholder("Find...").fill("pipeline");
      await page.keyboard.press("Enter");
      await page.getByTitle("Close (Esc)").click();
      await expect(page.getByPlaceholder("Find...")).toHaveCount(0);

      await page.getByLabel("Settings").click();
      await expect(
        page.getByRole("heading", { name: "Settings" }),
      ).toBeVisible();
      await page.getByRole("button", { name: /Close/i }).click();
      await expect(page.getByRole("heading", { name: "Settings" })).toHaveCount(
        0,
      );

      await configureTestHarness(page, { nextSavePath: savePath });
      await page.getByRole("button", { name: "Save As…", exact: true }).click();
      await expect
        .poll(() => fs.readFile(savePath, "utf8").catch(() => ""))
        .toContain("Bedrock agent pipeline smoke test");

      await configureTestHarness(page, {
        nextOpenPath: fixturePath,
        discardResponse: true,
      });
      await page.getByLabel("Open…").click();
      await expect(page.locator("header")).toContainText("open-source.md");
      await expect
        .poll(() => getEditorText(page))
        .toContain("Opened From Fixture");

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
      await disposeBedrock(app, userDataDir);
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });

  test("queues startup external opens and reuses discard confirmation for running-app opens", async () => {
    const { app, page, userDataDir } = await launchBedrock({
      initialExternalOpenPaths: [fixturePath],
    });

    try {
      await expect(page.locator("header")).toContainText("open-source.md");
      await expect
        .poll(() => getEditorText(page))
        .toContain("Opened From Fixture");

      await page.locator(".cm-content").click();
      await page.keyboard.type("\nUnsaved change");
      await expect(page.locator("header")).toContainText("*open-source.md");

      await configureTestHarness(page, { discardResponse: false });
      await expect(await simulateExternalOpen(page, fixturePath)).toBe(true);

      await expect
        .poll(async () => (await getTestState(page))?.lastDiscardPrompt?.action)
        .toBe("open");
      await expect(page.locator("header")).toContainText("*open-source.md");
      await expect.poll(() => getEditorText(page)).toContain("Unsaved change");

      await configureTestHarness(page, { discardResponse: true });
      await expect(await simulateExternalOpen(page, fixturePath)).toBe(true);

      await expect(page.locator("header")).toContainText("open-source.md");
      await expect
        .poll(() => getEditorText(page))
        .not.toContain("Unsaved change");
    } finally {
      await disposeBedrock(app, userDataDir);
    }
  });
});


test("installed paths containing spaces retain trusted IPC", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bedrock installed path "));
  const compiled = path.join(directory, "Bedrock Dev");
  await fs.cp(path.resolve(__dirname, "../../.webpack", process.arch), compiled, { recursive: true });
  const { app, page, userDataDir } = await launchBedrock({
    mainEntry: path.join(compiled, "main/index.js"),
  });
  try {
    await expect(page.locator(".cm-editor")).toBeVisible();
    const workspace = await page.evaluate(() => window.electronAPI.getWorkspace());
    expect(workspace.rootPath).toBeTruthy();
  } finally {
    await disposeBedrock(app, userDataDir);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
