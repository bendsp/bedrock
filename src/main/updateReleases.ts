import { valid, prerelease, lt, eq } from "semver";
import { UpdateChannel } from "../shared/updates";
import { UpdateCandidate } from "./updateController";
export const releaseRepository = "https://github.com/bendsp/bedrock";
export function versionChannel(version: string): UpdateChannel { return prerelease(version)?.[0] === "nightly" ? "nightly" : "stable"; }
export function updateMetadataName(platform: string, arch: string): string {
  return `latest-${arch}${platform === "darwin" ? "-mac" : ""}.yml`;
}
export function selectRelease(raw: unknown, channel: UpdateChannel, current: string, platform: string, arch: string): UpdateCandidate | null {
  if (!Array.isArray(raw)) throw new Error("Invalid release response.");
  const releases = raw.filter(item => item && typeof item === "object" && !item.draft &&
    typeof item.tag_name === "string" && valid(item.tag_name.replace(/^v/, "")) &&
    (channel === "stable" ? item.prerelease === false && !prerelease(item.tag_name.replace(/^v/, "")) :
      item.prerelease === true && versionChannel(item.tag_name.replace(/^v/, "")) === "nightly"));
  // GitHub's latest endpoint chooses stable; nightlies are ordered by publication time, not base version.
  if (channel === "nightly") releases.sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
  const release = releases[0];
  if (!release) throw new Error(`No ${channel} build is available yet.`);
  const version = release.tag_name.replace(/^v/, "");
  if (eq(version, current)) return null;
  const downgrade = lt(version, current);
  if (downgrade && versionChannel(current) === channel) return null;
  const name = updateMetadataName(platform, arch);
  if (!Array.isArray(release.assets) || !release.assets.some((asset: { name?: string }) => asset.name === name))
    throw new Error(`The latest ${channel} release does not support in-app updates for this computer yet.`);
  const tag = encodeURIComponent(release.tag_name);
  return { version, channel, downgrade, releaseUrl: `${releaseRepository}/releases/tag/${tag}`,
    feedUrl: `${releaseRepository}/releases/download/${tag}/` };
}
