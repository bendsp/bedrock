import { test, expect, Page } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { launchBedrock, disposeBedrock, shortcutModifier as mod } from "./support";
async function updates(page: Page) {
  await page.keyboard.press(`${mod}+,`);
  await page.getByRole("button", { name: "Updates", exact: true }).click();
}
async function select(page: Page, channel: "Stable" | "Nightly") {
  await page.getByRole("combobox", { name: "Update channel" }).click();
  await page.getByRole("option", { name: channel, exact: true }).click();
  await page.getByRole("button", { name: "Apply channel", exact: true }).click();
}
test("switching from nightly to stable downloads a downgrade and protects dirty edits", async () => {
  const { app, page, userDataDir } = await launchBedrock({ updates: { version: "1.5.3-nightly.20260929.1" } });
  try {
    await page.locator(".cm-content").fill("Keep my unsaved work");
    await updates(page);
    await expect(page.getByText("Following Nightly.")).toBeVisible();
    await select(page, "Stable");
    await expect(page.getByText("1.5.2 is ready to install.")).toBeVisible();
    await expect(page.getByText(/Returning to stable installs the older version 1.5.2/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Restart with 1.5.2", exact: true })).toBeDisabled();
    const rejected = await page.evaluate(async () => { try { await window.electronAPI.installUpdate(); return false; } catch { return true; } });
    expect(rejected).toBe(true);
    expect(JSON.parse(await fs.readFile(path.join(userDataDir, "updates.json"), "utf8")).channel).toBe("stable");
    await page.screenshot({ path: test.info().outputPath("updates-downgrade.png") });
    await page.keyboard.press("Escape");
    await page.keyboard.press(`${mod}+s`);
    await expect(page.locator("header")).not.toContainText("*");
    await updates(page);
    await page.getByRole("button", { name: "Restart with 1.5.2", exact: true }).click();
    await expect.poll(() => fs.readFile(path.join(userDataDir, "update-test-installed.json"), "utf8").catch(() => "")).toContain('"installed":true');
    await expect(page.getByText("Installing and restarting…")).toBeVisible();
  } finally { await disposeBedrock(app, userDataDir); }
});
test("nightly downloads can be cancelled and switching back cannot install stale bytes", async () => {
  const { app, page, userDataDir } = await launchBedrock({ updates: { version: "1.5.2", delay: 3000 } });
  try {
    await updates(page);
    await select(page, "Nightly");
    await expect(page.getByRole("progressbar", { name: "Update download" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel download" }).click();
    await expect(page.getByRole("combobox", { name: "Update channel" })).toBeEnabled();
    await select(page, "Stable");
    await expect(page.getByText("You have the latest stable version.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Restart with/ })).toHaveCount(0);
    expect(await fs.stat(path.join(userDataDir, "update-test-installed.json")).then(() => true).catch(() => false)).toBe(false);
  } finally { await disposeBedrock(app, userDataDir); }
});
for (const failure of ["check", "download"] as const) {
  test(`${failure} failure leaves the app and document usable`, async () => {
    const { app, page, userDataDir } = await launchBedrock({ updates: { version: "1.5.2", failure } });
    try {
      await updates(page);
      await select(page, "Nightly");
      await expect(page.getByText(failure === "check" ? /You are offline/ : /checksum did not match/)).toBeVisible();
      await expect(page.getByRole("button", { name: /Restart with/ })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await page.locator(".cm-content").fill("Still editable");
      await expect(page.locator(".cm-content")).toContainText("Still editable");
    } finally { await disposeBedrock(app, userDataDir); }
  });
}
