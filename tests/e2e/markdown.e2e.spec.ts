import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  disposeBedrock,
  launchBedrock,
  configureTestHarness,
  shortcutModifier as mod,
} from "./support";

async function palette(page: import("@playwright/test").Page, query: string) {
  await page.keyboard.press(`${mod}+k`);
  await page.getByRole("combobox", { name: "Search commands" }).fill(query);
  await page.getByRole("combobox", { name: "Search commands" }).press("Enter");
  await expect(
    page.getByRole("combobox", { name: "Search commands" }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.activeElement?.classList.contains("cm-content"),
      ),
    )
    .toBe(true);
}

test("Markdown retains active styling, renders nested syntax and edits through the registry", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page
      .locator(".cm-content")
      .fill(
        "# Heading one\n\n**Bold _inner_ outer**\n\n3. Three\n4. Four\n\n- [ ] Task\n\n~~~js\nconst value = 42;\n~~~\n\nEnd",
      );
    await page.keyboard.press(`${mod}+End`);
    const heading = page.locator(".cm-md-atxheading1");
    const size = await heading.evaluate((el) => getComputedStyle(el).fontSize);
    await heading.click();
    await expect(heading).toContainText("# Heading one");
    expect(await heading.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
      size,
    );
    expect(parseFloat(size)).toBeGreaterThan(20);
    await expect
      .poll(() =>
        page
          .locator(".cm-md-code-block span")
          .filter({ hasText: /^const$/ })
          .count(),
      )
      .toBe(1);
    const keyword = page
      .locator(".cm-md-code-block span")
      .filter({ hasText: /^const$/ });
    const lightCodeColor = await keyword.evaluate(
      (el) => getComputedStyle(el).color,
    );
    expect(lightCodeColor).not.toBe(
      await keyword.evaluate(
        (el) => getComputedStyle(el.parentElement as HTMLElement).color,
      ),
    );
    await expect(page.locator(".cm-md-em")).toHaveText("_inner_");
    await expect(page.locator(".cm-md-list-marker").first()).toHaveText("3.");
    await page.getByRole("checkbox", { name: "Mark task complete" }).click();
    await page.keyboard.press(`${mod}+s`);
    // Ask the main-owned workspace for the real disposable root.
    const root = await page.evaluate(
      async () => (await window.electronAPI.getWorkspace()).rootPath,
    );
    await expect(page.locator("header")).not.toContainText("*Untitled.md");
    const saved = await fs.readFile(
      path.join(root ?? "", "Untitled.md"),
      "utf8",
    );
    expect(saved).toContain("- [x] Task");
    await page.locator(".cm-content").click();
    await page.keyboard.press(`${mod}+End`);
    await palette(page, "Heading 2");
    await expect(page.locator(".cm-md-atxheading2")).toContainText("End");
    await page.keyboard.press(`${mod}+z`);
    await expect(page.locator(".cm-md-atxheading2")).toHaveCount(0);
    const lightBackground = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--panel-bg"),
    );
    await palette(page, "Dark theme");
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue(
            "--panel-bg",
          ),
        ),
      )
      .not.toBe(lightBackground);
    await expect
      .poll(() => keyword.evaluate((el) => getComputedStyle(el).color))
      .not.toBe(lightCodeColor);
    await palette(page, "Light theme");
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue(
            "--panel-bg",
          ),
        ),
      )
      .toBe(lightBackground);
    expect(errors).toEqual([]);
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("table preview, cell navigation and table commands preserve Markdown", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await palette(page, "Insert Table");
    await expect(page.locator(".cm-rich-table table")).toBeVisible();
    await page.keyboard.type("Name");
    await page.keyboard.press("Tab");
    await page.keyboard.type("Value");
    await page.keyboard.press("Tab");
    await page.keyboard.type("Alpha");
    await page.keyboard.press("Tab");
    await page.keyboard.type("42");
    await palette(page, "Align column right");
    await palette(page, "Add row below");
    await page.keyboard.type("Beta");
    await page.keyboard.press(`${mod}+s`);
    const root = await page.evaluate(
      async () => (await window.electronAPI.getWorkspace()).rootPath,
    );
    await expect(page.locator("header")).not.toContainText("*Untitled.md");
    const saved = await fs.readFile(
      path.join(root ?? "", "Untitled.md"),
      "utf8",
    );
    expect(saved).toContain("| Name | Value |");
    expect(saved).toContain("---:");
    expect(saved).toContain("Beta");
    await page.keyboard.press("Escape");
    await expect(page.locator(".cm-rich-table table")).toBeVisible();
    await expect(page.locator(".cm-rich-table th").first()).toHaveText("Name");
    expect(errors).toEqual([]);
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("settings persist and Markdown HTML cannot execute in the editor", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    await page.evaluate(() => {
      const current = JSON.parse(
        localStorage.getItem("bedrock:settings") ?? "{}",
      );
      localStorage.setItem(
        "bedrock:settings",
        JSON.stringify({
          ...current,
          textSize: 23,
          followSystem: false,
          theme: "light",
        }),
      );
    });
    await page.reload();
    await page.getByRole("button", { name: "New", exact: true }).click();
    await expect(page.locator(".cm-editor")).toHaveCSS("font-size", "23px");
    await page
      .locator(".cm-content")
      .fill(
        "<script>window.pwned = true</script>\n\n![unsafe](javascript:alert(1))\n\n# Styled\n\nEnd",
      );
    await page.keyboard.press(`${mod}+End`);
    expect(await page.evaluate(() => "pwned" in window)).toBe(false);
    expect(await page.evaluate(() => typeof window.electronAPI)).toBe("object");
    expect(
      await page.evaluate(() => "require" in window || "process" in window),
    ).toBe(false);
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

async function saveNote(
  page: import("@playwright/test").Page,
): Promise<string> {
  await page.keyboard.press(`${mod}+s`);
  await expect(page).not.toHaveTitle(/^\*/);
  await expect(page.locator(".cm-content").first()).toHaveAttribute(
    "contenteditable",
    "true",
  );
  const root = await page.evaluate(
    async () => (await window.electronAPI.getWorkspace()).rootPath,
  );
  if (!root) throw new Error("Missing test workspace");
  return fs.readFile(path.join(root, "Untitled.md"), "utf8");
}

test("table cells preserve pipes, spaces, formatting and shared undo", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await palette(page, "Insert Table");
    await page.keyboard.type("A | B");
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.press(`${mod}+b`);
    expect(await saveNote(page)).toContain("**A \\| B**");
    await page.keyboard.press(`${mod}+z`);
    expect(await saveNote(page)).toContain("| A \\| B |");
    await page.keyboard.press("Tab");
    await page.keyboard.type("two words");
    expect(await saveNote(page)).toContain("| A \\| B | two words |");
    await page.keyboard.press(`${mod}+k`);
    await page
      .getByRole("combobox", { name: "Search commands" })
      .fill("Heading");
    await expect(page.getByRole("option")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".cm-rich-table table")).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("table Enter fills short rows and spreadsheet paste grows the grid", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page
      .locator(".cm-content")
      .fill("| A | B | C |\n| --- | --- | --- |\n| short |\n\nEnd");
    await page.locator('.cm-table-cell[aria-label="Header column 3"]').click();
    await page.keyboard.press("Enter");
    await page.keyboard.type("filled");
    expect(await saveNote(page)).toContain("| short |  | filled |");
    await app.evaluate(({ clipboard }) =>
      clipboard.writeText('"first\nline"\tsecond\r\nthird\tfourth'),
    );
    await page.locator('.cm-table-cell[aria-label="Row 1 column 1"]').click();
    await page.keyboard.press(`${mod}+v`);
    const source = await saveNote(page);
    expect(source).toContain("| first<br>line | second | filled |");
    expect(source).toContain("| third | fourth |  |");
    await expect(page.locator(".cm-rich-table tr")).toHaveCount(3);
    expect(errors).toEqual([]);
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("active table cells obey the document lock during a delayed save", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    await palette(page, "Insert Table");
    await page.keyboard.type("Before save");
    await configureTestHarness(page, { workspaceDelayMs: 1000 });
    await page.keyboard.press(`${mod}+s`);
    const cell = page.locator('[data-table-cell="true"]');
    await expect(cell).toHaveAttribute("contenteditable", "false");
    await page.keyboard.type("MUST NOT APPEAR");
    await expect(cell).toHaveAttribute("contenteditable", "true");
    await configureTestHarness(page, { workspaceDelayMs: 0 });
    expect(await saveNote(page)).toContain("| Before save | Column 2 |");
    await expect(cell).not.toContainText("MUST NOT APPEAR");
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("undoing a table insertion restores a focused document editor", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    await palette(page, "Insert Table");
    await page.keyboard.press(`${mod}+z`);
    await expect(page.locator(".cm-rich-table")).toHaveCount(0);
    await page.keyboard.type("After undo");
    await expect(page.locator(".cm-content")).toHaveText("After undo");
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("tables remain rendered in raw mode and their context menu uses table commands", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    await page.evaluate(() => {
      const settings = JSON.parse(
        localStorage.getItem("bedrock:settings") ?? "{}",
      );
      localStorage.setItem(
        "bedrock:settings",
        JSON.stringify({ ...settings, renderMode: "raw" }),
      );
    });
    await page.reload();
    await page.getByRole("button", { name: "New", exact: true }).click();
    await palette(page, "Insert Table");
    await page.keyboard.type("Rendered");
    await page
      .locator('.cm-table-cell[aria-label="Header column 1"]')
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "Table", exact: true }).hover();
    await page
      .getByRole("menuitem", { name: "Add row below", exact: true })
      .click();
    await expect(page.locator(".cm-rich-table tr")).toHaveCount(3);
    await expect(page.locator(".cm-content").first()).not.toContainText("---");
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("footnotes, entities and display math render without changing the stored source", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const source =
      "# Heading one\n\nTitle\n=====\n\n&amp; &#169; &lt;\n\nA reference[^note].\n\n[^note]: **Footnote** text.\n\n$$\n\\begin{matrix}a & b \\\\ c & d\\end{matrix}\n$$\n\nEnd";
    await page.locator(".cm-content").fill(source);
    await page.keyboard.press(`${mod}+End`);
    await expect(page.locator(".cm-md-entity")).toHaveText(["&", "©", "<"]);
    await expect(page.locator(".cm-md-footnote")).toHaveText("1");
    await expect(page.locator(".cm-md-preview-math .katex")).toBeVisible();
    await expect(page.locator(".cm-content")).not.toContainText("=====");
    expect(await saveNote(page)).toBe(source);
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("safe HTML renders inline and as blocks while edits retain the exact source", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const source =
      "Water H<sub>2</sub>O and **x<sup>2</sup>**, <kbd>Ctrl</kbd>.\n\n> <div>\n> <strong>HTML block</strong>\n> </div>\n\nEnd";
    await page.locator(".cm-content").fill(source);
    await page.keyboard.press(`${mod}+End`);
    await expect(page.locator(".cm-md-preview-html sub")).toHaveText("2");
    await expect(page.locator(".cm-md-preview-html sup")).toHaveText("2");
    await expect(page.locator(".cm-md-preview-html kbd")).toHaveText("Ctrl");
    await expect(page.locator(".cm-md-preview-html strong")).toHaveText(
      "HTML block",
    );
    await expect(page.locator(".cm-md-preview-html blockquote")).toContainText(
      "HTML block",
    );
    await expect(
      page.locator(".cm-md-preview-html blockquote"),
    ).not.toContainText(">");
    expect(await saveNote(page)).toBe(source);
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("table references share document numbering and cells render images and math", async () => {
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
    const source =
      "First[^a].\n\n| Reference | Image | Math |\n| --- | --- | --- |\n| Second[^b] [Jump](#destination) | ![pixel](pixel.png) | $x^2$ |\n\nThird[^c].\n\n[^a]: First note.\n[^b]: Second note.\n[^c]: Third note.\n\n# Destination\n\nEnd";
    await page.locator(".cm-content").fill(source);
    await page.keyboard.press(`${mod}+End`);
    await expect(page.locator(".cm-md-preview-footnote")).toHaveText([
      "1",
      "3",
    ]);
    await expect(page.locator(".cm-table-cell .footnote-ref")).toHaveText(
      "[2]",
    );
    await expect(page.locator(".cm-table-cell .footnotes")).toHaveCount(0);
    const image = page.locator(".cm-table-cell img");
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute("src", /^data:image\/png;base64,/);
    await expect(page.locator(".cm-table-cell math")).toBeVisible();
    await page.locator('.cm-table-cell[aria-label="Row 1 column 1"]').click();
    await page.keyboard.press("Home");
    await expect(
      page.locator("[data-table-cell] .cm-md-preview-footnote"),
    ).toHaveText("2");
    await page.keyboard.press("Tab");
    await expect(page.locator(".cm-table-cell .footnote-ref")).toHaveText(
      "[2]",
    );
    await page.keyboard.down(mod);
    await page.locator(".cm-table-cell .footnote-ref a").click();
    await page.keyboard.up(mod);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window
              .getSelection()
              ?.anchorNode?.parentElement?.closest(".cm-line")?.textContent,
        ),
      )
      .toContain("[^b]:");
    await page.keyboard.down(mod);
    await page.locator(".cm-table-cell a").filter({ hasText: "Jump" }).click();
    await page.keyboard.up(mod);
    await expect(page.locator(".cm-md-atxheading1")).toContainText(
      "# Destination",
    );
    expect(await saveNote(page)).toBe(source);
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("table selection formatting cannot expose source and table deletion is undoable", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    await palette(page, "Insert Table");
    await page.keyboard.press("Escape");
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.press(`${mod}+b`);
    await expect(page.locator(".cm-rich-table table")).toBeVisible();
    await page.locator('.cm-table-cell[aria-label="Header column 1"]').click();
    await palette(page, "Delete table");
    await expect(page.locator(".cm-rich-table table")).toHaveCount(0);
    await page.keyboard.press(`${mod}+z`);
    await expect(page.locator(".cm-rich-table table")).toBeVisible();
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("editing a borderless table never exposes source or shifts empty cells", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    await page.locator(".cm-content").fill("A | B\n--- | ---\nx | y\n\nEnd");
    await page.locator('.cm-table-cell[aria-label="Header column 1"]').click();
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.press("Backspace");
    await expect(page.locator(".cm-rich-table th")).toHaveCount(2);
    await page.keyboard.type("Renamed");
    await page.locator('.cm-table-cell[aria-label="Row 1 column 1"]').click();
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.press("Backspace");
    await expect(
      page.locator('.cm-table-cell[aria-label="Row 1 column 2"]'),
    ).toHaveText("y");
    await expect(page.locator(".cm-rich-table table")).toBeVisible();
    expect(await saveNote(page)).toContain("| Renamed | B |");
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("frontmatter is editable metadata and the declared command does not duplicate it", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    await palette(page, "Frontmatter");
    await page.keyboard.type("Document title");
    await palette(page, "Frontmatter");
    await expect(page.locator(".cm-md-hr-widget")).toHaveCount(0);
    const source = await saveNote(page);
    expect(source).toBe("---\ntitle: Document title\ntags: []\n---\n\n");
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("an active table cell receives a remapped shortcut and Control K opens the declared palette", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    await palette(page, "Insert Table");
    await page.keyboard.type("Remapped");
    await page.keyboard.press(`${mod}+,`);
    await page
      .getByRole("button", { name: "Keybindings", exact: true })
      .click();
    const bold = page
      .locator('[data-slot="item"]')
      .filter({ has: page.getByText("Bold", { exact: true }) });
    await bold.getByRole("button", { name: "Change", exact: true }).click();
    await page.keyboard.press(`${mod}+Shift+b`);
    await page.keyboard.press("Escape");
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.press(`${mod}+Shift+b`);
    expect(await saveNote(page)).toContain("**Remapped**");
    // Native Find and the cell's undo fallback must not reserve configurable keys.
    for (const [label, binding] of [
      ["Find", `${mod}+Shift+f`],
      ["Undo", `${mod}+Shift+u`],
      ["Bold", `${mod}+f`],
      ["Bold", `${mod}+z`],
    ]) {
      await page.keyboard.press(`${mod}+,`);
      await page
        .getByRole("button", { name: "Keybindings", exact: true })
        .click();
      const row = page
        .locator('[data-slot="item"]')
        .filter({ has: page.getByText(label, { exact: true }) });
      await row.getByRole("button", { name: "Change", exact: true }).click();
      await page.keyboard.press(binding);
      await page.keyboard.press("Escape");
      if (label === "Bold") {
        await page.keyboard.press(`${mod}+a`);
        await page.keyboard.press(binding);
        const saved = await saveNote(page);
        expect(saved.includes("**Remapped**")).toBe(binding.endsWith("z"));
      }
    }
    await page.keyboard.press("Control+k");
    await expect(
      page.getByRole("combobox", { name: "Search commands" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("reference links open a sibling note at the requested heading", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const root = await page.evaluate(
      async () => (await window.electronAPI.getWorkspace()).rootPath,
    );
    if (!root) throw new Error("Missing workspace");
    await fs.writeFile(
      path.join(root, "other.md"),
      "# Intro\n\n" +
        "Paragraph.\n\n".repeat(50) +
        "# **Target**\n\nDestination",
    );
    await page
      .locator(".cm-content")
      .fill(
        "[Other note][destination]\n\n[destination]: other.md#target\n\nEnd",
      );
    await saveNote(page);
    await page.keyboard.press(`${mod}+End`);
    await page.locator(".cm-link").first().click();
    await palette(page, "Follow link");
    await expect(page).toHaveTitle("other.md — Bedrock");
    const heading = page
      .locator(".cm-md-atxheading1")
      .filter({ hasText: "Target" });
    await expect(heading).toBeInViewport();
    await expect(heading).toContainText("#");
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("formatting survives visible-range gaps around rich blocks and nested quotes retain depth", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const source =
      "# Before\n\n| A | B |\n| --- | --- |\n| x | y |\n\n## After table\n\n$$\nx^2\n$$\n\n**After math**\n\n***\n\n> Outer\n> > Inner\n\nEnd";
    await page.locator(".cm-content").fill(source);
    await page.keyboard.press(`${mod}+End`);
    await expect(page.locator(".cm-md-atxheading2")).toHaveCount(1);
    await expect(page.locator(".cm-md-strong")).toHaveText("**After math**");
    await expect(page.locator(".cm-md-hr-widget")).toHaveCount(1);
    const quotes = page.locator(".cm-md-quote");
    const padding = await quotes.evaluateAll((elements) =>
      elements.map((el) => parseFloat(getComputedStyle(el).paddingLeft)),
    );
    expect(padding).toHaveLength(2);
    expect(padding[1]).toBeGreaterThan(padding[0]);
    expect(await saveNote(page)).toBe(source);
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});

test("source heading fragments take precedence over internal IDs and nested bare links stay actionable", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    await page
      .locator(".cm-content")
      .fill(
        "# Foo\n\n# Heading Foo\n\n[Jump](#heading-foo)\n\n- [ ] https://example.com\n\n**https://example.org**\n\n+ Bullet\n\nEnd",
      );
    await page.keyboard.press(`${mod}+End`);
    await expect(
      page.locator(".cm-link").filter({ hasText: "https://example.com" }),
    ).toHaveCount(1);
    await expect(
      page.locator(".cm-link").filter({ hasText: "https://example.org" }),
    ).toHaveCount(1);
    await expect(page.locator(".cm-md-bullet")).toHaveText("•");
    await page.locator(".cm-link").filter({ hasText: "Jump" }).click();
    await palette(page, "Follow link");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window
              .getSelection()
              ?.anchorNode?.parentElement?.closest(".cm-line")?.textContent,
        ),
      )
      .toBe("# Heading Foo");
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});
