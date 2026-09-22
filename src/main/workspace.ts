import { readBoundedText } from "./noteFiles";
import { promises as fs } from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { OpenFileResult, RecentFile, WorkspaceInfo } from "../shared/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isMissing = (error: unknown): boolean =>
  isRecord(error) && error.code === "ENOENT";

const readJson = async (filePath: string): Promise<unknown> => {
  try {
    return JSON.parse(
      await readBoundedText(
        filePath,
        256 * 1024,
        "Workspace metadata exceeds the size limit.",
      ),
    );
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
};

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
    });
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
};

class RecentHistoryError extends Error {}

/** The profile stores only the root pointer; workspace data stays in the root. */
export class WorkspaceStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private profilePath: string,
    readonly suggestedRootPath: string,
  ) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch((): undefined => undefined);
    return result;
  }

  private async root(): Promise<string | null> {
    const value = await readJson(
      path.join(this.profilePath, "workspace-location.json"),
    );
    if (value === null) return null;
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      typeof value.rootPath !== "string" ||
      !path.isAbsolute(value.rootPath)
    ) {
      throw new Error(
        "The saved folder setting is invalid. Choose your root folder again.",
      );
    }
    return value.rootPath;
  }

  private async recent(rootPath: string): Promise<RecentFile[]> {
    // Do not recreate a missing selected folder: it may be on an offline drive.
    if (!(await fs.stat(rootPath)).isDirectory())
      throw new Error("The root folder is not a directory.");
    try {
      const metadata = await fs.lstat(path.join(rootPath, ".bedrock"));
      if (!metadata.isDirectory() || metadata.isSymbolicLink())
        throw new Error(
          "The .bedrock data folder must be a directory inside your root folder.",
        );
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    let value: unknown;
    try {
      value = await readJson(
        path.join(rootPath, ".bedrock", "recent-files.json"),
      );
    } catch {
      throw new RecentHistoryError(
        "Recent-file history is unavailable. Your notes are safe; open a note from the File menu.",
      );
    }
    if (value === null) return [];
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      !Array.isArray(value.files)
    ) {
      throw new RecentHistoryError(
        "Recent-file data is invalid. Your notes have not been changed.",
      );
    }
    return value.files
      .slice(0, 20)
      .map((entry: unknown) => {
        if (
          !isRecord(entry) ||
          typeof entry.path !== "string" ||
          !entry.path ||
          typeof entry.openedAt !== "string" ||
          !Number.isFinite(Date.parse(entry.openedAt))
        ) {
          throw new RecentHistoryError(
            "Recent-file data contains an invalid entry.",
          );
        }
        const filePath = path.resolve(rootPath, entry.path);
        if (!filePath.toLowerCase().endsWith(".md"))
          throw new RecentHistoryError(
            "Recent-file data contains a non-Markdown file.",
          );
        return { filePath, openedAt: entry.openedAt };
      })
      .slice(0, 20);
  }

  private async recentInfo(
    rootPath: string,
  ): Promise<{ recentFiles: RecentFile[]; warning?: string }> {
    try {
      return { recentFiles: await this.recent(rootPath) };
    } catch (error) {
      if (error instanceof RecentHistoryError)
        return { recentFiles: [], warning: error.message };
      throw error;
    }
  }

  private async info(): Promise<WorkspaceInfo> {
    const rootPath = await this.root();
    return {
      rootPath,
      suggestedRootPath: this.suggestedRootPath,
      ...(rootPath ? await this.recentInfo(rootPath) : { recentFiles: [] }),
    };
  }

  getInfo(): Promise<WorkspaceInfo> {
    return this.serialize(() => this.info());
  }

  selectRoot(rootPath: string): Promise<WorkspaceInfo> {
    return this.serialize(async () => {
      if (!path.isAbsolute(rootPath))
        throw new Error("Choose an absolute folder path.");
      await fs.mkdir(rootPath, { recursive: true });
      const canonicalRoot = await fs.realpath(rootPath);
      // Validate existing metadata before committing the new setting.
      const history = await this.recentInfo(canonicalRoot);
      await fs.mkdir(path.join(canonicalRoot, ".bedrock"), { recursive: true });
      const metadata = path.join(
        canonicalRoot,
        ".bedrock",
        "recent-files.json",
      );
      try {
        await fs.access(metadata);
      } catch (error) {
        if (!isMissing(error)) throw error;
        await writeJson(metadata, { version: 1, files: [] });
      }
      await fs.mkdir(this.profilePath, { recursive: true });
      await writeJson(path.join(this.profilePath, "workspace-location.json"), {
        version: 1,
        rootPath: canonicalRoot,
      });
      return {
        rootPath: canonicalRoot,
        suggestedRootPath: this.suggestedRootPath,
        ...history,
      };
    });
  }

  private async requireRoot(): Promise<string> {
    const rootPath = await this.root();
    if (!rootPath) throw new Error("Choose a root folder first.");
    if (!(await fs.stat(rootPath)).isDirectory())
      throw new Error("The root folder is unavailable.");
    return rootPath;
  }

  defaultDirectory(): Promise<string> {
    return this.serialize(() => this.requireRoot());
  }

  private async remember(rootPath: string, filePath: string): Promise<void> {
    const files = await this.recent(rootPath);
    await fs.mkdir(path.join(rootPath, ".bedrock"), { recursive: true });
    const next = [
      { filePath, openedAt: new Date().toISOString() },
      ...files.filter((file) => file.filePath !== filePath),
    ].slice(0, 20);
    await writeJson(path.join(rootPath, ".bedrock", "recent-files.json"), {
      version: 1,
      files: next.map((file) => {
        const relative = path.relative(rootPath, file.filePath);
        const inside =
          relative !== ".." &&
          !relative.startsWith(`..${path.sep}`) &&
          !path.isAbsolute(relative);
        return {
          path: inside ? relative : file.filePath,
          openedAt: file.openedAt,
        };
      }),
    });
  }

  rememberFile(filePath: string): Promise<void> {
    return this.serialize(async () =>
      this.remember(await this.requireRoot(), path.resolve(filePath)),
    );
  }

  createNote(): Promise<OpenFileResult> {
    return this.serialize(async () => {
      const rootPath = await this.requireRoot();
      // Exclusive creation protects existing notes, including symlink names.
      for (let number = 1; number <= 10_000; number++) {
        const filePath = path.join(
          rootPath,
          number === 1 ? "Untitled.md" : `Untitled ${number}.md`,
        );
        try {
          await fs.writeFile(filePath, "", { flag: "wx" });
        } catch (error) {
          if (isRecord(error) && error.code === "EEXIST") continue;
          throw error;
        }
        try {
          await this.remember(rootPath, filePath);
        } catch (error) {
          // The note exists successfully. Open it even if history is unavailable,
          // just as file:open and file:save do, rather than leaving an orphan.
          console.error(
            "Unable to update recent files for the new note:",
            error,
          );
        }
        return { filePath, content: "" };
      }
      throw new Error(
        "Too many untitled notes. Rename a note before creating another.",
      );
    });
  }
}
