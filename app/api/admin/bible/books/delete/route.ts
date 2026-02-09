import { NextRequest, NextResponse } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";
import {
  getErrorMessage,
  isUuid,
  isValidLanguageCode,
  isValidVersionCode,
  normalizeLanguageCode,
  normalizeVersionCode,
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

  const id = sanitizeText((body as { id?: unknown })?.id);
  const languageCode = normalizeLanguageCode(
    (body as { language_code?: unknown; lang?: unknown })?.language_code ??
      (body as { lang?: unknown })?.lang,
  );
  const versionCode = normalizeVersionCode(
    (body as { version_code?: unknown; version?: unknown })?.version_code ??
      (body as { version?: unknown })?.version,
  );

  if (!isUuid(id)) {
    return NextResponse.json(
      {
        error: "ValidationError",
        message: "id wajib UUID valid.",
      },
      { status: 400 },
    );
  }
  if (!isValidLanguageCode(languageCode) || !isValidVersionCode(versionCode)) {
    return NextResponse.json(
      {
        error: "ValidationError",
        message: "language_code/version_code tidak valid.",
      },
      { status: 400 },
    );
  }

  const { data: existing, error: findError } = await adminClient
    .from("bible_books")
    .select("id, language_code, version_code, name, abbreviation, grouping, order_index")
    .eq("id", id)
    .eq("language_code", languageCode)
    .eq("version_code", versionCode)
    .maybeSingle();

  if (findError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(findError) },
      { status: 500 },
    );
  }
  if (!existing) {
    return NextResponse.json(
      { error: "NotFound", message: "Kitab tidak ditemukan." },
      { status: 404 },
    );
  }

  const { data: chapterRows, error: chapterError } = await adminClient
    .from("bible_chapters")
    .select("id")
    .eq("book_id", id);

  if (chapterError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(chapterError) },
      { status: 500 },
    );
  }

  const chapterIds = (chapterRows || [])
    .map((row) => String((row as { id?: unknown }).id || ""))
    .filter(Boolean);

  let deletedVerseCount = 0;
  if (chapterIds.length > 0) {
    const { count: verseCount, error: verseCountError } = await adminClient
      .from("bible_verses")
      .select("id", { count: "exact", head: true })
      .in("chapter_id", chapterIds);

    if (verseCountError) {
      return NextResponse.json(
        { error: "DatabaseError", message: getErrorMessage(verseCountError) },
        { status: 500 },
      );
    }

    const { error: deleteVersesError } = await adminClient
      .from("bible_verses")
      .delete()
      .in("chapter_id", chapterIds);

    if (deleteVersesError) {
      return NextResponse.json(
        { error: "DatabaseError", message: getErrorMessage(deleteVersesError) },
        { status: 500 },
      );
    }
    deletedVerseCount = Number(verseCount || 0);
  }

  const { error: deleteChaptersError } = await adminClient
    .from("bible_chapters")
    .delete()
    .eq("book_id", id);

  if (deleteChaptersError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(deleteChaptersError) },
      { status: 500 },
    );
  }

  const { error: deleteBookError } = await adminClient
    .from("bible_books")
    .delete()
    .eq("id", id)
    .eq("language_code", languageCode)
    .eq("version_code", versionCode);

  if (deleteBookError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(deleteBookError) },
      { status: 500 },
    );
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "DELETE_BIBLE_BOOK",
    tableName: "bible_books",
    recordId: id,
    oldData: existing as unknown as Record<string, unknown>,
    newData: null,
    request: req,
    extra: {
      language_code: languageCode,
      version_code: versionCode,
      deleted_chapters: chapterIds.length,
      deleted_verses: deletedVerseCount,
    },
  });

  const res = NextResponse.json({
    success: true,
    message: "Kitab berhasil dihapus.",
    deleted_chapters: chapterIds.length,
    deleted_verses: deletedVerseCount,
  });
  setCookiesToResponse(res);
  return res;
}
