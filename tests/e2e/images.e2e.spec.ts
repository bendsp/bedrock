import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { configureTestHarness, disposeBedrock, launchBedrock, shortcutModifier as mod } from "./support";

test("clicking an image keeps its source hidden and opens image controls", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const root = await page.evaluate(async () => (await window.electronAPI.getWorkspace()).rootPath);
    if (!root) throw new Error("Missing root");
    await fs.copyFile(path.resolve("tests/e2e/fixtures/reference-image.png"), path.join(root, "pixel.png"));
    const note = path.join(root, "images.md");
    await fs.writeFile(note, "Before\n\n![Pixel](pixel.png)\n\nAfter");
    await configureTestHarness(page, { nextOpenPath: note });
    await page.getByRole("button", { name: "Open…", exact: true }).click();
    const image = page.getByRole("img", { name: "Pixel", exact: true });
    await expect(image).toBeVisible();
    await image.click();
    await expect(image).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Image controls" })).toBeVisible();
    await expect(page.locator(".cm-content")).not.toContainText("![Pixel](pixel.png)");
    await page.screenshot({ path: test.info().outputPath("image-controls.png") });
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

for (const mode of ["hybrid", "raw"] as const) {
  test(`images stay objects during cursor movement, selection, deletion and undo in ${mode} mode`, async () => {
    const { app, page, userDataDir } = await launchBedrock();
    try {
      await page.evaluate(mode => {
        const settings = JSON.parse(localStorage.getItem("bedrock:settings") ?? "{}");
        localStorage.setItem("bedrock:settings", JSON.stringify({ ...settings, renderMode: mode }));
      }, mode);
      await page.reload();
      const note = path.join(userDataDir, "inline.md");
      await fs.copyFile(path.resolve("tests/e2e/fixtures/reference-image.png"), path.join(userDataDir, "pixel.png"));
      const source = "Before ![Pixel](pixel.png) After";
      await fs.writeFile(note, source);
      await configureTestHarness(page, { nextOpenPath: note });
      await page.getByRole("button", { name: "Open…", exact: true }).click();
      const image = page.getByRole("img", { name: "Pixel", exact: true });
      await expect(image).toBeVisible();
      for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End", "Shift+ArrowLeft", "Shift+ArrowRight", `${mod}+a`]) {
        await image.click();
        await page.keyboard.press(key);
        await expect(image).toBeVisible();
        await expect(page.locator(".cm-content")).not.toContainText("![Pixel](pixel.png)");
      }
      for (const key of ["Backspace", "Delete"]) {
        await image.click();
        await page.keyboard.press(key === "Backspace" ? "ArrowRight" : "ArrowLeft");
        await page.keyboard.press(key);
        await expect(image).toHaveCount(0);
        await page.keyboard.press(`${mod}+s`);
        await expect.poll(() => fs.readFile(note, "utf8")).toBe("Before  After");
        await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
        await page.keyboard.press(`${mod}+z`);
        await expect(image).toBeVisible();
        await expect(page.locator(".cm-content")).not.toContainText("![Pixel]");
      }
      await image.click();
      await page.getByRole("button", { name: "Delete image", exact: true }).click();
      await expect(image).toHaveCount(0);
      await page.keyboard.press(`${mod}+z`);
      await expect(image).toBeVisible();
      await page.keyboard.press(`${mod}+s`);
      await expect.poll(() => fs.readFile(note, "utf8")).toBe(source);
      expect(await fs.readFile(path.join(userDataDir, "pixel.png"))).toEqual(await fs.readFile("tests/e2e/fixtures/reference-image.png"));
    } finally { await disposeBedrock(app, userDataDir); }
  });
}

test("reference, linked, HTML, multiline and missing images keep their notation hidden", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    await fs.copyFile(path.resolve("tests/e2e/fixtures/reference-image.png"), path.join(userDataDir, "pixel.png"));
    const note = path.join(userDataDir, "forms.md");
    const source = ["Before", "![Reference][ref]", "![Collapsed][]", "![Shortcut]", "[![Linked](pixel.png)](https://example.com)", '<img src="pixel.png" alt="HTML">', "![Multiline](\npixel.png\n)", "![Missing](missing.png)", "After", "[ref]: pixel.png", "[Collapsed]: pixel.png", "[Shortcut]: pixel.png"].join("\n\n");
    await fs.writeFile(note, source);
    await configureTestHarness(page, { nextOpenPath: note });
    await page.getByRole("button", { name: "Open…", exact: true }).click();
    for (const name of ["Reference", "Collapsed", "Shortcut", "Linked", "HTML", "Multiline", "Missing"]) {
      const image = page.getByRole("img", { name, exact: true });
      await image.scrollIntoViewIfNeeded();
      await image.click();
      await expect(image).toBeVisible();
      await expect(page.getByRole("toolbar", { name: "Image controls" })).toBeVisible();
      await expect(page.locator(".cm-content")).not.toContainText(/!\[|\]\(/);
      await page.keyboard.press("ArrowRight");
      await expect(image).toBeVisible();
    }
    await page.keyboard.press(`${mod}+s`);
    await expect.poll(() => fs.readFile(note, "utf8")).toBe(source);
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  } finally { await disposeBedrock(app, userDataDir); }
});

test("replace, cancellation, reveal and undo preserve image files and surrounding text", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    await fs.copyFile(path.resolve("tests/e2e/fixtures/reference-image.png"), path.join(userDataDir, "pixel.png"));
    const note = path.join(userDataDir, "replace.md");
    const source = "Before [![Pixel](pixel.png)](https://example.com) After";
    await fs.writeFile(note, source);
    await configureTestHarness(page, { nextOpenPath: note });
    await page.getByRole("button", { name: "Open…", exact: true }).click();
    const image = page.getByRole("img", { name: "Pixel", exact: true });
    await image.click();
    await page.getByRole("button", { name: /Show in Finder|Show in folder/ }).click();
    await expect.poll(() => page.evaluate(async () => (await window.electronAPI.test?.getState())?.lastRevealedImagePath)).toBe(await fs.realpath(path.join(userDataDir, "pixel.png")));
    await configureTestHarness(page, { nextImagePath: null });
    await page.getByRole("button", { name: "Replace image…" }).click();
    await page.keyboard.press(`${mod}+s`);
    await expect.poll(() => fs.readFile(note, "utf8")).toBe(source);
    await configureTestHarness(page, { nextImagePath: path.resolve("tests/e2e/fixtures/reference-image.png") });
    await page.getByRole("button", { name: "Replace image…" }).click();
    await expect.poll(() => fs.readdir(path.join(userDataDir, "Attachments")).catch((): string[] => [])).toHaveLength(1);
    await expect(page.locator("header")).toContainText("*");
    await page.keyboard.press(`${mod}+s`);
    await expect.poll(() => fs.readFile(note, "utf8")).toMatch(/^Before \[!\[Pixel\]\(<Attachments\/reference-image-[^)]+>\)\]\(https:\/\/example.com\) After$/);
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await page.keyboard.press(`${mod}+z`);
    await page.keyboard.press(`${mod}+s`);
    await expect.poll(() => fs.readFile(note, "utf8")).toBe(source);
    expect(await fs.readFile(path.join(userDataDir, "pixel.png"))).toEqual(await fs.readFile("tests/e2e/fixtures/reference-image.png"));
    const denied = await page.evaluate(async () => {
      try { await window.electronAPI.revealImage("../outside.png"); return false; } catch { return true; }
    });
    expect(denied).toBe(true);
  } finally { await disposeBedrock(app, userDataDir); }
});

test("table images expose controls without revealing cell Markdown", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    await fs.copyFile(path.resolve("tests/e2e/fixtures/reference-image.png"), path.join(userDataDir, "pixel.png"));
    const note = path.join(userDataDir, "table.md");
    const source = "Before\n\n| Picture | Text |\n| --- | --- |\n| ![Pixel](pixel.png) | Keep |\n\nAfter";
    await fs.writeFile(note, source);
    await configureTestHarness(page, { nextOpenPath: note });
    await page.getByRole("button", { name: "Open…", exact: true }).click();
    const image = page.getByRole("img", { name: "Pixel", exact: true });
    await image.click();
    await expect(image).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Image controls" })).toBeVisible();
    await expect(page.locator(".cm-content").last()).not.toContainText("![Pixel]");
    await page.getByRole("button", { name: "Delete image" }).click();
    await expect(image).toHaveCount(0);
    await page.keyboard.press(`${mod}+z`);
    await expect(image).toBeVisible();
    await page.keyboard.press(`${mod}+s`);
    await expect.poll(() => fs.readFile(note, "utf8")).toBe(source);
  } finally { await disposeBedrock(app, userDataDir); }
});


for (const hasSource of [true, false]) {
test(`replacing HTML images preserves attributes and supports undo (src=${hasSource})`, async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    await fs.copyFile(path.resolve("tests/e2e/fixtures/reference-image.png"), path.join(userDataDir, "pixel.png"));
    const note = path.join(userDataDir, "html.md");
    const source = `<img${hasSource ? ' src="pixel.png"' : ""} alt="Pixel" width="120" class="hero">`;
    await fs.writeFile(note, source);
    await configureTestHarness(page, { nextOpenPath: note, nextImagePath: path.resolve("tests/e2e/fixtures/reference-image.png") });
    await page.getByRole("button", { name: "Open…", exact: true }).click();
    await page.getByRole("img", { name: "Pixel", exact: true }).click();
    await page.getByRole("button", { name: "Replace image…" }).click();
    await expect(page.locator("header")).toContainText("*");
    await page.keyboard.press(`${mod}+s`);
    await expect.poll(() => fs.readFile(note, "utf8")).toMatch(/^<img src="Attachments\/[^" ]+" alt="Pixel" width="120" class="hero">$/);
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await page.keyboard.press(`${mod}+z`);
    await page.keyboard.press(`${mod}+s`);
    await expect.poll(() => fs.readFile(note, "utf8")).toBe(source);
  } finally { await disposeBedrock(app, userDataDir); }
});

}

test("large landscape, square and portrait images fit the editor with visible controls", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    for (const [width, height] of [[1600, 900], [1400, 1400], [2160, 3840]]) {
      const png = await app.evaluate(({ nativeImage }, input) => nativeImage.createFromPath(input.fixture).resize({ width: input.width, height: input.height }).toPNG().toString('base64'), { fixture: path.resolve('tests/e2e/fixtures/reference-image.png'), width, height });
      await fs.writeFile(path.join(userDataDir, 'large.png'), Buffer.from(png, 'base64'));
      const note = path.join(userDataDir, `size-${width}.md`);
      await fs.writeFile(note, 'Before\n\n![Large](large.png)\n\nAfter');
      await configureTestHarness(page, { nextOpenPath: note });
      await page.getByRole('button', { name: 'Open…', exact: true }).click();
      const image = page.getByRole('img', { name: 'Large', exact: true });
      await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(width);
      const loadedImage = await image.elementHandle();
      await image.click();
      expect(await loadedImage?.evaluate(el => el.isConnected)).toBe(true);
      const bounds = await image.boundingBox();
      if (!bounds) throw new Error('Image has no bounds');
      expect(bounds.width / bounds.height).toBeCloseTo(width / height, 2);
      await expect(page.getByRole('button', { name: 'Replace image…' })).toBeInViewport();
      await expect(page.getByRole('button', { name: 'Delete image', exact: true })).toBeInViewport();
      await expect(page.locator('.cm-content')).not.toContainText('![Large]');
    }
  } finally { await disposeBedrock(app, userDataDir); }
});
