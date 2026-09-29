import { app } from "electron";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { UpdateBackend } from "./updateController";
import { selectRelease } from "./updateReleases";
export type UpdateTestScenario = { version: string; failure?: "check" | "download"; delay?: number };
/** Only constructed by the explicit Electron test harness; never reads the network or installs an app. */
export function updateTestBackend(scenario: UpdateTestScenario): UpdateBackend {
  let cancel: (() => void) | null = null;
  return {
    async check(channel) {
      if (scenario.failure === "check") throw new Error("Unable to check updates. You are offline.");
      const releases = ["1.5.2", "1.5.3-nightly.20260929.999"].map(version => ({
        tag_name: version, prerelease: version.includes("nightly"), draft: false,
        published_at: "2026-09-29T12:00:00Z", assets: [{ name: "latest-arm64-mac.yml" }],
      }));
      return selectRelease(releases, channel, scenario.version, "darwin", "arm64");
    },
    async download(_candidate, progress) {
      progress(25);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, scenario.delay ?? 80);
        cancel = () => { clearTimeout(timer); reject(new Error("Cancelled")); };
      });
      cancel = null;
      if (scenario.failure === "download") throw new Error("Update checksum did not match. Nothing was installed.");
      progress(100);
    },
    cancel() { cancel?.(); },
    install() { writeFileSync(path.join(app.getPath("userData"), "update-test-installed.json"), JSON.stringify({ installed: true })); },
  };
}
