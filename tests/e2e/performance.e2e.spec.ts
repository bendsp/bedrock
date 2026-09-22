import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  launchBedrock,
  disposeBedrock,
  configureTestHarness,
  shortcutModifier as mod,
} from "./support";

test("a one-megabyte note stays editable and saves the final change", async () => {
  const { app, page, userDataDir } = await launchBedrock();
  try {
    const paragraph =
      "## Section\n\nA paragraph with **bold**, _italic_, `code` and a [link](https://example.com).\n\n";
    const source = paragraph.repeat(
      Math.ceil((1024 * 1024) / paragraph.length),
    );
    const note = path.join(userDataDir, "large.md");
    await fs.writeFile(note, source);
    await configureTestHarness(page, { nextOpenPath: note });
    await page.getByRole("button", { name: "Open…" }).click();
    await expect(page).toHaveTitle("large.md — Bedrock");
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeEnabled();
    await page.keyboard.press(`${mod}+End`);
    const durations: number[] = [];
    for (const char of "Measured typing") {
      const start = performance.now();
      await page.keyboard.type(char);
      durations.push(performance.now() - start);
    }
    const ordered = [...durations].sort((a, b) => a - b);
    const evidence = {
      documentBytes: Buffer.byteLength(source),
      keystrokes: durations.length,
      medianMs: ordered[Math.floor(ordered.length / 2)],
      maxMs: Math.max(...durations),
      durations,
    };
    const timings = test.info().outputPath("large-note-timings.json");
    await fs.writeFile(timings, JSON.stringify(evidence, null, 2));
    await test
      .info()
      .attach("Large-note typing timings", {
        path: timings,
        contentType: "application/json",
      });
    expect(evidence.maxMs).toBeLessThan(2000);
    await page.keyboard.press(`${mod}+s`);
    await expect(page).toHaveTitle("large.md — Bedrock");
    expect(await fs.readFile(note, "utf8")).toBe(source + "Measured typing");
  } finally {
    await disposeBedrock(app, userDataDir);
  }
});
