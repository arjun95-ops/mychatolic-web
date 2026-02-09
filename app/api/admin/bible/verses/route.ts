import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";
import {
  getErrorCode,
  getErrorMessage,
  isUuid,
  isValidLanguageCode,
  isValidVersionCode,
  parseBibleScopeFromBody,
  parseBibleScopeFromSearchParams,
  parsePositiveInt,
  sanitizeText,
} from "@/lib/bible-admin";

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
    .select("id")
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

  const chapterResolution = await resolveChapterId(adminClient, bookId, chapterNumber);
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

  const payload = {
    chapter_id: chapterId,
    verse_number: verseNumber,
    text,
    pericope,
  };

  const { data: upserted, error: upsertError } = await adminClient
    .from("bible_verses")
    .upsert(payload, { onConflict: "chapter_id,verse_number" })
    .select("id, chapter_id, verse_number, text, pericope")
    .maybeSingle();

  if (upsertError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(upsertError) },
      { status: 500 },
    );
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: oldVerse ? "UPDATE_BIBLE_VERSE" : "CREATE_BIBLE_VERSE",
    tableName: "bible_verses",
    recordId: String((upserted as { id?: unknown })?.id || ""),
    oldData: oldVerse ? (oldVerse as unknown as Record<string, unknown>) : null,
    newData: (upserted || payload) as unknown as Record<string, unknown>,
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
    data: upserted,
    chapter_created: chapterResolution.created,
  });
  setCookiesToResponse(res);
  return res;
}
