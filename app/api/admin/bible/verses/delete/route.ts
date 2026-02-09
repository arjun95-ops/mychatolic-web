import { NextRequest, NextResponse } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";
import {
  getErrorMessage,
  isUuid,
  isValidLanguageCode,
  isValidVersionCode,
  parseBibleScopeFromBody,
  parsePositiveInt,
  sanitizeText,
} from "@/lib/bible-admin";

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

  const { data: book, error: bookError } = await adminClient
    .from("bible_books")
    .select("id")
    .eq("id", bookId)
    .eq("language_code", languageCode)
    .eq("version_code", versionCode)
    .maybeSingle();

  if (bookError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(bookError) },
      { status: 500 },
    );
  }
  if (!book) {
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
  const { data: verse, error: verseError } = await adminClient
    .from("bible_verses")
    .select("id, chapter_id, verse_number, text, pericope")
    .eq("chapter_id", chapterId)
    .eq("verse_number", verseNumber)
    .maybeSingle();

  if (verseError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(verseError) },
      { status: 500 },
    );
  }
  if (!verse) {
    return NextResponse.json(
      { error: "NotFound", message: "Ayat tidak ditemukan." },
      { status: 404 },
    );
  }

  const { error: deleteError } = await adminClient
    .from("bible_verses")
    .delete()
    .eq("chapter_id", chapterId)
    .eq("verse_number", verseNumber);

  if (deleteError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(deleteError) },
      { status: 500 },
    );
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "DELETE_BIBLE_VERSE",
    tableName: "bible_verses",
    recordId: String((verse as { id?: unknown }).id || ""),
    oldData: verse as unknown as Record<string, unknown>,
    newData: null,
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
    message: "Ayat berhasil dihapus.",
  });
  setCookiesToResponse(res);
  return res;
}
