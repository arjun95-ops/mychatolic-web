export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const BIBLE_GROUPINGS = ["old", "new", "deutero"] as const;
export type BibleGrouping = (typeof BIBLE_GROUPINGS)[number];

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  error?: unknown;
  error_description?: unknown;
};

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

export function sanitizeText(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeLanguageCode(value: unknown): string {
  return sanitizeText(value).toLowerCase();
}

export function normalizeVersionCode(value: unknown): string {
  return sanitizeText(value).toUpperCase();
}

export function parseBibleScopeFromSearchParams(searchParams: URLSearchParams): {
  languageCode: string;
  versionCode: string;
} {
  return {
    languageCode: normalizeLanguageCode(searchParams.get("lang")),
    versionCode: normalizeVersionCode(searchParams.get("version")),
  };
}

export function parseBibleScopeFromBody(body: unknown): {
  languageCode: string;
  versionCode: string;
} {
  const map = (body || {}) as {
    language_code?: unknown;
    version_code?: unknown;
    lang?: unknown;
    version?: unknown;
  };
  return {
    languageCode: normalizeLanguageCode(map.language_code ?? map.lang),
    versionCode: normalizeVersionCode(map.version_code ?? map.version),
  };
}

export function isValidLanguageCode(value: string): boolean {
  return /^[a-z]{2,8}$/.test(value);
}

export function isValidVersionCode(value: string): boolean {
  return /^[A-Z0-9_-]{2,16}$/.test(value);
}

export function isValidGrouping(value: string): value is BibleGrouping {
  return BIBLE_GROUPINGS.includes(value as BibleGrouping);
}

export function parsePositiveInt(value: unknown): number | null {
  const text = sanitizeText(value);
  if (!text) return null;
  const numberValue = Number(text);
  if (!Number.isInteger(numberValue) || numberValue <= 0) return null;
  return numberValue;
}

export function getErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const shaped = error as ErrorLike;
    const values = [
      shaped.message,
      shaped.details,
      shaped.hint,
      shaped.error,
      shaped.error_description,
    ];
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  try {
    const serialized = JSON.stringify(error);
    return serialized === "{}" ? "Unknown error" : serialized;
  } catch {
    return "Unknown error";
  }
}

export function getErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const code = (error as ErrorLike).code;
  return typeof code === "string" ? code : "";
}

export function isPermissionDenied(error: unknown): boolean {
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();
  return code === "42501" || message.includes("permission denied");
}

export function normalizeBookLookupKey(value: string): string {
  return sanitizeText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
