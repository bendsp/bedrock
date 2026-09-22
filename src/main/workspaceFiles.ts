import { promises as fs } from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { readBoundedText } from "./noteFiles";
import type { ImportedImage, WorkspaceSearchResult } from "../shared/types";

export function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export async function workspaceNote(
  root: string,
  relative: unknown,
): Promise<string> {
  if (
    typeof relative !== "string" ||
    !relative ||
    relative.length > 4096 ||
    path.isAbsolute(relative) ||
    !relative.toLowerCase().endsWith(".md")
  )
    throw new Error("Choose a Markdown note in your Bedrock folder.");
  const canonicalRoot = await fs.realpath(root);
  const candidate = path.resolve(canonicalRoot, relative);
  if (!isWithin(canonicalRoot, candidate))
    throw new Error("This note is outside your Bedrock folder.");
  const resolved = await fs.realpath(candidate);
  if (!isWithin(canonicalRoot, resolved))
    throw new Error("This note is outside your Bedrock folder.");
  return resolved;
}

/** Search the user's files directly. No duplicate note database or hidden content index. */
export async function searchWorkspace(
  root: string,
  query: string,
  recent: string[],
  cancelled: () => boolean = () => false,
): Promise<WorkspaceSearchResult> {
  const canonicalRoot = await fs.realpath(root);
  const canonicalRecent = await Promise.all(
    recent.map((file) => fs.realpath(file).catch(() => file)),
  );
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches: Array<
    WorkspaceSearchResult["files"][number] & { rank: number }
  > = [];
  const directories = [canonicalRoot];
  let entries = 0,
    bytes = 0,
    truncated = false;
  while (directories.length && !cancelled()) {
    const directory = directories.pop();
    if (!directory) break;
    let listing;
    try {
      listing = await fs.opendir(directory);
    } catch {
      truncated = true;
      continue;
    }
    for await (const entry of listing) {
      if (cancelled()) return { files: [], truncated: false };
      if (++entries > 50_000) {
        truncated = true;
        directories.length = 0;
        break;
      }
      if (
        entry.name.startsWith(".") ||
        entry.name === "node_modules" ||
        entry.isSymbolicLink()
      )
        continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        directories.push(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md"))
        continue;
      const relativePath = path
        .relative(canonicalRoot, full)
        .split(path.sep)
        .join("/");
      const nameMatch = tokens.every((token) =>
        relativePath.toLocaleLowerCase().includes(token),
      );
      let excerpt: string | undefined;
      if (!nameMatch) {
        try {
          const size = (await fs.stat(full)).size;
          if (size > 1024 * 1024 || bytes + size > 32 * 1024 * 1024) {
            truncated = true;
            continue;
          }
          bytes += size;
          // Recheck containment immediately before reading: symlinks are never followed outside the root.
          const resolved = await workspaceNote(canonicalRoot, relativePath);
          const content = await readBoundedText(
            resolved,
            1024 * 1024,
            "Note too large for content search.",
          );
          const lower = content.toLocaleLowerCase();
          if (
            !tokens.every(
              (token) =>
                lower.includes(token) ||
                relativePath.toLocaleLowerCase().includes(token),
            )
          )
            continue;
          const index = Math.max(
            0,
            lower.indexOf(tokens.find((token) => lower.includes(token)) ?? ""),
          );
          excerpt = content
            .slice(Math.max(0, index - 40), index + 120)
            .replace(/\s+/g, " ");
        } catch {
          truncated = true;
          continue;
        }
      }
      const recentIndex = canonicalRecent.indexOf(full);
      const rank = tokens.length
        ? nameMatch
          ? 0
          : 1
        : recentIndex < 0
          ? recent.length
          : recentIndex;
      matches.push({ relativePath, name: entry.name, excerpt, rank });
    }
  }
  matches.sort(
    (a, b) => a.rank - b.rank || a.relativePath.localeCompare(b.relativePath),
  );
  return {
    files: matches.slice(0, 80).map(({ relativePath, name, excerpt }) => ({
      relativePath,
      name,
      excerpt,
    })),
    truncated: truncated || matches.length > 80,
  };
}

function imageExtension(bytes: Buffer): string {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (/^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6))) return "gif";
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  throw new Error("Use a PNG, JPEG, GIF, or WebP image.");
}

export function parseImageBatch(
  raw: unknown,
): Array<{ name: string; bytes: Buffer }> {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 10)
    throw new Error("Add between 1 and 10 images at a time.");
  let total = 0;
  return raw.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.name !== "string" ||
      item.name.length > 255 ||
      !(item.bytes instanceof Uint8Array)
    )
      throw new Error("Invalid image data.");
    const bytes = Buffer.from(item.bytes);
    total += bytes.length;
    if (
      !bytes.length ||
      bytes.length > 10 * 1024 * 1024 ||
      total > 25 * 1024 * 1024
    )
      throw new Error("Images must be at most 10 MB each and 25 MB together.");
    imageExtension(bytes);
    return { name: item.name, bytes };
  });
}

export async function importImages(
  root: string,
  documentPath: string,
  images: ReturnType<typeof parseImageBatch>,
): Promise<ImportedImage[]> {
  const canonicalRoot = await fs.realpath(root),
    note = await fs.realpath(documentPath);
  if (!isWithin(canonicalRoot, note))
    throw new Error(
      "Save this note in your Bedrock folder before adding images.",
    );
  const folder = path.join(canonicalRoot, "Attachments");
  await fs.mkdir(folder, { recursive: true });
  if (
    (await fs.lstat(folder)).isSymbolicLink() ||
    (await fs.realpath(folder)) !== folder
  )
    throw new Error("Attachments must be a folder inside your Bedrock folder.");
  const created: string[] = [],
    result: ImportedImage[] = [];
  try {
    for (const image of images) {
      const extension = imageExtension(image.bytes);
      const original = path.basename(image.name).replace(/\.[^.]+$/, "");
      const stem =
        original
          .replace(/[^a-zA-Z0-9_-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60) || "image";
      const target = path.join(folder, `${stem}-${randomUUID()}.${extension}`);
      const file = await fs.open(target, "wx", 0o600);
      created.push(target);
      try {
        await file.writeFile(image.bytes);
        await file.sync();
      } finally {
        await file.close();
      }
      result.push({
        relativePath: path
          .relative(path.dirname(note), target)
          .split(path.sep)
          .join("/"),
        alt: original || "Image",
      });
    }
    return result;
  } catch (error) {
    await Promise.all(created.map((file) => fs.rm(file, { force: true })));
    throw error;
  }
}
