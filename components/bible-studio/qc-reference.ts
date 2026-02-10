import referenceData from "@/docs/import/deuterokanonika_tb1_max_verse_reference.json";
import { normalizeBookLookupKey } from "@/lib/bible-admin";

type ReferenceBooks = Record<string, Record<string, number>>;
type ReferencePayload = {
  workspace: string;
  source: string;
  books: ReferenceBooks;
};

const REFERENCE = referenceData as ReferencePayload;
const IS_ID_TB1_REFERENCE = REFERENCE.workspace === "id/TB1";

const BOOK_CHAPTER_MAX = new Map<string, Record<string, number>>();
for (const [bookName, chapterMap] of Object.entries(REFERENCE.books || {})) {
  BOOK_CHAPTER_MAX.set(normalizeBookLookupKey(bookName), chapterMap);
}

export function getKnownExpectedMaxVerse(params: {
  lang: string;
  version: string;
  bookName: string;
  chapter: number;
}): number | null {
  const lang = params.lang.trim().toLowerCase();
  const version = params.version.trim().toUpperCase();
  if (!IS_ID_TB1_REFERENCE || lang !== "id" || version !== "TB1") return null;

  const chapter = Math.floor(params.chapter);
  if (!Number.isInteger(chapter) || chapter <= 0) return null;

  const chapterMap = BOOK_CHAPTER_MAX.get(normalizeBookLookupKey(params.bookName));
  if (!chapterMap) return null;

  const value = Number(chapterMap[String(chapter)] || 0);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function getKnownExpectedMaxReferenceLabel(params: {
  lang: string;
  version: string;
}): string | null {
  const lang = params.lang.trim().toLowerCase();
  const version = params.version.trim().toUpperCase();
  if (!IS_ID_TB1_REFERENCE || lang !== "id" || version !== "TB1") return null;
  return REFERENCE.source || "local reference";
}
