"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, RefreshCw } from "lucide-react";
import Navigator from "@/components/bible-studio/Navigator";
import EditorAyat from "@/components/bible-studio/EditorAyat";
import EditorPerikop from "@/components/bible-studio/EditorPerikop";
import QCPanel from "@/components/bible-studio/QCPanel";
import BulkImport from "@/components/bible-studio/BulkImport";
import PreviewPane from "@/components/bible-studio/PreviewPane";
import { useToast } from "@/components/ui/Toast";
import {
  CATEGORY_OPTIONS,
  CATEGORY_TO_GROUPING,
  GROUPING_LABELS,
  STUDIO_TAB_OPTIONS,
  WORKSPACE_OPTIONS,
  type BookItem,
  type ChapterItem,
  type StudioCategory,
  type StudioTab,
  type VerseItem,
  type WorkspaceOption,
} from "@/components/bible-studio/types";
import { normalizeBookLookupKey, parsePositiveInt } from "@/lib/bible-admin";

type BooksResponse = {
  items?: BookItem[];
  message?: string;
};

type ChaptersResponse = {
  items?: ChapterItem[];
  message?: string;
};

type VersesResponse = {
  items?: VerseItem[];
  chapter_exists?: boolean;
  message?: string;
};

function extractMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}

function toWorkspaceKey(lang: string, version: string): string {
  return `${lang}:${version}`;
}

function normalizeLang(value: string | null): string {
  const normalized = (value || "id").trim().toLowerCase();
  return normalized || "id";
}

function normalizeVersion(value: string | null): string {
  const normalized = (value || "TB1").trim().toUpperCase();
  return normalized || "TB1";
}

function toBookToken(book: BookItem): string {
  return (book.abbreviation || book.id).trim();
}

function parseCategory(value: string | null): StudioCategory {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return "Perjanjian Lama";
  if (normalized === "old" || normalized === "pl" || normalized.includes("lama")) {
    return "Perjanjian Lama";
  }
  if (normalized === "new" || normalized === "pb" || normalized.includes("baru")) {
    return "Perjanjian Baru";
  }
  if (normalized === "deutero" || normalized.includes("deutero")) {
    return "Deuterokanonika";
  }
  return CATEGORY_OPTIONS.find((item) => item.toLowerCase() === normalized) || "Perjanjian Lama";
}

function isStudioTab(value: string): value is StudioTab {
  return STUDIO_TAB_OPTIONS.some((item) => item.key === value);
}

function parseTab(value: string | null): StudioTab {
  if (!value) return "ayat";
  return isStudioTab(value) ? value : "ayat";
}

function matchBook(book: BookItem, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  const upper = trimmed.toUpperCase();
  if (book.id === trimmed) return true;
  if ((book.abbreviation || "").toUpperCase() === upper) return true;
  const normalizedQuery = normalizeBookLookupKey(trimmed);
  return normalizeBookLookupKey(book.name) === normalizedQuery;
}

function computeMissingCount(verses: VerseItem[]): number {
  if (verses.length === 0) return 0;
  const maxVerse = verses.reduce((max, verse) => Math.max(max, verse.verse_number), 0);
  const existing = new Set(verses.map((verse) => verse.verse_number));
  let missing = 0;
  for (let i = 1; i <= maxVerse; i += 1) {
    if (!existing.has(i)) missing += 1;
  }
  return missing;
}

export default function BibleStudio() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const lang = normalizeLang(searchParams.get("lang"));
  const version = normalizeVersion(searchParams.get("version"));
  const category = parseCategory(searchParams.get("cat"));
  const groupingFilter = CATEGORY_TO_GROUPING[category];
  const tab = parseTab(searchParams.get("tab"));
  const bookQuery = (searchParams.get("book") || "").trim();
  const chapterQuery = parsePositiveInt(searchParams.get("ch"));
  const selectedChapter = chapterQuery || 1;

  const setQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (!value) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const updates: Record<string, string | null> = {};
    if (!searchParams.get("lang")) updates.lang = lang;
    if (!searchParams.get("version")) updates.version = version;
    if (!searchParams.get("cat")) updates.cat = category;
    if (!searchParams.get("ch")) updates.ch = String(selectedChapter);
    if (!searchParams.get("tab")) updates.tab = tab;
    if (Object.keys(updates).length > 0) setQuery(updates);
  }, [category, lang, searchParams, selectedChapter, setQuery, tab, version]);

  const [bookSearch, setBookSearch] = useState("");
  const [debouncedBookSearch, setDebouncedBookSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedBookSearch(bookSearch.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [bookSearch]);

  const [books, setBooks] = useState<BookItem[]>([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [verses, setVerses] = useState<VerseItem[]>([]);
  const [versesLoading, setVersesLoading] = useState(false);
  const [chapterExists, setChapterExists] = useState(true);

  const workspaceOptions: WorkspaceOption[] = useMemo(() => {
    const key = toWorkspaceKey(lang, version);
    const exists = WORKSPACE_OPTIONS.some(
      (item) => toWorkspaceKey(item.lang, item.version) === key,
    );
    if (exists) return WORKSPACE_OPTIONS;
    return [...WORKSPACE_OPTIONS, { label: `Custom (${lang.toUpperCase()} / ${version})`, lang, version }];
  }, [lang, version]);
  const activeWorkspaceKey = toWorkspaceKey(lang, version);

  const workspaceLabel = useMemo(() => {
    const selected = workspaceOptions.find(
      (item) => toWorkspaceKey(item.lang, item.version) === activeWorkspaceKey,
    );
    return selected?.label || `${lang.toUpperCase()} / ${version}`;
  }, [activeWorkspaceKey, lang, version, workspaceOptions]);

  const fetchBooks = useCallback(async () => {
    setBooksLoading(true);
    try {
      const params = new URLSearchParams({
        lang,
        version,
        page: "1",
        limit: "200",
        grouping: groupingFilter,
      });
      if (debouncedBookSearch) params.set("q", debouncedBookSearch);

      const response = await fetch(`/api/admin/bible/books?${params.toString()}`, {
        cache: "no-store",
      });
      const result = (await response.json().catch(() => ({}))) as BooksResponse;
      if (!response.ok) {
        throw new Error(extractMessage(result, `Gagal memuat kitab (${response.status}).`));
      }
      setBooks(Array.isArray(result.items) ? result.items : []);
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
      setBooks([]);
    } finally {
      setBooksLoading(false);
    }
  }, [debouncedBookSearch, groupingFilter, lang, showToast, version]);

  useEffect(() => {
    void fetchBooks();
  }, [fetchBooks]);

  const selectedBook = useMemo(() => {
    if (books.length === 0) return null;
    if (bookQuery) {
      const found = books.find((book) => matchBook(book, bookQuery));
      if (found) return found;
    }
    return books[0];
  }, [bookQuery, books]);

  useEffect(() => {
    if (booksLoading) return;
    if (!selectedBook) {
      if (bookQuery) setQuery({ book: null });
      return;
    }
    const nextToken = toBookToken(selectedBook);
    if (bookQuery !== nextToken) setQuery({ book: nextToken });
  }, [bookQuery, booksLoading, selectedBook, setQuery]);

  const fetchChapters = useCallback(async () => {
    if (!selectedBook?.id) {
      setChapters([]);
      return;
    }

    setChaptersLoading(true);
    try {
      const params = new URLSearchParams({
        lang,
        version,
        book_id: selectedBook.id,
      });
      const response = await fetch(`/api/admin/bible/chapters?${params.toString()}`, {
        cache: "no-store",
      });
      const result = (await response.json().catch(() => ({}))) as ChaptersResponse;
      if (!response.ok) {
        throw new Error(extractMessage(result, `Gagal memuat bab (${response.status}).`));
      }
      setChapters(Array.isArray(result.items) ? result.items : []);
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
      setChapters([]);
    } finally {
      setChaptersLoading(false);
    }
  }, [lang, selectedBook?.id, showToast, version]);

  useEffect(() => {
    if (!chapterQuery || chapterQuery <= 0) {
      setQuery({ ch: String(selectedChapter) });
    }
  }, [chapterQuery, selectedChapter, setQuery]);

  useEffect(() => {
    void fetchChapters();
  }, [fetchChapters]);

  const fetchVerses = useCallback(async () => {
    if (!selectedBook?.id || !selectedChapter) {
      setVerses([]);
      setChapterExists(false);
      return;
    }

    setVersesLoading(true);
    try {
      const params = new URLSearchParams({
        lang,
        version,
        book_id: selectedBook.id,
        chapter_number: String(selectedChapter),
        page: "1",
        limit: "400",
      });
      const response = await fetch(`/api/admin/bible/verses?${params.toString()}`, {
        cache: "no-store",
      });
      const result = (await response.json().catch(() => ({}))) as VersesResponse;
      if (!response.ok) {
        throw new Error(extractMessage(result, `Gagal memuat ayat (${response.status}).`));
      }
      const verseItems = Array.isArray(result.items) ? result.items : [];
      setVerses(verseItems);
      setChapterExists(result.chapter_exists !== false);
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
      setVerses([]);
      setChapterExists(false);
    } finally {
      setVersesLoading(false);
    }
  }, [lang, selectedBook?.id, selectedChapter, showToast, version]);

  useEffect(() => {
    void fetchVerses();
  }, [fetchVerses]);

  const refreshStudioData = useCallback(async () => {
    await fetchBooks();
    await fetchChapters();
    await fetchVerses();
  }, [fetchBooks, fetchChapters, fetchVerses]);

  const refreshChapterData = useCallback(async () => {
    await fetchChapters();
    await fetchVerses();
  }, [fetchChapters, fetchVerses]);

  const missingCount = useMemo(() => computeMissingCount(verses), [verses]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <Link href="/dashboard" className="hover:text-action">
          Dashboard
        </Link>
        <ChevronRight size={14} />
        <span className="font-semibold text-text-primary">Bible Studio</span>
      </div>

      <section className="rounded-2xl border border-surface-secondary bg-surface-primary p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Bible Studio</h1>
            <p className="text-sm text-text-secondary">
              Workspace → Kitab → Bab → Input ayat, perikop, QC, import, dan preview.
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              Scope aktif: <span className="font-semibold">{workspaceLabel}</span> | Kategori{" "}
              <span className="font-semibold">{category}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refreshStudioData()}
            className="inline-flex items-center gap-2 rounded-lg border border-surface-secondary px-3 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-secondary/60"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Navigator
          workspaceOptions={workspaceOptions}
          activeWorkspaceKey={activeWorkspaceKey}
          onWorkspaceChange={(workspaceKey) => {
            const [nextLang, nextVersion] = workspaceKey.split(":");
            if (!nextLang || !nextVersion) return;
            setBookSearch("");
            setQuery({
              lang: nextLang,
              version: nextVersion,
              book: null,
              ch: "1",
            });
          }}
          category={category}
          onCategoryChange={(nextCategory) => {
            setBookSearch("");
            setQuery({
              cat: nextCategory,
              book: null,
              ch: "1",
            });
          }}
          bookSearch={bookSearch}
          onBookSearchChange={setBookSearch}
          books={books}
          booksLoading={booksLoading}
          selectedBookId={selectedBook?.id || null}
          onSelectBook={(bookId) => {
            const target = books.find((book) => book.id === bookId);
            setQuery({
              book: target ? toBookToken(target) : bookId,
              ch: "1",
            });
          }}
          chapters={chapters}
          chaptersLoading={chaptersLoading}
          selectedChapter={selectedChapter}
          verseCount={verses.length}
          missingCount={missingCount}
          chapterExists={chapterExists}
          onSelectChapter={(chapterNumber) => setQuery({ ch: String(chapterNumber) })}
        />

        <section className="space-y-4 rounded-2xl border border-surface-secondary bg-surface-primary p-4 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {selectedBook
                  ? `${selectedBook.name} ${selectedChapter}`
                  : "Pilih kitab dan bab dari navigator"}
              </p>
              <p className="text-xs text-text-secondary">
                {selectedBook
                  ? `Grouping: ${GROUPING_LABELS[selectedBook.grouping]}`
                  : "State disimpan di URL query params agar mudah dibagikan."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-surface-secondary pb-3">
            {STUDIO_TAB_OPTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setQuery({ tab: item.key })}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  tab === item.key
                    ? "bg-action text-text-inverse"
                    : "bg-surface-secondary/40 text-text-secondary hover:bg-surface-secondary/70"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "ayat" ? (
            <EditorAyat
              lang={lang}
              version={version}
              selectedBookId={selectedBook?.id || null}
              selectedChapter={selectedChapter}
              verses={verses}
              onRefresh={refreshChapterData}
            />
          ) : null}

          {tab === "perikop" ? (
            <EditorPerikop
              lang={lang}
              version={version}
              selectedBookId={selectedBook?.id || null}
              selectedChapter={selectedChapter}
              verses={verses}
              onRefresh={refreshChapterData}
            />
          ) : null}

          {tab === "qc" ? (
            <QCPanel
              verses={verses}
              chapterExists={chapterExists}
              onOpenPreview={() => setQuery({ tab: "preview" })}
            />
          ) : null}

          {tab === "bulk-import" ? (
            <BulkImport lang={lang} version={version} onImportFinished={refreshStudioData} />
          ) : null}

          {tab === "preview" ? (
            <PreviewPane
              workspaceLabel={workspaceLabel}
              bookName={selectedBook?.name || null}
              chapters={chapters}
              selectedChapter={selectedChapter}
              onSelectChapter={(chapterNumber) => setQuery({ ch: String(chapterNumber) })}
              verses={verses}
              loading={versesLoading}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}
