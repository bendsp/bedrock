import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { configureTestHarness, disposeBedrock, launchBedrock, shortcutModifier as mod } from "./support";

test("UTF-8 .bin files use plain text editing and protect the disk copy", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  const textFile = path.join(userDataDir, "settings.bin");
  const binaryFile = path.join(userDataDir, "firmware.bin");
  try {
    await fs.writeFile(textFile, "alpha\r\nbeta\r\n");
    await fs.writeFile(binaryFile, Buffer.from([0x42, 0x49, 0x4e, 0, 0xff]));

    await configureTestHarness(page, { nextOpenPath: binaryFile });
    await page.getByRole("button", { name: "Open…" }).click();
    await expect(page.getByRole("alert")).toContainText("valid UTF-8 text");
    await expect(page.locator("header")).toContainText("Untitled.md");
    expect(await fs.readFile(binaryFile)).toEqual(Buffer.from([0x42, 0x49, 0x4e, 0, 0xff]));

    await configureTestHarness(page, { nextOpenPath: textFile });
    await page.getByRole("button", { name: "Open…" }).click();
    await expect(page.locator("header")).toContainText("settings.bin");
    await expect(page.locator("footer")).toContainText("Plain text");
    await expect(page.getByRole("button", { name: "Export" })).toHaveCount(0);
    await page.keyboard.press(`${mod}+k`);
    await page.getByRole("combobox", { name: "Search commands" }).fill("Bold");
    await expect(page.getByRole("option", { name: "Bold" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("added");
    await expect(page.locator(".cm-content")).toContainText("added");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => fs.readFile(textFile, "utf8")).toBe("alpha\r\nbeta\r\nadded");

    await fs.writeFile(textFile, "external change");
    await page.locator(".cm-content").click();
    await page.keyboard.type(" again");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("changed outside Bedrock");
    expect(await fs.readFile(textFile, "utf8")).toBe("external change");
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("Save As preserves dotfile names and detects external edits through aliases", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const text = path.join(userDataDir, "config.txt");
    const dotfile = path.join(userDataDir, ".env");
    await fs.writeFile(text, "original");
    await configureTestHarness(page, { nextOpenPath: text });
    await page.getByRole("button", { name: "Open…" }).click();
    await page.locator(".cm-content").fill("saved");
    await configureTestHarness(page, { nextSavePath: dotfile });
    await page.getByRole("button", { name: "Save As…" }).click();
    await expect.poll(() => fs.readFile(dotfile, "utf8").catch(() => "missing")).toBe("saved");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await expect(page.locator("header")).toContainText(".env");
    await expect(page.locator("footer")).toContainText("Plain text");
    const alias = path.join(userDataDir, "alias.txt");
    await fs.symlink(dotfile, alias);
    await fs.writeFile(dotfile, "external change");
    await page.locator(".cm-content").fill("my edits");
    await configureTestHarness(page, { nextSavePath: alias });
    await page.getByRole("button", { name: "Save As…" }).click();
    await expect(page.getByRole("alert")).toContainText("changed outside Bedrock");
    expect(await fs.readFile(dotfile, "utf8")).toBe("external change");
  } finally { await disposeBedrock(app, userDataDir); }
});
