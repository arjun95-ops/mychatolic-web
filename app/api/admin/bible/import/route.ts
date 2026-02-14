import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";
import {
  getDeprecatedBibleWorkspaceTarget,
  getErrorCode,
  getErrorMessage,
  isDeprecatedBibleWorkspace,
  isValidGrouping,
  isValidLanguageCode,
  isValidVersionCode,
  normalizeBookLookupKey,
  parseBibleScopeFromBody,
  parsePositiveInt,
  sanitizeText,
} from "@/lib/bible-admin";
import {
  ensureLegacyBookIdForBook,
  insertBookWithGeneratedLegacyId,
  parseLegacyBookId,
} from "@/lib/bible-legacy";

type ParsedImportRow = {
  rowNumber: number;
  bookKey: string;
  bookName: string;
  abbreviation: string | null;
  grouping: "old" | "new" | "deutero";
  orderIndex: number | null;
  chapterNumber: number;
  verseNumber: number;
  text: string;
  pericope: string | null;
};

type BookMapValue = {
  id: string;
  name: string;
  abbreviation: string | null;
  grouping: "old" | "new" | "deutero";
  order_index: number;
  legacy_book_id: number | null;
};

const CHUNK_SIZE = 500;
const FETCH_STEP = 1000;

function chunkArray<T>(items: T[], size: number): T[][];
function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchAllChaptersByBookIds(
  adminClient: SupabaseClient,
  bookIds: string[],
): Promise<Array<{ id: string; book_id: string; chapter_number: number }>> {
  if (bookIds.length === 0) return [];

  const rows: Array<{ id: string; book_id: string; chapter_number: number }> = [];
  let from = 0;

  while (true) {
    const to = from + FETCH_STEP - 1;
    const { data, error } = await adminClient
      .from("bible_chapters")
      .select("id, book_id, chapter_number")
      .in("book_id", bookIds)
      .order("book_id", { ascending: true })
      .order("chapter_number", { ascending: true })
      .range(from, to);

    if (error) throw new Error(getErrorMessage(error));

    const chunk = (data || []) as Array<{ id: string; book_id: string; chapter_number: number }>;
    rows.push(...chunk);
    if (chunk.length < FETCH_STEP) break;
    from += FETCH_STEP;
  }

  return rows;
}

function mapGroupingFromImport(value: string): "old" | "new" | "deutero" | null {
  const normalized = sanitizeText(value).toLowerCase();
  if (!normalized) return "old";
  if (isValidGrouping(normalized)) return normalized;
  if (["perjanjian lama", "pl", "old testament"].includes(normalized)) return "old";
  if (["perjanjian baru", "pb", "new testament"].includes(normalized)) return "new";
  if (
    ["deuterokanonika", "deuterocanon", "deuterocanonical", "deuterokanonik"].includes(normalized)
  ) {
    return "deutero";
  }
  return null;
}

function buildSimpleAbbreviation(bookName: string): string {
  const normalized = bookName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length >= 3) return `${words[0][0]}${words[1][0]}${words[2][0]}`.toUpperCase();
  if (words.length === 2) return `${words[0].slice(0, 1)}${words[1].slice(0, 2)}`.toUpperCase();
  return (words[0] || "BOK").slice(0, 3).toUpperCase();
}

function isUnknownColumnError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    getErrorCode(error) === "42703" ||
    message.includes("could not find the") ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

function parseImportRows(rowsInput: unknown[]): { parsed: ParsedImportRow[]; errors: string[] } {
  const parsed: ParsedImportRow[] = [];
  const errors: string[] = [];

  for (const item of rowsInput) {
    if (!item || typeof item !== "object") continue;
    const rowNumber = Number((item as { rowNumber?: unknown }).rowNumber);
    const dataRaw = (item as { data?: unknown }).data;
    if (!Number.isFinite(rowNumber) || rowNumber <= 0) continue;
    if (!dataRaw || typeof dataRaw !== "object" || Array.isArray(dataRaw)) continue;

    const data = dataRaw as Record<string, unknown>;
    const bookName = sanitizeText(data.book_name || data.book || data.kitab || data.nama_kitab);
    const chapterNumber = parsePositiveInt(data.chapter || data.chapter_number || data.pasal);
    const verseNumber = parsePositiveInt(data.verse || data.verse_number || data.ayat);
    const text = sanitizeText(data.text || data.verse_text || data.ayat_text || data.isi);
    const groupingInput = sanitizeText(
      data.grouping || data.group || data.kelompok || data.category || data.kategori,
    );
    const grouping = mapGroupingFromImport(groupingInput);
    const orderIndex = parsePositiveInt(data.order_index || data.order || data.urutan);
    const pericopeRaw = sanitizeText(data.pericope || data.perikop || data.subtitle);
    const abbreviationRaw = sanitizeText(data.abbreviation || data.abbr || data.singkatan);

    if (!bookName) {
      errors.push(`Baris ${rowNumber}: kolom book_name wajib diisi.`);
      continue;
    }
    if (!chapterNumber) {
      errors.push(`Baris ${rowNumber}: kolom chapter harus angka bulat positif.`);
      continue;
    }
    if (!verseNumber) {
      errors.push(`Baris ${rowNumber}: kolom verse harus angka bulat positif.`);
      continue;
    }
    if (!text) {
      errors.push(`Baris ${rowNumber}: kolom text wajib diisi.`);
      continue;
    }
    if (!grouping) {
      errors.push(`Baris ${rowNumber}: grouping hanya boleh old/new/deutero.`);
      continue;
    }

    const bookKey = normalizeBookLookupKey(bookName);
    if (!bookKey) {
      errors.push(`Baris ${rowNumber}: nama kitab tidak valid.`);
      continue;
    }

    parsed.push({
      rowNumber,
      bookKey,
      bookName,
      abbreviation: abbreviationRaw || null,
      grouping,
      orderIndex,
      chapterNumber,
      verseNumber,
      text,
      pericope: pericopeRaw || null,
    });
  }

  return { parsed, errors };
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
  const rowsInput = Array.isArray((body as { rows?: unknown })?.rows)
    ? ((body as { rows: unknown[] }).rows as unknown[])
    : [];

  if (!isValidLanguageCode(languageCode) || !isValidVersionCode(versionCode)) {
    return NextResponse.json(
      {
        error: "ValidationError",
        message: "language_code/version_code tidak valid.",
      },
      { status: 400 },
    );
  }
  if (rowsInput.length === 0) {
    return NextResponse.json(
      {
        error: "ValidationError",
        message: "rows wajib diisi minimal 1 item.",
      },
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

  const parsedResult = parseImportRows(rowsInput);
  if (parsedResult.errors.length > 0) {
    return NextResponse.json(
      {
        error: "ImportValidationFailed",
        message: "Import dibatalkan karena ada baris tidak valid.",
        successCount: 0,
        failedRows: parsedResult.errors,
      },
      { status: 400 },
    );
  }
  if (parsedResult.parsed.length === 0) {
    return NextResponse.json(
      {
        error: "ValidationError",
        message: "Tidak ada baris valid untuk diproses.",
      },
      { status: 400 },
    );
  }

  const { data: existingBooks, error: existingBooksError } = await adminClient
    .from("bible_books")
    .select("id, name, abbreviation, grouping, order_index, legacy_book_id")
    .eq("language_code", languageCode)
    .eq("version_code", versionCode)
    .order("order_index", { ascending: true });

  if (existingBooksError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(existingBooksError) },
      { status: 500 },
    );
  }

  const bookMap = new Map<string, BookMapValue>();
  let maxOrderIndex = 0;
  for (const row of existingBooks || []) {
    const id = String((row as { id?: unknown }).id || "");
    const name = sanitizeText((row as { name?: unknown }).name);
    const key = normalizeBookLookupKey(name);
    if (!id || !key) continue;
    const orderIndex = Number((row as { order_index?: unknown }).order_index || 0);
    if (orderIndex > maxOrderIndex) maxOrderIndex = orderIndex;
    const groupingRaw = sanitizeText((row as { grouping?: unknown }).grouping).toLowerCase();
    const grouping = isValidGrouping(groupingRaw) ? groupingRaw : "old";
    let legacyBookId = parseLegacyBookId((row as { legacy_book_id?: unknown }).legacy_book_id) || 0;
    if (!legacyBookId) {
      try {
        legacyBookId = await ensureLegacyBookIdForBook(
          adminClient,
          id,
          (row as { legacy_book_id?: unknown }).legacy_book_id,
          orderIndex,
        );
      } catch (errorValue: unknown) {
        const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
        return NextResponse.json(
          {
            error: "DatabaseError",
            message: `Gagal backfill legacy_book_id: ${message}`,
          },
          { status: 500 },
        );
      }
    }
    bookMap.set(key, {
      id,
      name,
      abbreviation: sanitizeText((row as { abbreviation?: unknown }).abbreviation) || null,
      grouping,
      order_index: orderIndex,
      legacy_book_id: legacyBookId,
    });
  }

  type NewBookDraft = {
    key: string;
    name: string;
    abbreviation: string | null;
    grouping: "old" | "new" | "deutero";
    order_index: number;
  };

  const newBookDrafts: NewBookDraft[] = [];
  const draftByKey = new Map<string, NewBookDraft>();

  for (const row of parsedResult.parsed) {
    if (bookMap.has(row.bookKey) || draftByKey.has(row.bookKey)) continue;
    const orderIndex =
      row.orderIndex && row.orderIndex > 0 ? row.orderIndex : Math.max(maxOrderIndex + 1, 1);
    if (orderIndex > maxOrderIndex) maxOrderIndex = orderIndex;

    const draft: NewBookDraft = {
      key: row.bookKey,
      name: row.bookName,
      abbreviation: row.abbreviation || buildSimpleAbbreviation(row.bookName),
      grouping: row.grouping,
      order_index: orderIndex,
    };
    draftByKey.set(row.bookKey, draft);
    newBookDrafts.push(draft);
  }

  let createdBooksCount = 0;
  if (newBookDrafts.length > 0) {
    type InsertedBookRow = {
      id: string;
      name: string;
      abbreviation: string | null;
      grouping: string;
      order_index: number;
      legacy_book_id: string | null;
    };

    const insertedBooks: Array<{
      id: string;
      name: string;
      abbreviation: string | null;
      grouping: string;
      order_index: number;
      legacy_book_id: string | null;
    }> = [];

    for (const item of newBookDrafts) {
      try {
        const inserted = await insertBookWithGeneratedLegacyId<InsertedBookRow>(
          adminClient,
          (legacyBookId) =>
            adminClient
              .from("bible_books")
              .insert({
                language_code: languageCode,
                version_code: versionCode,
                name: item.name,
                abbreviation: item.abbreviation,
                grouping: item.grouping,
                order_index: item.order_index,
                legacy_book_id: legacyBookId,
              })
              .select("id, name, abbreviation, grouping, order_index, legacy_book_id")
              .maybeSingle(),
          item.order_index,
        );
        insertedBooks.push({
          id: String(inserted.id || ""),
          name: String(inserted.name || ""),
          abbreviation: sanitizeText(inserted.abbreviation) || null,
          grouping: String(inserted.grouping || ""),
          order_index: Number(inserted.order_index || 0),
          legacy_book_id: sanitizeText(inserted.legacy_book_id) || null,
        });
      } catch (errorValue: unknown) {
        const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
        return NextResponse.json(
          {
            error: "DatabaseError",
            message: `Gagal membuat kitab baru: ${message}`,
          },
          { status: 500 },
        );
      }
    }

    createdBooksCount = insertedBooks.length;
    for (const row of insertedBooks || []) {
      const id = String(row.id || "");
      const name = sanitizeText(row.name);
      const key = normalizeBookLookupKey(name);
      if (!id || !key) continue;
      const groupingRaw = sanitizeText(row.grouping).toLowerCase();
      const grouping = isValidGrouping(groupingRaw) ? groupingRaw : "old";
      bookMap.set(key, {
        id,
        name,
        abbreviation: sanitizeText(row.abbreviation) || null,
        grouping,
        order_index: Number(row.order_index || 0),
        legacy_book_id: parseLegacyBookId(row.legacy_book_id),
      });
    }
  }

  const missingBookErrors: string[] = [];
  for (const row of parsedResult.parsed) {
    if (!bookMap.has(row.bookKey)) {
      missingBookErrors.push(
        `Baris ${row.rowNumber}: kitab "${row.bookName}" gagal di-resolve/create.`,
      );
    }
  }
  if (missingBookErrors.length > 0) {
    return NextResponse.json(
      {
        error: "ImportFailed",
        message: "Sebagian kitab gagal di-resolve/create.",
        successCount: 0,
        failedRows: missingBookErrors,
      },
      { status: 500 },
    );
  }

  const involvedBookIds = Array.from(
    new Set(
      parsedResult.parsed
        .map((row) => bookMap.get(row.bookKey)?.id || "")
        .filter(Boolean),
    ),
  );

  let existingChapters = await fetchAllChaptersByBookIds(adminClient, involvedBookIds);
  const existingChapterSet = new Set(
    existingChapters.map((row) => `${row.book_id}::${row.chapter_number}`),
  );

  const chapterPayload: Array<{ book_id: string; chapter_number: number }> = [];
  for (const row of parsedResult.parsed) {
    const bookId = bookMap.get(row.bookKey)?.id || "";
    if (!bookId) continue;
    const key = `${bookId}::${row.chapterNumber}`;
    if (existingChapterSet.has(key)) continue;
    existingChapterSet.add(key);
    chapterPayload.push({ book_id: bookId, chapter_number: row.chapterNumber });
  }

  let createdChaptersCount = 0;
  if (chapterPayload.length > 0) {
    const { error: chapterInsertError } = await adminClient
      .from("bible_chapters")
      .upsert(chapterPayload, { onConflict: "book_id,chapter_number", ignoreDuplicates: true });

    if (chapterInsertError) {
      return NextResponse.json(
        {
          error: "DatabaseError",
          message: `Gagal membuat pasal: ${getErrorMessage(chapterInsertError)}`,
        },
        { status: 500 },
      );
    }
    createdChaptersCount = chapterPayload.length;
    existingChapters = await fetchAllChaptersByBookIds(adminClient, involvedBookIds);
  }

  const chapterIdMap = new Map<string, string>();
  for (const chapter of existingChapters) {
    chapterIdMap.set(`${chapter.book_id}::${chapter.chapter_number}`, chapter.id);
  }

  const unresolvedChapterRows: string[] = [];
  const verseRows: Array<{
    rowNumber: number;
    chapter_id: string;
    chapter_number: number;
    legacy_book_id: number | null;
    verse_number: number;
    text: string;
    pericope: string | null;
  }> = [];

  for (const row of parsedResult.parsed) {
    const bookData = bookMap.get(row.bookKey);
    const bookId = bookData?.id || "";
    const chapterId = chapterIdMap.get(`${bookId}::${row.chapterNumber}`) || "";
    if (!chapterId) {
      unresolvedChapterRows.push(
        `Baris ${row.rowNumber}: gagal resolve chapter untuk kitab "${row.bookName}" pasal ${row.chapterNumber}.`,
      );
      continue;
    }
    verseRows.push({
      rowNumber: row.rowNumber,
      chapter_id: chapterId,
      chapter_number: row.chapterNumber,
      legacy_book_id: bookData?.legacy_book_id || null,
      verse_number: row.verseNumber,
      text: row.text,
      pericope: row.pericope,
    });
  }

  if (unresolvedChapterRows.length > 0) {
    return NextResponse.json(
      {
        error: "ImportFailed",
        message: "Sebagian pasal gagal di-resolve/create.",
        successCount: 0,
        failedRows: unresolvedChapterRows,
      },
      { status: 500 },
    );
  }

  let successCount = 0;
  const failedRows: string[] = [];

  for (const batch of chunkArray(verseRows, CHUNK_SIZE)) {
    const payload = batch.map((row) => ({
      chapter_id: row.chapter_id,
      verse_number: row.verse_number,
      text: row.text,
      pericope: row.pericope,
      ...(row.legacy_book_id
        ? {
            book_id: row.legacy_book_id,
            chapter: row.chapter_number,
            content: row.text,
            type: "text",
          }
        : {}),
    }));

    let bulkRes = await adminClient
      .from("bible_verses")
      .upsert(payload, { onConflict: "chapter_id,verse_number" });

    if (bulkRes.error && isUnknownColumnError(bulkRes.error)) {
      bulkRes = await adminClient.from("bible_verses").upsert(
        batch.map((row) => ({
          chapter_id: row.chapter_id,
          verse_number: row.verse_number,
          text: row.text,
          pericope: row.pericope,
        })),
        { onConflict: "chapter_id,verse_number" },
      );
    }

    if (!bulkRes.error) {
      successCount += batch.length;
      continue;
    }

    for (const row of batch) {
      let rowRes = await adminClient
        .from("bible_verses")
        .upsert(
          {
            chapter_id: row.chapter_id,
            verse_number: row.verse_number,
            text: row.text,
            pericope: row.pericope,
            ...(row.legacy_book_id
              ? {
                  book_id: row.legacy_book_id,
                  chapter: row.chapter_number,
                  content: row.text,
                  type: "text",
                }
              : {}),
          },
          { onConflict: "chapter_id,verse_number" },
        );

      if (rowRes.error && isUnknownColumnError(rowRes.error)) {
        rowRes = await adminClient
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
      }

      if (rowRes.error) {
        failedRows.push(`Baris ${row.rowNumber}: ${getErrorMessage(rowRes.error)}`);
      } else {
        successCount += 1;
      }
    }
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "IMPORT_BIBLE_VERSES_BATCH",
    tableName: "bible_verses",
    recordId: `${languageCode}:${versionCode}`,
    oldData: null,
    newData: {
      language_code: languageCode,
      version_code: versionCode,
      total_rows: parsedResult.parsed.length,
      success_count: successCount,
      failed_count: failedRows.length,
      created_books: createdBooksCount,
      created_chapters: createdChaptersCount,
    },
    request: req,
  });

  const statusCode = failedRows.length > 0 ? 207 : 200;
  const res = NextResponse.json(
    {
      success: failedRows.length === 0,
      message:
        failedRows.length === 0
          ? "Import selesai."
          : "Import selesai dengan beberapa baris gagal.",
      successCount,
      failedRows,
      createdBooks: createdBooksCount,
      createdChapters: createdChaptersCount,
      totalRows: parsedResult.parsed.length,
    },
    { status: statusCode },
  );
  setCookiesToResponse(res);
  return res;
}
