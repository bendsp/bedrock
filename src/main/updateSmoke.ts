import { app } from "electron";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { UpdateController } from "./updateController";
import { UpdateStatus } from "../shared/updates";

/** Real installer checks run only in a disposable CI runner, with isolated user data. */
export function updateSmokeFeed(): string | undefined {
  if (process.env.BEDROCK_E2E !== "1" || process.env.CI !== "true" || !process.env.BEDROCK_USER_DATA_DIR) return undefined;
  const value = process.env.BEDROCK_UPDATE_SMOKE_FEED;
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") throw new Error("Update smoke feed must use loopback.");
  return url.href;
}
export function recordUpdateSmoke(status: UpdateStatus) {
  if (!updateSmokeFeed()) return;
  appendFileSync(path.join(app.getPath("userData"), "update-smoke.jsonl"), JSON.stringify({ ...status, pid: process.pid }) + "\n");
}
export async function runUpdateSmoke(controller: UpdateController) {
  const config = JSON.parse(readFileSync(path.join(app.getPath("userData"), "update-smoke-config.json"), "utf8"));
  if (config.report) {
    recordUpdateSmoke(controller.getStatus());
    app.exit(0);
    return;
  }
  await controller.selectChannel(config.channel);
  await controller.check();
  if (controller.getStatus().phase === "current") { app.exit(0); return; }
  if (controller.getStatus().phase !== "available") throw new Error(controller.getStatus().message ?? "Smoke update unavailable.");
  await controller.download();
  if (controller.getStatus().phase !== "ready") throw new Error(controller.getStatus().message ?? "Smoke download failed.");
  controller.install(false);
}
