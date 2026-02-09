import { NextRequest, NextResponse } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import {
  getErrorMessage,
  isUuid,
  isValidLanguageCode,
  isValidVersionCode,
  parseBibleScopeFromSearchParams,
  sanitizeText,
} from "@/lib/bible-admin";

export const dynamic = "force-dynamic";

type ChapterRow = {
  id: string;
  chapter_number: number;
};

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
