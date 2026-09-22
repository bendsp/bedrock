import { test, expect, Page } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  launchBedrock,
  disposeBedrock,
  configureTestHarness,
  shortcutModifier as mod,
} from "./support";

async function caret(page: Page) {
  return page.evaluate(() => {
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const line = (
      node?.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node?.parentElement
    )?.closest(".cm-line");
    if (!selection || !node || !line) return null;
    const prefix = document.createRange();
    prefix.selectNodeContents(line);
    prefix.setEnd(node, selection.anchorOffset);
    return { text: line.textContent, offset: prefix.toString().length };
  });
}

test("arrow keys enter tables, cross cells and leave without changing source", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const source =
      "Above\n\n| Name | Value |\n| --- | --- |\n| Alpha | One |\n| Beta | Two |\n\nBelow";
    await page.locator(".cm-content").fill(source);
    await page.keyboard.press(`${mod}+Home`);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    const active = page.locator('[data-table-cell="true"]');
    await expect(active).toHaveAttribute("aria-label", "Header column 1");
    await page.keyboard.press("ArrowDown");
    await expect(active).toHaveAttribute("aria-label", "Row 1 column 1");
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowRight");
    await expect(active).toHaveAttribute("aria-label", "Row 1 column 2");
    await page.keyboard.press("ArrowDown");
    await expect(active).toHaveAttribute("aria-label", "Row 2 column 2");
    await page.keyboard.press("ArrowDown");
    await expect(active).toHaveCount(0);
    await page.keyboard.press("ArrowUp");
    await expect(active).toHaveAttribute("aria-label", "Row 2 column 1");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(active).toHaveAttribute("aria-label", "Header column 1");
    await page.keyboard.press("ArrowUp");
    await expect(active).toHaveCount(0);
    const saved = path.join(userDataDir, "navigation.md");
    await configureTestHarness(page, { nextSavePath: saved });
    await page.keyboard.press(`${mod}+Shift+s`);
    await expect
      .poll(() => fs.readFile(saved, "utf8").catch((): null => null))
      .toBe(source);
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("code after tables maps mouse clicks and vertical arrows to the visible line", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const code = [
      "```javascript",
      'const greeting = "Hello, Bedrock";',
      "",
      "function greet(name) {",
      "  return `${greeting}, ${name}!`;",
      "}",
      "",
      'console.log(greet("Ben"));',
      "// **These asterisks are code, not bold.**",
      "```",
    ];
    await page
      .locator(".cm-content")
      .fill(
        "| A | B |\n| --- | --- |\n| C | D |\n\n> | E | F |\n> | --- | --- |\n> | G | H |\n\n" +
          code.join("\n") +
          "\n\nEnd",
      );
    await page.keyboard.press(`${mod}+End`);
    const line = page
      .locator(".cm-md-code-block")
      .filter({ hasText: /^function greet/ });
    await line.scrollIntoViewIfNeeded();
    // Click a character's actual browser rectangle, independently of CodeMirror's height map.
    const point = await line.evaluate((element) => {
      const node = element.firstChild as Node;
      const range = document.createRange();
      range.setStart(node.firstChild ?? node, 0);
      range.setEnd(node.firstChild ?? node, 1);
      const box = range.getBoundingClientRect();
      return { x: box.left + 1, y: (box.top + box.bottom) / 2 };
    });
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => caret(page)).toEqual({ text: code[3], offset: 0 });
    await page.keyboard.press("ArrowDown");
    await expect.poll(async () => (await caret(page))?.text).toBe(code[4]);
    await page.keyboard.press("ArrowDown");
    await expect.poll(async () => (await caret(page))?.text).toBe("}");
    await page.keyboard.press("ArrowUp");
    await expect.poll(async () => (await caret(page))?.text).toBe(code[4]);
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("local reference images resolve after multiline footnote definitions", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    await fs.copyFile(
      path.resolve("tests/e2e/fixtures/reference-image.png"),
      path.join(userDataDir, "icon.png"),
    );
    const note = path.join(userDataDir, "images.md");
    await fs.writeFile(
      note,
      '# Images\n\n![Bedrock][icon]\n\nEnd\n\n[^note]: A footnote.\n\n    Another paragraph.\n\n[icon]: icon.png "Bedrock icon"\n',
    );
    await configureTestHarness(page, { nextOpenPath: note });
    await page.getByRole("button", { name: "Open…", exact: true }).click();
    const image = page.getByRole("img", { name: "Bedrock", exact: true });
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBe(32);
    await expect(image).toHaveAttribute("src", /^data:image\/png;base64,/);
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("arrows enter quoted tables and stay within wrapped cell text", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    await page
      .locator(".cm-content")
      .fill(
        "Before\n\n> | Heading | B |\n> | --- | --- |\n> | " +
          "Long wrapped cell content. ".repeat(25) +
          " | D |\n\nAfter",
      );
    await page.keyboard.press(`${mod}+Home`);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    const active = page.locator('[data-table-cell="true"]');
    await expect(active).toHaveAttribute("aria-label", "Header column 1");
    await page.keyboard.press("ArrowDown");
    await expect(active).toHaveAttribute("aria-label", "Row 1 column 1");
    const before = await caret(page);
    await page.keyboard.press("ArrowDown");
    await expect(active).toHaveAttribute("aria-label", "Row 1 column 1");
    expect((await caret(page))?.offset).toBeGreaterThan(before?.offset ?? 0);
    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.press("ArrowDown");
    await expect(active).toHaveCount(0);
    await page.keyboard.press("ArrowUp");
    await expect(active).toHaveAttribute("aria-label", "Row 1 column 1");
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("navigating missing table cells does not format the document", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const note = path.join(userDataDir, "short-row.md");
    const source =
      "Before\n\n| A | B | C |\n| --- | --- | --- |\n| Value |\n\nAfter";
    await fs.writeFile(note, source);
    await configureTestHarness(page, { nextOpenPath: note });
    await page.getByRole("button", { name: "Open…", exact: true }).click();
    await expect(page.locator("header")).toContainText("short-row.md");
    await page.locator(".cm-line").filter({ hasText: /^Before$/ }).click();
    await page.keyboard.press(`${mod}+Home`);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    const active = page.locator('[data-table-cell="true"]');
    await expect(active).toHaveAttribute("aria-label", "Header column 1");
    await page.keyboard.press("Tab");
    await expect(active).toHaveAttribute("aria-label", "Header column 2");
    await page.keyboard.press("ArrowDown");
    await expect(active).toHaveAttribute("aria-label", "Row 1 column 2");
    await expect(page.locator("header")).not.toContainText("*short-row.md");
    await page.keyboard.press("ArrowRight");
    await expect(active).toHaveAttribute("aria-label", "Row 1 column 3");
    await expect(page.locator("header")).not.toContainText("*short-row.md");
    await page.keyboard.press("Shift+Tab");
    await expect(active).toHaveAttribute("aria-label", "Row 1 column 2");
    await page.keyboard.press("Tab");
    await expect(active).toHaveAttribute("aria-label", "Row 1 column 3");
    await expect(page.locator("header")).not.toContainText("*short-row.md");
    await page.keyboard.type("New");
    await page.keyboard.press(`${mod}+s`);
    await expect
      .poll(() => fs.readFile(note, "utf8"))
      .toContain("| Value |  | New |");
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});
