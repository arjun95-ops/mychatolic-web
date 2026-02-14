import type { SupabaseClient } from "@supabase/supabase-js";
import { getErrorCode, getErrorMessage, sanitizeText } from "@/lib/bible-admin";

const DEFAULT_RETRIES = 12;

export function parseLegacyBookId(value: unknown): number | null {
  const text = sanitizeText(value);
  if (!text || !/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function getNextLegacyBookId(adminClient: SupabaseClient): Promise<number> {
  const { data, error } = await adminClient.from("bible_books").select("legacy_book_id");
  if (error) throw new Error(getErrorMessage(error));

  let maxId = 0;
  for (const row of data || []) {
    const parsed = parseLegacyBookId((row as { legacy_book_id?: unknown }).legacy_book_id);
    if (parsed && parsed > maxId) maxId = parsed;
  }

  return Math.max(maxId + 1, 1);
}

async function readLegacyBookIdByBookId(
  adminClient: SupabaseClient,
  bookId: string,
): Promise<number | null> {
  const { data, error } = await adminClient
    .from("bible_books")
    .select("legacy_book_id")
    .eq("id", bookId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return parseLegacyBookId((data as { legacy_book_id?: unknown } | null)?.legacy_book_id);
}

export async function ensureLegacyBookIdForBook(
  adminClient: SupabaseClient,
  bookId: string,
  currentLegacyBookId: unknown,
  preferredLegacyBookId?: number | null,
  maxRetries = DEFAULT_RETRIES,
): Promise<number> {
  const existing = parseLegacyBookId(currentLegacyBookId);
  if (existing) return existing;

  let lastError = "Unknown error";

  const preferred = parseLegacyBookId(preferredLegacyBookId);
  if (preferred) {
    const updateResult = await adminClient
      .from("bible_books")
      .update({ legacy_book_id: String(preferred) })
      .eq("id", bookId)
      .is("legacy_book_id", null)
      .select("legacy_book_id")
      .maybeSingle();

    if (!updateResult.error) {
      const assigned = parseLegacyBookId(
        (updateResult.data as { legacy_book_id?: unknown } | null)?.legacy_book_id,
      );
      if (assigned) return assigned;

      const reread = await readLegacyBookIdByBookId(adminClient, bookId);
      if (reread) return reread;

      lastError = "legacy_book_id belum ter-set setelah update.";
    } else if (getErrorCode(updateResult.error) === "23505") {
      lastError = getErrorMessage(updateResult.error);
    } else {
      throw new Error(getErrorMessage(updateResult.error));
    }
  }

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const alreadySet = await readLegacyBookIdByBookId(adminClient, bookId);
    if (alreadySet) return alreadySet;

    const candidate = await getNextLegacyBookId(adminClient);
    const updateResult = await adminClient
      .from("bible_books")
      .update({ legacy_book_id: String(candidate) })
      .eq("id", bookId)
      .is("legacy_book_id", null)
      .select("legacy_book_id")
      .maybeSingle();

    if (!updateResult.error) {
      const assigned = parseLegacyBookId(
        (updateResult.data as { legacy_book_id?: unknown } | null)?.legacy_book_id,
      );
      if (assigned) return assigned;

      const reread = await readLegacyBookIdByBookId(adminClient, bookId);
      if (reread) return reread;
      lastError = "legacy_book_id belum ter-set setelah update.";
      continue;
    }

    if (getErrorCode(updateResult.error) === "23505") {
      lastError = getErrorMessage(updateResult.error);
      continue;
    }

    throw new Error(getErrorMessage(updateResult.error));
  }

  throw new Error(
    `Gagal claim legacy_book_id untuk book ${bookId} setelah ${maxRetries} percobaan. ${lastError}`,
  );
}

export async function insertBookWithGeneratedLegacyId<T>(
  adminClient: SupabaseClient,
  insertFn: (
    legacyBookId: string,
  ) => PromiseLike<{ data: T | null; error: unknown }> | { data: T | null; error: unknown },
  preferredLegacyBookId?: number | null,
  maxRetries = DEFAULT_RETRIES,
): Promise<T> {
  let lastError = "Unknown error";

  const preferred = parseLegacyBookId(preferredLegacyBookId);
  if (preferred) {
    const preferredResult = await insertFn(String(preferred));
    if (!preferredResult.error && preferredResult.data) return preferredResult.data;
    if (preferredResult.error && getErrorCode(preferredResult.error) !== "23505") {
      throw new Error(getErrorMessage(preferredResult.error));
    }
    lastError = preferredResult.error
      ? getErrorMessage(preferredResult.error)
      : "Insert tidak mengembalikan data.";
  }

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const candidate = await getNextLegacyBookId(adminClient);
    const result = await insertFn(String(candidate));

    if (!result.error && result.data) return result.data;
    if (!result.error && !result.data) {
      lastError = "Insert tidak mengembalikan data.";
      continue;
    }

    if (getErrorCode(result.error) === "23505") {
      lastError = getErrorMessage(result.error);
      continue;
    }

    throw new Error(getErrorMessage(result.error));
  }

  throw new Error(
    `Gagal insert kitab dengan legacy_book_id unik setelah ${maxRetries} percobaan. ${lastError}`,
  );
}
