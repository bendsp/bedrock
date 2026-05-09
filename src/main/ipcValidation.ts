import { ExportFilePayload, SaveFilePayload } from "../shared/types";

export const MAX_MARKDOWN_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_EXPORT_HTML_BYTES = 25 * 1024 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

export const hasReasonableContentSize = (
  content: unknown,
  maxBytes: number
): content is string => {
  return (
    typeof content === "string" &&
    Buffer.byteLength(content, "utf-8") <= maxBytes
  );
};

export const normalizeSaveFilePayload = (
  payload: unknown
): SaveFilePayload | null => {
  if (!isRecord(payload)) {
    return null;
  }
  if (!hasReasonableContentSize(payload.content, MAX_MARKDOWN_FILE_BYTES)) {
    return null;
  }
  if (
    "filePath" in payload &&
    payload.filePath !== undefined &&
    (typeof payload.filePath !== "string" || payload.filePath.trim() === "")
  ) {
    return null;
  }

  const filePath =
    typeof payload.filePath === "string" ? payload.filePath : undefined;

  return {
    content: payload.content,
    filePath,
  };
};

export const normalizeExportFilePayload = (
  payload: unknown
): ExportFilePayload | null => {
  if (!isRecord(payload)) {
    return null;
  }
  if (payload.format !== "html" && payload.format !== "pdf") {
    return null;
  }
  if (!hasReasonableContentSize(payload.content, MAX_EXPORT_HTML_BYTES)) {
    return null;
  }
  if (
    "defaultFileName" in payload &&
    payload.defaultFileName !== undefined &&
    typeof payload.defaultFileName !== "string"
  ) {
    return null;
  }

  const defaultFileName =
    typeof payload.defaultFileName === "string"
      ? payload.defaultFileName
      : undefined;

  return {
    content: payload.content,
    format: payload.format,
    defaultFileName,
  };
};

export const safeExportBaseName = (
  defaultFileName: string | undefined
): string => {
  const rawName = defaultFileName || "Exported";
  const lastSegment = rawName.split(/[\\/]/).pop() ?? "";
  const withoutExtension = lastSegment.replace(/\.(?:html|pdf)$/i, "").trim();
  const reservedCharacters = '<>:"|?*';
  const sanitized = [...withoutExtension]
    .map((char) =>
      char.charCodeAt(0) < 32 || reservedCharacters.includes(char) ? "-" : char
    )
    .join("");
  return sanitized || "Exported";
};
