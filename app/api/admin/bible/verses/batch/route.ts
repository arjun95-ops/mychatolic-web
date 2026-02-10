import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";
import {
  getDeprecatedBibleWorkspaceTarget,
  getErrorCode,
  getErrorMessage,
  isDeprecatedBibleWorkspace,
  isUuid,
  isValidLanguageCode,
  isValidVersionCode,
  parseBibleScopeFromBody,
  parsePositiveInt,
  sanitizeText,
} from "@/lib/bible-admin";
import { ensureLegacyBookIdForBook } from "@/lib/bible-legacy";

export const dynamic = "force-dynamic";

type ExistingVerseRow = {
  verse_number: number;
  pericope: string | null;
};

type UpsertRow = {
  chapter_id: string;
  verse_number: number;
  text: string;
  pericope: string | null;
  book_id?: number;
  chapter?: number;
  content?: string;
  type?: string;
};

type ScopedBookRow = {
  id: string;
  legacy_book_id: string | null;
};

const CHUNK_SIZE = 300;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function isUnknownColumnError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    getErrorCode(error) === "42703" ||
    message.includes("could not find the") ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

async function resolveChapterId(
  adminClient: SupabaseClient,
  bookId: string,
  chapterNumber: number,
): Promise<{ chapterId: string | null; created: boolean; error: unknown }> {
  const { data: chapter, error: chapterError } = await adminClient
    .from("bible_chapters")
    .select("id")
    .eq("book_id", bookId)
    .eq("chapter_number", chapterNumber)
    .maybeSingle();

  if (chapterError) return { chapterId: null, created: false, error: chapterError };
  if (chapter?.id) return { chapterId: String(chapter.id), created: false, error: null };

  const { data: inserted, error: insertError } = await adminClient
    .from("bible_chapters")
    .insert({ book_id: bookId, chapter_number: chapterNumber })
    .select("id")
    .maybeSingle();

  if (!insertError && inserted?.id) {
    return { chapterId: String(inserted.id), created: true, error: null };
  }

  if (getErrorCode(insertError) === "23505") {
    const { data: retryRow, error: retryError } = await adminClient
      .from("bible_chapters")
      .select("id")
      .eq("book_id", bookId)
      .eq("chapter_number", chapterNumber)
      .maybeSingle();

    if (retryError) return { chapterId: null, created: false, error: retryError };
    if (retryRow?.id) return { chapterId: String(retryRow.id), created: false, error: null };
  }

  return { chapterId: null, created: false, error: insertError };
}

async function ensureScopedBook(
  adminClient: SupabaseClient,
  bookId: string,
  languageCode: string,
  versionCode: string,
) {
  const { data, error } = await adminClient
    .from("bible_books")
    .select("id, legacy_book_id")
    .eq("id", bookId)
    .eq("language_code", languageCode)
    .eq("version_code", versionCode)
    .maybeSingle();
  return { data, error };
}

export async function POST(req: NextRequest) {
  const ctx = await requireApprovedAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const {
    user,
    supabaseAdminClient: adminClient,
    setCookiesToResponse,
  } = ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "BadRequest", message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const { languageCode, versionCode } = parseBibleScopeFromBody(body);
  const bookId = sanitizeText((body as { book_id?: unknown })?.book_id);
  const chapterNumber = parsePositiveInt((body as { chapter_number?: unknown })?.chapter_number);
  const startVerse = parsePositiveInt(
    (body as { start_verse?: unknown; startVerse?: unknown })?.start_verse ??
      (body as { start_verse?: unknown; startVerse?: unknown })?.startVerse,
  );
  const overwrite = Boolean(
    (body as { overwrite?: unknown; overwrite_existing?: unknown })?.overwrite ??
      (body as { overwrite?: unknown; overwrite_existing?: unknown })?.overwrite_existing,
  );
  const linesInput = Array.isArray((body as { lines?: unknown })?.lines)
    ? ((body as { lines: unknown[] }).lines as unknown[])
    : [];

  if (!isValidLanguageCode(languageCode) || !isValidVersionCode(versionCode) || !isUuid(bookId)) {
    return NextResponse.json(
      { error: "ValidationError", message: "language_code/version_code/book_id tidak valid." },
      { status: 400 },
    );
  }
  if (!chapterNumber || !startVerse) {
    return NextResponse.json(
      { error: "ValidationError", message: "chapter_number dan start_verse wajib angka positif." },
      { status: 400 },
    );
  }
  if (linesInput.length === 0) {
    return NextResponse.json(
      { error: "ValidationError", message: "lines wajib diisi minimal 1 item." },
      { status: 400 },
    );
  }
  if (isDeprecatedBibleWorkspace(languageCode, versionCode)) {
    const target = getDeprecatedBibleWorkspaceTarget(languageCode, versionCode);
    return NextResponse.json(
      {
        error: "DeprecatedWorkspace",
        message: `Workspace ${languageCode}/${versionCode} sudah deprecated (read-only). Gunakan ${target?.languageCode}/${target?.versionCode}.`,
      },
      { status: 409 },
    );
  }

  const scopedBook = await ensureScopedBook(adminClient, bookId, languageCode, versionCode);
  if (scopedBook.error) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(scopedBook.error) },
      { status: 500 },
    );
  }
  if (!scopedBook.data) {
    return NextResponse.json(
      { error: "NotFound", message: "Kitab tidak ditemukan pada bahasa+versi ini." },
      { status: 404 },
    );
  }

  const scopedBookRow = scopedBook.data as ScopedBookRow;
  let legacyBookId: number | null = null;
  try {
    legacyBookId = await ensureLegacyBookIdForBook(
      adminClient,
      scopedBookRow.id,
      scopedBookRow.legacy_book_id,
    );
  } catch (errorValue: unknown) {
    const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
    return NextResponse.json(
      { error: "DatabaseError", message: `Gagal menyiapkan legacy_book_id: ${message}` },
      { status: 500 },
    );
  }

  const normalizedLines = linesInput.map((line) => sanitizeText(line)).filter(Boolean);
  if (normalizedLines.length === 0) {
    return NextResponse.json(
      { error: "ValidationError", message: "Semua line kosong. Tidak ada data diproses." },
      { status: 400 },
    );
  }

  const chapterResolution = await resolveChapterId(adminClient, bookId, chapterNumber);
  if (chapterResolution.error || !chapterResolution.chapterId) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(chapterResolution.error) },
      { status: 500 },
    );
  }

  const chapterId = chapterResolution.chapterId;

  const mappedRows = normalizedLines.map((text, index) => ({
    verse_number: startVerse + index,
    text,
  }));
  const targetVerseNumbers = mappedRows.map((row) => row.verse_number);

  const { data: existingRows, error: existingError } = await adminClient
    .from("bible_verses")
    .select("verse_number, pericope")
    .eq("chapter_id", chapterId)
    .in("verse_number", targetVerseNumbers);

  if (existingError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(existingError) },
      { status: 500 },
    );
  }

  const existingMap = new Map<number, ExistingVerseRow>();
  for (const row of (existingRows || []) as ExistingVerseRow[]) {
    existingMap.set(Number(row.verse_number), row);
  }

  const skippedVerses = mappedRows
    .filter((row) => !overwrite && existingMap.has(row.verse_number))
    .map((row) => row.verse_number);

  const rowsToUpsert: UpsertRow[] = mappedRows
    .filter((row) => overwrite || !existingMap.has(row.verse_number))
    .map((row) => ({
      chapter_id: chapterId,
      verse_number: row.verse_number,
      text: row.text,
      pericope: existingMap.get(row.verse_number)?.pericope || null,
      ...(legacyBookId
        ? {
            book_id: legacyBookId,
            chapter: chapterNumber,
            content: row.text,
            type: "text",
          }
        : {}),
    }));

  let insertedOrUpdated = 0;
  const failedRows: string[] = [];

  for (const chunk of chunkArray(rowsToUpsert, CHUNK_SIZE)) {
    let upsertRes = await adminClient
      .from("bible_verses")
      .upsert(chunk, { onConflict: "chapter_id,verse_number" });

    if (upsertRes.error && isUnknownColumnError(upsertRes.error)) {
      const modernChunk = chunk.map((row) => ({
        chapter_id: row.chapter_id,
        verse_number: row.verse_number,
        text: row.text,
        pericope: row.pericope,
      }));
      upsertRes = await adminClient
        .from("bible_verses")
        .upsert(modernChunk, { onConflict: "chapter_id,verse_number" });
    }

    if (!upsertRes.error) {
      insertedOrUpdated += chunk.length;
      continue;
    }

    for (const row of chunk) {
      const { error: rowError } = await adminClient
        .from("bible_verses")
        .upsert(row, { onConflict: "chapter_id,verse_number" });
      if (rowError && isUnknownColumnError(rowError)) {
        const modernRes = await adminClient
          .from("bible_verses")
          .upsert(
            {
              chapter_id: row.chapter_id,
              verse_number: row.verse_number,
              text: row.text,
              pericope: row.pericope,
            },
            { onConflict: "chapter_id,verse_number" },
          );
        if (!modernRes.error) {
          insertedOrUpdated += 1;
          continue;
        }
        failedRows.push(`Ayat ${row.verse_number}: ${getErrorMessage(modernRes.error)}`);
        continue;
      }

      if (rowError) {
        failedRows.push(`Ayat ${row.verse_number}: ${getErrorMessage(rowError)}`);
      } else {
        insertedOrUpdated += 1;
      }
    }
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "UPSERT_BIBLE_VERSES_BATCH",
    tableName: "bible_verses",
    recordId: `${bookId}:${chapterNumber}`,
    oldData: null,
    newData: {
      language_code: languageCode,
      version_code: versionCode,
      book_id: bookId,
      chapter_number: chapterNumber,
      chapter_created: chapterResolution.created,
      start_verse: startVerse,
      total_mapped: mappedRows.length,
      inserted_or_updated: insertedOrUpdated,
      skipped_existing: skippedVerses.length,
      failed_count: failedRows.length,
      overwrite,
    },
    request: req,
  });

  const statusCode = failedRows.length > 0 ? 207 : 200;
  const res = NextResponse.json(
    {
      success: failedRows.length === 0,
      message:
        failedRows.length === 0
          ? "Batch ayat berhasil diproses."
          : "Batch ayat selesai dengan beberapa kegagalan.",
      chapter_id: chapterId,
      chapter_created: chapterResolution.created,
      total_mapped: mappedRows.length,
      inserted_or_updated: insertedOrUpdated,
      skipped_existing: skippedVerses.length,
      skipped_verses: skippedVerses,
      failed_count: failedRows.length,
      failed_rows: failedRows,
    },
    { status: statusCode },
  );
  setCookiesToResponse(res);
  return res;
}
