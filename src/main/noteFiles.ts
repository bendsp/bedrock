import { promises as fs } from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { MAX_MARKDOWN_FILE_BYTES } from "./ipcValidation";

export const revision = (content: string) =>
  createHash("sha256").update(content).digest("hex");
const errorCode = (error: unknown) =>
  error instanceof Error && "code" in error ? error.code : undefined;

export async function readBoundedText(
  filePath: string,
  limit: number,
  sizeMessage: string,
): Promise<string> {
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("This path is not a file.");
    if (stat.size > limit) throw new Error(sizeMessage);
    const buffer = Buffer.alloc(stat.size + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        size,
        buffer.length - size,
        null,
      );
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > stat.size)
      throw new Error(
        "This note changed while it was being read. Please open it again.",
      );
    try {
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        buffer.subarray(0, size),
      );
    } catch {
      throw new Error(
        "This file is not valid UTF-8 text. Convert it to UTF-8 before opening it in Bedrock.",
      );
    }
  } finally {
    await handle.close();
  }
}

export const readNote = async (filePath: string) => {
  const content = await readBoundedText(
    filePath,
    MAX_MARKDOWN_FILE_BYTES,
    "This Markdown file exceeds the 10 MB editing limit.",
  );
  if (content.includes("\0"))
    throw new Error(
      "This file contains binary or UTF-16 data. Convert it to UTF-8 before opening it in Bedrock.",
    );
  return content;
};

/** Replace only after the complete data is synced. Preserve the target of a symlink. */
export async function atomicWriteFile(
  filePath: string,
  content: string | Uint8Array,
  validate?: (target: string) => Promise<void>,
): Promise<void> {
  let target = filePath;
  let mode = 0o600;
  try {
    target = await fs.realpath(filePath);
    mode = (await fs.stat(target)).mode;
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${randomUUID()}.tmp`,
  );
  try {
    const handle = await fs.open(temporary, "wx", mode);
    try {
      await handle.writeFile(content, "utf8");
      // open() applies umask even when preserving an existing file's mode.
      await handle.chmod(mode & 0o777);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await validate?.(target);
    await fs.rename(temporary, target);
    if (process.platform !== "win32") {
      const directory = await fs.open(path.dirname(target), "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    }
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function atomicWriteNote(
  filePath: string,
  content: string,
  expectedRevision?: string,
): Promise<void> {
  await atomicWriteFile(
    filePath,
    content,
    expectedRevision === undefined
      ? undefined
      : async (target) => {
          let current: string;
          try {
            current = await readNote(target);
          } catch {
            throw new Error(
              "This note changed or became unavailable outside Bedrock. Use Save As to keep your edits, then reopen the original.",
            );
          }
          if (revision(current) !== expectedRevision)
            throw new Error(
              "This note changed outside Bedrock. Use Save As to keep your edits, then reopen the original.",
            );
        },
  );
}

const imageTypes = [
  {
    mime: "image/png",
    match: (b: Buffer) =>
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  {
    mime: "image/jpeg",
    match: (b: Buffer) => b[0] === 255 && b[1] === 216 && b[2] === 255,
  },
  {
    mime: "image/gif",
    match: (b: Buffer) => /^GIF8[79]a/.test(b.toString("ascii", 0, 6)),
  },
  {
    mime: "image/webp",
    match: (b: Buffer) =>
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP",
  },
];
export async function resolveNoteResource(
  documentPath: string,
  rootPath: string,
  resource: string,
): Promise<string> {
  if (
    !resource ||
    resource.length > 4096 ||
    /^[a-z][\w+.-]*:|^[\\/]{2}/i.test(resource)
  )
    throw new Error("Unsupported local resource path.");
  const decoded = decodeURIComponent(resource.split("#")[0]);
  if (path.isAbsolute(decoded) || decoded.includes("\0"))
    throw new Error("Use a relative path for note resources.");
  const root = await fs.realpath(rootPath);
  const resolved = await fs.realpath(
    path.resolve(path.dirname(await fs.realpath(documentPath)), decoded),
  );
  const relative = path.relative(root, resolved);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new Error("This resource is outside the note's allowed folder.");
  return resolved;
}
export async function readImage(filePath: string): Promise<string> {
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 10 * 1024 * 1024)
      throw new Error("Image is too large.");
    const buffer = Buffer.alloc(stat.size);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        size,
        buffer.length - size,
        null,
      );
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size !== buffer.length)
      throw new Error("Image changed while it was being read.");
    const type = imageTypes.find((type) => type.match(buffer));
    if (!type) throw new Error("Use a PNG, JPEG, GIF or WebP image.");
    return `data:${type.mime};base64,${buffer.toString("base64")}`;
  } finally {
    await handle.close();
  }
}
