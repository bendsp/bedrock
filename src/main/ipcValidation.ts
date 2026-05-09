import { ExportFilePayload, SaveFilePayload } from "../shared/types";

export const MAX_MARKDOWN_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_EXPORT_HTML_BYTES = 25 * 1024 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const hasOwn = (value: Record<string, unknown>, key: string): boolean => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

type ValidationResult<T> =
  | { ok: true; payload: T }
  | { ok: false; message: string };

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
  const result = validateSaveFilePayload(payload);
  return result.ok ? result.payload : null;
};

export const validateSaveFilePayload = (
  payload: unknown
): ValidationResult<SaveFilePayload> => {
  if (!isRecord(payload)) {
    return { ok: false, message: "Invalid save payload." };
  }
  if (!hasReasonableContentSize(payload.content, MAX_MARKDOWN_FILE_BYTES)) {
    return {
      ok: false,
      message:
        typeof payload.content === "string"
          ? "Markdown content is too large to save."
          : "Save content must be text.",
    };
  }
  const hasFilePath = hasOwn(payload, "filePath");
  if (
    hasFilePath &&
    payload.filePath !== undefined &&
    (typeof payload.filePath !== "string" || payload.filePath.trim() === "")
  ) {
    return { ok: false, message: "Save file path must be a non-empty string." };
  }

  const filePath =
    hasFilePath && typeof payload.filePath === "string"
      ? payload.filePath
      : undefined;

  return {
    ok: true,
    payload: {
      content: payload.content,
      filePath,
    },
  };
};

export const normalizeExportFilePayload = (
  payload: unknown
): ExportFilePayload | null => {
  const result = validateExportFilePayload(payload);
  return result.ok ? result.payload : null;
};

export const validateExportFilePayload = (
  payload: unknown
): ValidationResult<ExportFilePayload> => {
  if (!isRecord(payload)) {
    return { ok: false, message: "Invalid export payload." };
  }
  if (payload.format !== "html" && payload.format !== "pdf") {
    return { ok: false, message: "Unsupported export format." };
  }
  if (!hasReasonableContentSize(payload.content, MAX_EXPORT_HTML_BYTES)) {
    return {
      ok: false,
      message:
        typeof payload.content === "string"
          ? "Export content is too large."
          : "Export content must be text.",
    };
  }
  const hasDefaultFileName = hasOwn(payload, "defaultFileName");
  if (
    hasDefaultFileName &&
    payload.defaultFileName !== undefined &&
    typeof payload.defaultFileName !== "string"
  ) {
    return {
      ok: false,
      message: "Export default filename must be a string.",
    };
  }

  const defaultFileName =
    hasDefaultFileName && typeof payload.defaultFileName === "string"
      ? payload.defaultFileName
      : undefined;

  return {
    ok: true,
    payload: {
      content: payload.content,
      format: payload.format,
      defaultFileName,
    },
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
    .join("")
    .replace(/[ .]+$/g, "");

  if (!sanitized) {
    return "Exported";
  }
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(sanitized)) {
    return `${sanitized}-file`;
  }
  return sanitized;
};
