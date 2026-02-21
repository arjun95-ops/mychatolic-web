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

export const dynamic = "force-dynamic";

type ChapterRow = {
  id: string;
  chapter_number: number;
};

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

  if (!isValidLanguageCode(languageCode) || !isValidVersionCode(versionCode) || !isUuid(bookId)) {
    return NextResponse.json(
      {
        error: "ValidationError",
        message: "language_code/version_code/book_id tidak valid.",
      },
      { status: 400 },
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

  const { data, error } = await adminClient
    .from("bible_chapters")
    .select("id, chapter_number")
    .eq("book_id", bookId)
    .order("chapter_number", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(error) },
      { status: 500 },
    );
  }

  const res = NextResponse.json({
    success: true,
    items: (data || []) as ChapterRow[],
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

  const { data: existingChapter, error: existingError } = await adminClient
    .from("bible_chapters")
    .select("id, chapter_number")
    .eq("book_id", bookId)
    .eq("chapter_number", chapterNumber)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(existingError) },
      { status: 500 },
    );
  }

  if (existingChapter) {
    const res = NextResponse.json({
      success: true,
      message: "Bab sudah tersedia.",
      chapter_created: false,
      data: existingChapter as ChapterRow,
    });
    setCookiesToResponse(res);
    return res;
  }

  if (chapterNumber > 1) {
    const { data: previousChapter, error: previousError } = await adminClient
      .from("bible_chapters")
      .select("id")
      .eq("book_id", bookId)
      .eq("chapter_number", chapterNumber - 1)
      .maybeSingle();

    if (previousError) {
      return NextResponse.json(
        { error: "DatabaseError", message: getErrorMessage(previousError) },
        { status: 500 },
      );
    }
    if (!previousChapter?.id) {
      return NextResponse.json(
        {
          error: "ValidationError",
          message: `Pasal ${chapterNumber - 1} belum tersedia. Tambah bab harus berurutan.`,
        },
        { status: 400 },
      );
    }
  }

  const insertResult = await adminClient
    .from("bible_chapters")
    .insert({ book_id: bookId, chapter_number: chapterNumber })
    .select("id, chapter_number")
    .maybeSingle();

  if (insertResult.error && getErrorCode(insertResult.error) === "23505") {
    const { data: retryRow, error: retryError } = await adminClient
      .from("bible_chapters")
      .select("id, chapter_number")
      .eq("book_id", bookId)
      .eq("chapter_number", chapterNumber)
      .maybeSingle();

    if (retryError) {
      return NextResponse.json(
        { error: "DatabaseError", message: getErrorMessage(retryError) },
        { status: 500 },
      );
    }
    if (retryRow) {
      const res = NextResponse.json({
        success: true,
        message: "Bab sudah tersedia.",
        chapter_created: false,
        data: retryRow as ChapterRow,
      });
      setCookiesToResponse(res);
      return res;
    }
  }

  if (insertResult.error || !insertResult.data) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(insertResult.error) },
      { status: 500 },
    );
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "CREATE_BIBLE_CHAPTER",
    tableName: "bible_chapters",
    recordId: String((insertResult.data as { id?: unknown })?.id || ""),
    oldData: null,
    newData: insertResult.data as unknown as Record<string, unknown>,
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
    message: "Bab berhasil ditambahkan.",
    chapter_created: true,
    data: insertResult.data as ChapterRow,
  });
  setCookiesToResponse(res);
  return res;
}
