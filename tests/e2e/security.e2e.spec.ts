import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  launchBedrock,
  disposeBedrock,
  configureTestHarness,
  shortcutModifier as mod,
} from "./support";

test("external edits cannot be overwritten and Save As preserves the editor's version", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const root = await page.evaluate(
      async () => (await window.electronAPI.getWorkspace()).rootPath,
    );
    if (!root) throw new Error("Missing workspace");
    const note = path.join(root, "Untitled.md");
    await page.locator(".cm-content").fill("Saved baseline");
    await page.keyboard.press(`${mod}+s`);
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeEnabled();
    await fs.writeFile(note, "External change");
    await page.locator(".cm-content").fill("My unsaved version");
    await page.keyboard.press(`${mod}+s`);
    await expect(page.getByRole("alert")).toContainText("outside Bedrock");
    expect(await fs.readFile(note, "utf8")).toBe("External change");
    await expect(page).toHaveTitle(/^\*/);
    await expect(page.locator(".cm-content")).toHaveText("My unsaved version");
    const copy = path.join(root, "Recovered.md");
    await configureTestHarness(page, { nextSavePath: copy });
    await page.keyboard.press(`${mod}+Shift+s`);
    await expect(page).toHaveTitle("Recovered.md — Bedrock");
    expect(await fs.readFile(copy, "utf8")).toBe("My unsaved version");
    expect(await fs.readFile(note, "utf8")).toBe("External change");
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("renderer IPC cannot read or overwrite an unapproved path", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const outside = path.join(userDataDir, "private.md");
    await fs.writeFile(outside, "Must stay private");
    const results = await page.evaluate(async (filePath) => {
      const attempt = async (operation: Promise<unknown>) => {
        try {
          await operation;
          return "allowed";
        } catch {
          return "denied";
        }
      };
      return Promise.all([
        attempt(window.electronAPI.readFile(filePath)),
        attempt(
          window.electronAPI.saveFile({ filePath, content: "Overwritten" }),
        ),
      ]);
    }, outside);
    expect(results).toEqual(["denied", "denied"]);
    expect(await fs.readFile(outside, "utf8")).toBe("Must stay private");
    expect(
      await page.evaluate(() => "require" in window || "process" in window),
    ).toBe(false);
    await page.evaluate(() => window.open("https://example.com"));
    expect(
      await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
      ),
    ).toBe(1);
    await page.locator(".cm-content").fill("Unsaved text");
    await page.keyboard.press(`${mod}+r`);
    await expect(page.locator(".cm-content")).toHaveText("Unsaved text");
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("HTML and PDF export preserve formatting and images without active note HTML", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const root = await page.evaluate(
      async () => (await window.electronAPI.getWorkspace()).rootPath,
    );
    if (!root) throw new Error("Missing workspace");
    await fs.writeFile(
      path.join(root, "pixel.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const exportSource =
      '---\ntitle: Private metadata title\n---\n\n# **Title**\n\n# Title\n\n[Go](#title-1)\n\nA <sup>2</sup> &amp; ==mark== with $x^2$.\n\n![Pixel](pixel.png)\n\nFootnote[^n].\n\n[^n]: Footnote body.\n\n<script>window.pwned=true</script>\n\n<img src="javascript:alert(1)" onerror="alert(1)"><style>body{display:none}</style><form>Unsafe</form>\n\n| A | B |\n| --- | ---: |\n| Alpha | 42 |\n\nEnd';
    const exportNote = path.join(root, "BOM export.md");
    await fs.writeFile(
      exportNote,
      "\ufeff" + exportSource.replace(/\n/g, "\r\n"),
    );
    await configureTestHarness(page, { nextOpenPath: exportNote });
    await page.keyboard.press(`${mod}+o`);
    await expect(page).toHaveTitle("BOM export.md — Bedrock");
    await page.keyboard.press(`${mod}+s`);
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeEnabled();
    const htmlPath = path.join(userDataDir, "export.html");
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, htmlPath);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByRole("menuitem", { name: "Export to HTML" }).click();
    await expect
      .poll(async () => fs.readFile(htmlPath, "utf8").catch(() => ""))
      .toContain("<html>");
    const html = await fs.readFile(htmlPath, "utf8");
    expect(html).toContain(
      '<h1 id="heading-title"><strong>Title</strong></h1>',
    );
    expect(html).toContain('<h1 id="heading-title-1">Title</h1>');
    expect(html).toContain("<sup>2</sup>");
    expect(html).toContain("<mark>mark</mark>");
    expect(html).toContain("<math");
    expect(html).toContain("<semantics>");
    expect(html).toContain('href="#heading-title-1"');
    expect(html).toContain('id="fn1"');
    expect(html).toContain("data:image/png;base64,");
    expect(html).toContain('align="right"');
    expect(html).toContain(".markdown-body");
    expect(html).not.toContain("Private metadata title");
    expect(html).not.toMatch(
      /<script|onerror|javascript:|<form|body\{display:none\}/,
    );
    const pdfPath = path.join(userDataDir, "export.pdf");
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, pdfPath);
    await expect(
      page.getByRole("button", { name: "Export", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByRole("menuitem", { name: "Export to PDF" }).click();
    await expect
      .poll(async () =>
        fs
          .readFile(pdfPath)
          .then((data) => data.subarray(0, 5).toString())
          .catch(() => ""),
      )
      .toBe("%PDF-");
    expect((await fs.stat(pdfPath)).size).toBeGreaterThan(1000);
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("CRLF and UTF-8 BOM notes open cleanly and retain their file format after editing", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const file = path.join(userDataDir, "windows.md");
    const source = "\ufeff# Heading\r\n\r\nEnd\r\n";
    await fs.writeFile(file, source);
    await configureTestHarness(page, { nextOpenPath: file });
    await page.getByRole("button", { name: "Open…" }).click();
    await expect(page).toHaveTitle("windows.md — Bedrock");
    await expect(page.locator(".cm-md-atxheading1")).toContainText("Heading");
    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.type("Added");
    await page.keyboard.press("Enter");
    await page.keyboard.type("line");
    await page.keyboard.press(`${mod}+s`);
    await expect(page).toHaveTitle("windows.md — Bedrock");
    expect(await fs.readFile(file, "utf8")).toBe(source + "Added\r\nline");
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("repeated large images hit the export budget before replacing an existing export", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const root = await page.evaluate(
      async () => (await window.electronAPI.getWorkspace()).rootPath,
    );
    if (!root) throw new Error("Missing workspace");
    const image = Buffer.alloc(9 * 1024 * 1024);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
    await fs.writeFile(path.join(root, "large.png"), image);
    const target = path.join(userDataDir, "existing.html");
    await fs.writeFile(target, "Previous export");
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, target);
    await page
      .locator(".cm-content")
      .fill(Array(100).fill("![large](large.png)").join("\n\n"));
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByRole("menuitem", { name: "Export to HTML" }).click();
    await expect(page.getByRole("alert")).toContainText("25 MB");
    expect(await fs.readFile(target, "utf8")).toBe("Previous export");
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});
