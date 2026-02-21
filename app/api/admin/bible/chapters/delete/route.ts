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
  const force = Boolean((body as { force?: unknown })?.force);

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
      { error: "ValidationError", message: "chapter_number harus angka bulat positif." },
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

  const { data: book, error: bookError } = await ensureScopedBook(
    adminClient,
    bookId,
    languageCode,
    versionCode,
  );
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
    .select("id, chapter_number")
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
      { error: "NotFound", message: "Bab tidak ditemukan." },
      { status: 404 },
    );
  }

  const chapterId = String(chapter.id);

  const { count: verseCount, error: verseCountError } = await adminClient
    .from("bible_verses")
    .select("id", { count: "exact", head: true })
    .eq("chapter_id", chapterId);

  if (verseCountError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(verseCountError) },
      { status: 500 },
    );
  }

  const totalVerses = Number(verseCount || 0);
  if (totalVerses > 0 && !force) {
    return NextResponse.json(
      {
        error: "Conflict",
        message: `Bab masih berisi ${totalVerses} ayat. Kirim force=true untuk menghapus beserta ayatnya.`,
        existing_verses: totalVerses,
        allow_force: true,
      },
      { status: 409 },
    );
  }

  if (totalVerses > 0) {
    const { error: deleteVersesError } = await adminClient
      .from("bible_verses")
      .delete()
      .eq("chapter_id", chapterId);
    if (deleteVersesError) {
      return NextResponse.json(
        { error: "DatabaseError", message: getErrorMessage(deleteVersesError) },
        { status: 500 },
      );
    }
  }

  const { error: deleteChapterError } = await adminClient
    .from("bible_chapters")
    .delete()
    .eq("id", chapterId);

  if (deleteChapterError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(deleteChapterError) },
      { status: 500 },
    );
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "DELETE_BIBLE_CHAPTER",
    tableName: "bible_chapters",
    recordId: chapterId,
    oldData: chapter as unknown as Record<string, unknown>,
    newData: null,
    request: req,
    extra: {
      language_code: languageCode,
      version_code: versionCode,
      book_id: bookId,
      chapter_number: chapterNumber,
      deleted_verses: totalVerses,
      force,
    },
  });

  const res = NextResponse.json({
    success: true,
    message:
      totalVerses > 0
        ? `Bab ${chapterNumber} berhasil dihapus beserta ${totalVerses} ayat.`
        : `Bab ${chapterNumber} berhasil dihapus.`,
    deleted_verses: totalVerses,
  });
  setCookiesToResponse(res);
  return res;
}
