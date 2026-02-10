import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";
import {
  getDeprecatedBibleWorkspaceTarget,
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

export const dynamic = "force-dynamic";

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

  if (!isValidLanguageCode(languageCode) || !isValidVersionCode(versionCode) || !isUuid(bookId)) {
    return NextResponse.json(
      { error: "ValidationError", message: "language_code/version_code/book_id tidak valid." },
      { status: 400 },
    );
  }
  if (!chapterNumber) {
    return NextResponse.json(
      { error: "ValidationError", message: "chapter_number harus angka bulat positif." },
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
      chapter_exists: false,
      items: [] as Array<{ verse_number: number; pericope: string }>,
    });
    setCookiesToResponse(emptyRes);
    return emptyRes;
  }

  const { data, error } = await adminClient
    .from("bible_verses")
    .select("verse_number, pericope")
    .eq("chapter_id", chapterId)
    .not("pericope", "is", null)
    .order("verse_number", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(error) },
      { status: 500 },
    );
  }

  const res = NextResponse.json({
    success: true,
    chapter_exists: true,
    items: (data || []).map((row) => ({
      verse_number: Number((row as { verse_number?: unknown }).verse_number || 0),
      pericope: String((row as { pericope?: unknown }).pericope || ""),
    })),
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
  const title = sanitizeText((body as { title?: unknown })?.title);
  const startVerse = parsePositiveInt(
    (body as { start_verse?: unknown; startVerse?: unknown })?.start_verse ??
      (body as { start_verse?: unknown; startVerse?: unknown })?.startVerse,
  );
  const endVerse = parsePositiveInt(
    (body as { end_verse?: unknown; endVerse?: unknown })?.end_verse ??
      (body as { end_verse?: unknown; endVerse?: unknown })?.endVerse,
  );

  if (!isValidLanguageCode(languageCode) || !isValidVersionCode(versionCode) || !isUuid(bookId)) {
    return NextResponse.json(
      { error: "ValidationError", message: "language_code/version_code/book_id tidak valid." },
      { status: 400 },
    );
  }
  if (!chapterNumber || !startVerse || !endVerse) {
    return NextResponse.json(
      {
        error: "ValidationError",
        message: "chapter_number/start_verse/end_verse harus angka bulat positif.",
      },
      { status: 400 },
    );
  }
  if (endVerse < startVerse) {
    return NextResponse.json(
      { error: "ValidationError", message: "end_verse tidak boleh lebih kecil dari start_verse." },
      { status: 400 },
    );
  }
  if (!title) {
    return NextResponse.json(
      { error: "ValidationError", message: "title perikop wajib diisi." },
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
  if (!chapter?.id) {
    return NextResponse.json(
      { error: "NotFound", message: "Pasal tidak ditemukan." },
      { status: 404 },
    );
  }

  const chapterId = String(chapter.id);

  const { data: startVerseRow, error: startVerseError } = await adminClient
    .from("bible_verses")
    .select("id, verse_number, pericope")
    .eq("chapter_id", chapterId)
    .eq("verse_number", startVerse)
    .maybeSingle();

  if (startVerseError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(startVerseError) },
      { status: 500 },
    );
  }
  if (!startVerseRow) {
    return NextResponse.json(
      {
        error: "ValidationError",
        message: `Ayat awal ${startVerse} tidak ditemukan. Simpan ayat terlebih dahulu.`,
      },
      { status: 400 },
    );
  }

  const { error: clearError } = await adminClient
    .from("bible_verses")
    .update({ pericope: null })
    .eq("chapter_id", chapterId)
    .gte("verse_number", startVerse)
    .lte("verse_number", endVerse);

  if (clearError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(clearError) },
      { status: 500 },
    );
  }

  const { error: setError } = await adminClient
    .from("bible_verses")
    .update({ pericope: title })
    .eq("chapter_id", chapterId)
    .eq("verse_number", startVerse);

  if (setError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(setError) },
      { status: 500 },
    );
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "SET_BIBLE_PERICOPE_RANGE",
    tableName: "bible_verses",
    recordId: `${chapterId}:${startVerse}`,
    oldData: startVerseRow as unknown as Record<string, unknown>,
    newData: {
      chapter_id: chapterId,
      start_verse: startVerse,
      end_verse: endVerse,
      pericope: title,
    } as Record<string, unknown>,
    request: req,
    extra: {
      language_code: languageCode,
      version_code: versionCode,
      book_id: bookId,
      chapter_number: chapterNumber,
    },
  });

  const res = NextResponse.json({
    success: true,
    message: "Perikop berhasil disimpan.",
  });
  setCookiesToResponse(res);
  return res;
}
