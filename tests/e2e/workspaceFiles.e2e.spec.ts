import { test, expect, Page } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  launchBedrock,
  disposeBedrock,
  configureTestHarness,
  shortcutModifier as mod,
} from "./support";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
async function pasteImage(
  page: Page,
  selector = ".cm-content",
  kind = "paste",
) {
  await page.locator(selector).evaluate(
    (element, { png, kind }) => {
      const data = new DataTransfer();
      data.items.add(
        new File(
          [Uint8Array.from(atob(png), (c) => c.charCodeAt(0))],
          "Screenshot.png",
          { type: "image/png" },
        ),
      );
      if (kind === "paste")
        element.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: data,
            bubbles: true,
            cancelable: true,
          }),
        );
      else {
        const box = element.getBoundingClientRect();
        element.dispatchEvent(
          new DragEvent("drop", {
            dataTransfer: data,
            bubbles: true,
            cancelable: true,
            clientX: box.left + 10,
            clientY: box.top + 10,
          }),
        );
      }
    },
    { png, kind },
  );
}

test("pasted and dropped images become portable attachments with undo and reload", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const root = await page.evaluate(
      async () => (await window.electronAPI.getWorkspace()).rootPath,
    );
    if (!root) throw new Error("Missing root");
    await page.locator(".cm-content").fill("Before");
    await page.keyboard.press(`${mod}+End`);
    await pasteImage(page);
    await expect(page.locator(".cm-md-preview-image img")).toBeVisible();
    await expect
      .poll(() => fs.readdir(path.join(root, "Attachments")))
      .toHaveLength(1);
    await page.keyboard.press(`${mod}+z`);
    await expect(page.locator(".cm-content")).toHaveText("Before");
    await page.keyboard.press(`${mod}+y`);
    await expect(page.locator(".cm-md-preview-image img")).toBeVisible();
    await page.keyboard.press(`${mod}+s`);
    const note = path.join(root, "Untitled.md");
    await expect
      .poll(() => fs.readFile(note, "utf8"))
      .toContain("Attachments/Screenshot-");
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.getByRole("button", { name: /Untitled.md/ }).click();
    await expect(page.locator(".cm-md-preview-image img")).toBeVisible();
    await pasteImage(page, ".cm-content", "drop");
    await expect
      .poll(() => fs.readdir(path.join(root, "Attachments")))
      .toHaveLength(2);
    await expect(page.locator(".cm-md-preview-image img")).toHaveCount(2);
    await page.keyboard.press(`${mod}+s`);
    await expect
      .poll(
        async () =>
          (await fs.readFile(note, "utf8")).match(/Attachments\/Screenshot-/g)
            ?.length,
      )
      .toBe(2);
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("images paste inside table cells through the shared command", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    await page
      .locator(".cm-content")
      .fill("| Image | Note |\n| --- | --- |\n| A | B |\n\nEnd");
    await page.keyboard.press(`${mod}+End`);
    await page
      .getByRole("textbox", { name: "Row 1 column 1", exact: true })
      .click();
    await expect(page.locator('[data-table-cell="true"]')).toBeFocused();
    await pasteImage(page, '[data-table-cell="true"]');
    await expect
      .poll(() => page.locator('[data-table-cell="true"]').innerText())
      .toContain("Attachments/Screenshot-");
    await page.keyboard.press("Escape");
    await expect(page.locator(".cm-rich-table img")).toBeVisible();
    await expect(page.locator(".cm-rich-table")).toHaveCount(1);
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("quick-open searches subfolders and content, honors dirty cancellation and opens from Home", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const root = await page.evaluate(
      async () => (await window.electronAPI.getWorkspace()).rootPath,
    );
    if (!root) throw new Error("Missing root");
    await fs.mkdir(path.join(root, "Projects"));
    await fs.writeFile(
      path.join(root, "Projects", "Ideas.md"),
      "A marmalade constellation",
    );
    await fs.writeFile(path.join(root, "Ideas.md"), "A different note");
    await page.locator(".cm-content").fill("Unsaved writing");
    await configureTestHarness(page, { discardResponse: false });
    await page.keyboard.press(`${mod}+p`);
    const search = page.getByRole("combobox", { name: "Find a note" });
    await search.fill("marmalade");
    await expect(page.getByRole("option")).toContainText("Projects/Ideas.md");
    await search.press("Enter");
    await expect(search).toHaveCount(0);
    await expect(page.locator(".cm-content")).toHaveText("Unsaved writing");
    await configureTestHarness(page, { discardResponse: true });
    await page.keyboard.press(`${mod}+p`);
    await search.fill("projects ideas");
    await expect(page.getByRole("option")).toHaveCount(1);
    await search.press("Enter");
    await expect(page.locator("header")).toHaveText("Ideas.md");
    await expect(page.locator(".cm-content")).toHaveText(
      "A marmalade constellation",
    );
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page
      .getByRole("button", { name: "Find a note…", exact: true })
      .click();
    await search.fill("ideas");
    await expect(page.getByRole("option")).toHaveCount(2);
    await search.press("ArrowDown");
    await search.press("Enter");
    await expect(page.locator(".cm-content")).toBeVisible();
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("workspace IPC rejects image and note requests outside the selected folder", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const outside = path.join(userDataDir, "outside.md");
    await fs.writeFile(outside, "private");
    expect(
      await page.evaluate(async () => {
        try {
          await window.electronAPI.openWorkspaceNote("../../outside.md");
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    expect(
      await page.evaluate(async () => {
        try {
          await window.electronAPI.importImages({
            documentPath: "/unapproved.md",
            images: [{ name: "fake.png", bytes: new Uint8Array([1, 2, 3]) }],
          });
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    await configureTestHarness(page, { nextOpenPath: outside });
    await page.getByRole("button", { name: "Open…", exact: true }).click();
    await expect(page.locator("header")).toContainText("outside.md");
    await page.locator(".cm-content").click();
    await pasteImage(page);
    await expect(page.getByRole("alert")).toContainText(
      "Save this note in your Bedrock folder",
    );
    expect(await fs.readFile(outside, "utf8")).toBe("private");
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("an alias to a workspace note imports and resolves images using the real note folder", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const root = await page.evaluate(
      async () => (await window.electronAPI.getWorkspace()).rootPath,
    );
    if (!root) throw new Error("Missing root");
    const alias = path.join(userDataDir, "Alias.md");
    await fs.symlink(path.join(root, "Untitled.md"), alias);
    await configureTestHarness(page, { nextOpenPath: alias });
    await page.getByRole("button", { name: "Open…", exact: true }).click();
    await expect(page.locator("header")).toContainText("Alias.md");
    await page.locator(".cm-content").click();
    await pasteImage(page);
    const image = page.locator(".cm-md-preview-image img");
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBe(1);
    await page.keyboard.press(`${mod}+s`);
    await expect
      .poll(() => fs.readFile(path.join(root, "Untitled.md"), "utf8"))
      .toContain("Attachments/Screenshot-");
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});
