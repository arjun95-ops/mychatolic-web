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
  parseBibleScopeFromSearchParams,
  parsePositiveInt,
  sanitizeText,
} from "@/lib/bible-admin";
import { ensureLegacyBookIdForBook } from "@/lib/bible-legacy";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 200;

type VerseRow = {
  id: string;
  chapter_id: string;
  verse_number: number;
  text: string;
  pericope: string | null;
};

type ScopedBookRow = {
  id: string;
  legacy_book_id: string | null;
  order_index: number | null;
};

function toSafePage(value: string | null): number {
  const parsed = Number(value || "1");
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.floor(parsed);
}

function toSafeLimit(value: string | null): number {
  const parsed = Number(value || String(DEFAULT_LIMIT));
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function isUnknownColumnError(error: unknown): boolean {
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();
  return (
    code === "42703" ||
    message.includes("could not find the") ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

async function resolveChapterId(
  adminClient: SupabaseClient,
  bookId: string,
  chapterNumber: number,
): Promise<{
  chapterId: string | null;
  created: boolean;
  error: unknown;
  validationMessage: string | null;
}> {
  const { data: chapter, error: chapterError } = await adminClient
    .from("bible_chapters")
    .select("id")
    .eq("book_id", bookId)
    .eq("chapter_number", chapterNumber)
    .maybeSingle();

  if (chapterError) {
    return { chapterId: null, created: false, error: chapterError, validationMessage: null };
  }
  if (chapter?.id) {
    return { chapterId: String(chapter.id), created: false, error: null, validationMessage: null };
  }

  if (chapterNumber > 1) {
    const { data: previousChapter, error: previousChapterError } = await adminClient
      .from("bible_chapters")
      .select("id")
      .eq("book_id", bookId)
      .eq("chapter_number", chapterNumber - 1)
      .maybeSingle();

    if (previousChapterError) {
      return {
        chapterId: null,
        created: false,
        error: previousChapterError,
        validationMessage: null,
      };
    }

    if (!previousChapter?.id) {
      return {
        chapterId: null,
        created: false,
        error: null,
        validationMessage: `Pasal ${chapterNumber - 1} belum tersedia. Simpan pasal secara berurutan.`,
      };
    }
  }

  const { data: inserted, error: insertError } = await adminClient
    .from("bible_chapters")
    .insert({ book_id: bookId, chapter_number: chapterNumber })
    .select("id")
    .maybeSingle();

  if (!insertError && inserted?.id) {
    return { chapterId: String(inserted.id), created: true, error: null, validationMessage: null };
  }

  if (getErrorCode(insertError) === "23505") {
    const { data: retryRow, error: retryError } = await adminClient
      .from("bible_chapters")
      .select("id")
      .eq("book_id", bookId)
      .eq("chapter_number", chapterNumber)
      .maybeSingle();

    if (retryError) {
      return { chapterId: null, created: false, error: retryError, validationMessage: null };
    }
    if (retryRow?.id) {
      return { chapterId: String(retryRow.id), created: false, error: null, validationMessage: null };
    }
  }

  return { chapterId: null, created: false, error: insertError, validationMessage: null };
}

async function hasPreviousVerse(
  adminClient: SupabaseClient,
  chapterId: string,
  verseNumber: number,
): Promise<{ exists: boolean; error: unknown }> {
  const { data, error } = await adminClient
    .from("bible_verses")
    .select("verse_number")
    .eq("chapter_id", chapterId)
    .eq("verse_number", verseNumber - 1)
    .maybeSingle();

  if (error) return { exists: false, error };
  return { exists: Boolean(data), error: null };
}

async function ensureScopedBook(
  adminClient: SupabaseClient,
  bookId: string,
  languageCode: string,
  versionCode: string,
) {
  const { data, error } = await adminClient
    .from("bible_books")
    .select("id, legacy_book_id, order_index")
    .eq("id", bookId)
    .eq("language_code", languageCode)
    .eq("version_code", versionCode)
    .maybeSingle();
  return { data, error };
}

export async function GET(req: NextRequest) {
  const ctx = await requireApprovedAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { supabaseAdminClient: adminClient, setCookiesToResponse } = ctx;
  const url = new URL(req.url);

  const { languageCode, versionCode } = parseBibleScopeFromSearchParams(url.searchParams);
  const bookId = sanitizeText(url.searchParams.get("book_id"));
  const chapterNumber = parsePositiveInt(url.searchParams.get("chapter_number"));
  const search = sanitizeText(url.searchParams.get("q"));
  const page = toSafePage(url.searchParams.get("page"));
  const limit = toSafeLimit(url.searchParams.get("limit"));

  if (!isValidLanguageCode(languageCode) || !isValidVersionCode(versionCode) || !isUuid(bookId)) {
    return NextResponse.json(
      {
        error: "ValidationError",
        message: "language_code/version_code/book_id tidak valid.",
      },
      { status: 400 },
    );
  }
  if (!chapterNumber) {
    return NextResponse.json(
      {
        error: "ValidationError",
        message: "chapter_number harus angka bulat positif.",
      },
      { status: 400 },
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

  const { data: chapter, error: chapterError } = await adminClient
    .from("bible_chapters")
    .select("id")
    .eq("book_id", bookId)
    .eq("chapter_number", chapterNumber)
    .maybeSingle();

  if (chapterError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(chapterError) },
      { status: 500 },
    );
  }

  const chapterId = chapter?.id ? String(chapter.id) : null;
  if (!chapterId) {
    const emptyRes = NextResponse.json({
      success: true,
      chapter_id: null,
      chapter_exists: false,
      items: [] as VerseRow[],
      pagination: {
        page,
        limit,
        total: 0,
        total_pages: 1,
      },
    });
    setCookiesToResponse(emptyRes);
    return emptyRes;
  }

  let query = adminClient
    .from("bible_verses")
    .select("id, chapter_id, verse_number, text, pericope", { count: "exact" })
    .eq("chapter_id", chapterId)
    .order("verse_number", { ascending: true });

  if (search) {
    const escaped = search.replace(/,/g, "\\,");
    query = query.or(`text.ilike.%${escaped}%,pericope.ilike.%${escaped}%`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, error, count } = await query.range(from, to);

  if (error) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(error) },
      { status: 500 },
    );
  }

  const total = Number(count || 0);
  const res = NextResponse.json({
    success: true,
    chapter_id: chapterId,
    chapter_exists: true,
    items: (data || []) as VerseRow[],
    pagination: {
      page,
      limit,
      total,
      total_pages: total <= 0 ? 1 : Math.ceil(total / limit),
    },
  });
  setCookiesToResponse(res);
  return res;
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
  const verseNumber = parsePositiveInt((body as { verse_number?: unknown })?.verse_number);
  const text = sanitizeText((body as { text?: unknown })?.text);
  const pericopeRaw = sanitizeText((body as { pericope?: unknown })?.pericope);

  if (!isValidLanguageCode(languageCode) || !isValidVersionCode(versionCode) || !isUuid(bookId)) {
    return NextResponse.json(
      {
        error: "ValidationError",
        message: "language_code/version_code/book_id tidak valid.",
      },
      { status: 400 },
    );
  }
  if (!chapterNumber || !verseNumber) {
    return NextResponse.json(
      {
        error: "ValidationError",
        message: "chapter_number dan verse_number harus angka bulat positif.",
      },
      { status: 400 },
    );
  }
  if (!text) {
    return NextResponse.json(
      { error: "ValidationError", message: "Teks ayat wajib diisi." },
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
      Number(scopedBookRow.order_index) || null,
    );
  } catch (errorValue: unknown) {
    const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
    return NextResponse.json(
      { error: "DatabaseError", message: `Gagal menyiapkan legacy_book_id: ${message}` },
      { status: 500 },
    );
  }

  const chapterResolution = await resolveChapterId(adminClient, bookId, chapterNumber);
  if (chapterResolution.validationMessage) {
    return NextResponse.json(
      { error: "ValidationError", message: chapterResolution.validationMessage },
      { status: 400 },
    );
  }
  if (chapterResolution.error || !chapterResolution.chapterId) {
    return NextResponse.json(
      {
        error: "DatabaseError",
        message: getErrorMessage(chapterResolution.error),
      },
      { status: 500 },
    );
  }

  const chapterId = chapterResolution.chapterId;
  const pericope = pericopeRaw || null;

  const { data: oldVerse, error: oldVerseError } = await adminClient
    .from("bible_verses")
    .select("id, chapter_id, verse_number, text, pericope")
    .eq("chapter_id", chapterId)
    .eq("verse_number", verseNumber)
    .maybeSingle();

  if (oldVerseError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(oldVerseError) },
      { status: 500 },
    );
  }

  if (!oldVerse && verseNumber > 1) {
    const previousVerseCheck = await hasPreviousVerse(adminClient, chapterId, verseNumber);
    if (previousVerseCheck.error) {
      return NextResponse.json(
        { error: "DatabaseError", message: getErrorMessage(previousVerseCheck.error) },
        { status: 500 },
      );
    }
    if (!previousVerseCheck.exists) {
      return NextResponse.json(
        {
          error: "ValidationError",
          message: `Ayat ${verseNumber - 1} belum tersedia. Simpan ayat secara berurutan.`,
        },
        { status: 400 },
      );
    }
  }

  const payload = {
    chapter_id: chapterId,
    verse_number: verseNumber,
    text,
    pericope,
    ...(legacyBookId
      ? {
          book_id: legacyBookId,
          chapter: chapterNumber,
          content: text,
          type: "text",
        }
      : {}),
  };

  let upsertResult = await adminClient
    .from("bible_verses")
    .upsert(payload, { onConflict: "chapter_id,verse_number" })
    .select("id, chapter_id, verse_number, text, pericope")
    .maybeSingle();

  if (upsertResult.error && isUnknownColumnError(upsertResult.error)) {
    upsertResult = await adminClient
      .from("bible_verses")
      .upsert(
        {
          chapter_id: chapterId,
          verse_number: verseNumber,
          text,
          pericope,
        },
        { onConflict: "chapter_id,verse_number" },
      )
      .select("id, chapter_id, verse_number, text, pericope")
      .maybeSingle();
  }

  if (upsertResult.error) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(upsertResult.error) },
      { status: 500 },
    );
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: oldVerse ? "UPDATE_BIBLE_VERSE" : "CREATE_BIBLE_VERSE",
    tableName: "bible_verses",
    recordId: String((upsertResult.data as { id?: unknown })?.id || ""),
    oldData: oldVerse ? (oldVerse as unknown as Record<string, unknown>) : null,
    newData: (upsertResult.data || payload) as unknown as Record<string, unknown>,
    request: req,
    extra: {
      language_code: languageCode,
      version_code: versionCode,
      chapter_created: chapterResolution.created,
      book_id: bookId,
      chapter_number: chapterNumber,
    },
  });

  const res = NextResponse.json({
    success: true,
    message: oldVerse ? "Ayat berhasil diperbarui." : "Ayat berhasil ditambahkan.",
    data: upsertResult.data,
    chapter_created: chapterResolution.created,
  });
  setCookiesToResponse(res);
  return res;
}
