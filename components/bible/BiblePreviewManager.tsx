"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenText, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useBibleWorkspace } from "@/components/bible/BibleWorkspaceProvider";

type BookOption = {
  id: string;
  name: string;
  grouping: "old" | "new" | "deutero";
  order_index: number;
};

type ChapterOption = {
  id: string;
  chapter_number: number;
};

type VerseItem = {
  id: string;
  chapter_id: string;
  verse_number: number;
  text: string;
  pericope: string | null;
};

function extractMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}

export default function BiblePreviewManager() {
  const { showToast } = useToast();
  const { lang, version } = useBibleWorkspace();

  const [books, setBooks] = useState<BookOption[]>([]);
  const [selectedBookId, setSelectedBookId] = useState("");
  const [chapters, setChapters] = useState<ChapterOption[]>([]);
  const [selectedChapter, setSelectedChapter] = useState("1");
  const [verses, setVerses] = useState<VerseItem[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [loadingVerses, setLoadingVerses] = useState(false);

  const chapterNumber = Number(selectedChapter);

  const fetchBooks = useCallback(async () => {
    if (!lang || !version) return;
    setLoadingBooks(true);
    try {
      const params = new URLSearchParams({
        lang,
        version,
        page: "1",
        limit: "200",
      });
      const response = await fetch(`/api/admin/bible/books?${params.toString()}`, {
        cache: "no-store",
      });
      const result = (await response.json().catch(() => ({}))) as {
        items?: BookOption[];
        message?: string;
      };
      if (!response.ok) {
        throw new Error(extractMessage(result, `Gagal memuat kitab (${response.status}).`));
      }
      const list = Array.isArray(result.items) ? result.items : [];
      setBooks(list);
      if (list.length > 0) {
        setSelectedBookId((prev) => (prev && list.some((book) => book.id === prev) ? prev : list[0].id));
      } else {
        setSelectedBookId("");
      }
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
      setBooks([]);
      setSelectedBookId("");
    } finally {
      setLoadingBooks(false);
    }
  }, [lang, showToast, version]);

  const fetchChapters = useCallback(async () => {
    if (!lang || !version || !selectedBookId) {
      setChapters([]);
      return;
    }
    setLoadingChapters(true);
    try {
      const params = new URLSearchParams({
        lang,
        version,
        book_id: selectedBookId,
      });
      const response = await fetch(`/api/admin/bible/chapters?${params.toString()}`, {
        cache: "no-store",
      });
      const result = (await response.json().catch(() => ({}))) as {
        items?: ChapterOption[];
        message?: string;
      };
      if (!response.ok) {
        throw new Error(extractMessage(result, `Gagal memuat pasal (${response.status}).`));
      }
      const chapterList = Array.isArray(result.items) ? result.items : [];
      setChapters(chapterList);
      if (chapterList.length > 0) {
        setSelectedChapter((prev) => {
          const current = Number(prev);
          if (Number.isInteger(current) && current > 0) {
            const exists = chapterList.some((item) => item.chapter_number === current);
            if (exists) return prev;
          }
          return String(chapterList[0].chapter_number);
        });
      } else {
        setSelectedChapter("1");
      }
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
      setChapters([]);
    } finally {
      setLoadingChapters(false);
    }
  }, [lang, selectedBookId, showToast, version]);

  const fetchVerses = useCallback(async () => {
    if (!lang || !version || !selectedBookId || !Number.isInteger(chapterNumber) || chapterNumber <= 0) {
      setVerses([]);
      return;
    }
    setLoadingVerses(true);
    try {
      const params = new URLSearchParams({
        lang,
        version,
        book_id: selectedBookId,
        chapter_number: String(chapterNumber),
        page: "1",
        limit: "400",
      });
      const response = await fetch(`/api/admin/bible/verses?${params.toString()}`, {
        cache: "no-store",
      });
      const result = (await response.json().catch(() => ({}))) as {
        items?: VerseItem[];
        message?: string;
      };
      if (!response.ok) {
        throw new Error(extractMessage(result, `Gagal memuat ayat (${response.status}).`));
      }
      setVerses(Array.isArray(result.items) ? result.items : []);
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
      setVerses([]);
    } finally {
      setLoadingVerses(false);
    }
  }, [chapterNumber, lang, selectedBookId, showToast, version]);

  useEffect(() => {
    void fetchBooks();
  }, [fetchBooks]);

  useEffect(() => {
    void fetchChapters();
  }, [fetchChapters]);

  useEffect(() => {
    void fetchVerses();
  }, [fetchVerses]);

  const selectedBook = useMemo(
    () => books.find((item) => item.id === selectedBookId) || null,
    [books, selectedBookId],
  );

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-surface-secondary bg-surface-primary p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-text-primary">Preview Alkitab</h2>
            <p className="text-sm text-text-secondary">
              Tampilan baca ayat sesuai struktur yang akan dipakai di Flutter.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void fetchBooks();
              void fetchChapters();
              void fetchVerses();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-surface-secondary px-3 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-secondary/60"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Kitab
            </span>
            <select
              value={selectedBookId}
              onChange={(event) => setSelectedBookId(event.target.value)}
              disabled={loadingBooks || books.length === 0}
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
            >
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.order_index}. {book.name} ({book.grouping})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Pasal
            </span>
            <select
              value={selectedChapter}
              onChange={(event) => setSelectedChapter(event.target.value)}
              disabled={loadingChapters || chapters.length === 0}
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
            >
              {chapters.map((chapter) => (
                <option key={chapter.id} value={String(chapter.chapter_number)}>
                  Pasal {chapter.chapter_number}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-lg border border-surface-secondary bg-surface-secondary/30 px-3 py-2 text-sm text-text-secondary">
            {selectedBook ? (
              <div>
                <p>
                  Kitab: <span className="font-semibold text-text-primary">{selectedBook.name}</span>
                </p>
                <p>
                  Total ayat ditampilkan:{" "}
                  <span className="font-semibold text-text-primary">{verses.length}</span>
                </p>
              </div>
            ) : (
              "Belum ada kitab."
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-surface-secondary bg-surface-primary p-5 shadow-sm">
        {loadingVerses ? (
          <div className="py-10 text-center text-text-secondary">
            <Loader2 size={18} className="mx-auto animate-spin" />
          </div>
        ) : verses.length === 0 ? (
          <div className="rounded-xl border border-surface-secondary bg-surface-secondary/20 py-10 text-center text-text-secondary">
            Belum ada ayat untuk kitab/pasal ini.
          </div>
        ) : (
          <div className="space-y-3">
            {verses.map((verse) => (
              <article
                key={`${verse.chapter_id}-${verse.verse_number}`}
                className="rounded-xl border border-surface-secondary bg-surface-secondary/20 p-4"
              >
                {verse.pericope ? (
                  <p className="mb-2 inline-flex items-center gap-2 rounded bg-action/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-action">
                    <BookOpenText size={14} />
                    {verse.pericope}
                  </p>
                ) : null}
                <p className="text-sm leading-relaxed text-text-primary">
                  <span className="mr-2 font-bold text-action">{verse.verse_number}</span>
                  {verse.text}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
