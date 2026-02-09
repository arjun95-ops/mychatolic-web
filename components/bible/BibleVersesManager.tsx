"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Edit2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
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

type VersePagination = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

type VerseForm = {
  id: string | null;
  verseNumber: string;
  text: string;
  pericope: string;
};

const DEFAULT_LIMIT = 30;
const INITIAL_FORM: VerseForm = {
  id: null,
  verseNumber: "1",
  text: "",
  pericope: "",
};

function extractMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}

function toPositiveInt(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export default function BibleVersesManager() {
  const { showToast } = useToast();
  const { lang, version } = useBibleWorkspace();

  const [bookOptions, setBookOptions] = useState<BookOption[]>([]);
  const [bookLoading, setBookLoading] = useState(true);
  const [selectedBookId, setSelectedBookId] = useState("");
  const [chapters, setChapters] = useState<ChapterOption[]>([]);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [chapterInput, setChapterInput] = useState("1");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [verses, setVerses] = useState<VerseItem[]>([]);
  const [verseLoading, setVerseLoading] = useState(false);
  const [versePagination, setVersePagination] = useState<VersePagination>({
    page: 1,
    limit: DEFAULT_LIMIT,
    total: 0,
    total_pages: 1,
  });
  const [form, setForm] = useState<VerseForm>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [chapterExists, setChapterExists] = useState(true);

  const chapterNumber = toPositiveInt(chapterInput);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchBooks = useCallback(async () => {
    setBookLoading(true);
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
      const nextBooks = Array.isArray(result.items) ? result.items : [];
      setBookOptions(nextBooks);
      if (nextBooks.length > 0) {
        setSelectedBookId((prev) =>
          prev && nextBooks.some((item) => item.id === prev) ? prev : nextBooks[0].id,
        );
      } else {
        setSelectedBookId("");
      }
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
      setBookOptions([]);
      setSelectedBookId("");
    } finally {
      setBookLoading(false);
    }
  }, [lang, showToast, version]);

  const fetchChapters = useCallback(async () => {
    if (!lang || !version || !selectedBookId) {
      setChapters([]);
      return;
    }

    setChapterLoading(true);
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
      const chapterRows = Array.isArray(result.items) ? result.items : [];
      setChapters(chapterRows);
      if (chapterRows.length > 0) {
        setChapterInput((prev) => {
          const current = toPositiveInt(prev);
          if (!current) return String(chapterRows[0].chapter_number);
          const exists = chapterRows.some((item) => item.chapter_number === current);
          return exists ? prev : String(chapterRows[0].chapter_number);
        });
      } else {
        setChapterInput("1");
      }
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
      setChapters([]);
    } finally {
      setChapterLoading(false);
    }
  }, [lang, selectedBookId, showToast, version]);

  const fetchVerses = useCallback(async () => {
    if (!lang || !version || !selectedBookId || !chapterNumber) {
      setVerses([]);
      setVersePagination({
        page: 1,
        limit: DEFAULT_LIMIT,
        total: 0,
        total_pages: 1,
      });
      return;
    }

    setVerseLoading(true);
    try {
      const params = new URLSearchParams({
        lang,
        version,
        book_id: selectedBookId,
        chapter_number: String(chapterNumber),
        page: String(page),
        limit: String(DEFAULT_LIMIT),
      });
      if (search) params.set("q", search);

      const response = await fetch(`/api/admin/bible/verses?${params.toString()}`, {
        cache: "no-store",
      });
      const result = (await response.json().catch(() => ({}))) as {
        items?: VerseItem[];
        chapter_exists?: boolean;
        pagination?: VersePagination;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(extractMessage(result, `Gagal memuat ayat (${response.status}).`));
      }

      setVerses(Array.isArray(result.items) ? result.items : []);
      setChapterExists(result.chapter_exists !== false);
      setVersePagination(
        result.pagination || {
          page,
          limit: DEFAULT_LIMIT,
          total: 0,
          total_pages: 1,
        },
      );
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
      setVerses([]);
      setChapterExists(false);
    } finally {
      setVerseLoading(false);
    }
  }, [chapterNumber, lang, page, search, selectedBookId, showToast, version]);

  useEffect(() => {
    void fetchBooks();
  }, [fetchBooks]);

  useEffect(() => {
    setPage(1);
    setForm(INITIAL_FORM);
    void fetchChapters();
  }, [fetchChapters, selectedBookId]);

  useEffect(() => {
    setPage(1);
  }, [chapterNumber, selectedBookId]);

  useEffect(() => {
    void fetchVerses();
  }, [fetchVerses]);

  const selectedBook = useMemo(
    () => bookOptions.find((item) => item.id === selectedBookId) || null,
    [bookOptions, selectedBookId],
  );

  const resetForm = () => {
    const nextVerseNumber =
      verses.length > 0 ? Math.max(...verses.map((item) => item.verse_number), 0) + 1 : 1;
    setForm({
      ...INITIAL_FORM,
      verseNumber: String(nextVerseNumber),
    });
  };

  const handleEdit = (item: VerseItem) => {
    setForm({
      id: item.id,
      verseNumber: String(item.verse_number),
      text: item.text,
      pericope: item.pericope || "",
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!lang || !version || !selectedBookId || !chapterNumber) return;

    const verseNumber = toPositiveInt(form.verseNumber);
    if (!verseNumber) {
      showToast("verse_number harus angka bulat positif.", "error");
      return;
    }
    if (!form.text.trim()) {
      showToast("Teks ayat wajib diisi.", "error");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/bible/verses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language_code: lang,
          version_code: version,
          book_id: selectedBookId,
          chapter_number: chapterNumber,
          verse_number: verseNumber,
          text: form.text.trim(),
          pericope: form.pericope.trim() || null,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        chapter_created?: boolean;
      };
      if (!response.ok) {
        throw new Error(extractMessage(result, `Gagal menyimpan ayat (${response.status}).`));
      }

      if (result.chapter_created) {
        showToast("Pasal baru dibuat otomatis, ayat berhasil disimpan.", "success");
      } else {
        showToast(result.message || "Ayat berhasil disimpan.", "success");
      }

      resetForm();
      await fetchChapters();
      await fetchVerses();
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: VerseItem) => {
    if (!lang || !version || !selectedBookId || !chapterNumber) return;
    if (!window.confirm(`Hapus ayat ${item.verse_number}?`)) return;

    const key = `${item.chapter_id}-${item.verse_number}`;
    setDeletingKey(key);
    try {
      const response = await fetch("/api/admin/bible/verses/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language_code: lang,
          version_code: version,
          book_id: selectedBookId,
          chapter_number: chapterNumber,
          verse_number: item.verse_number,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(extractMessage(result, `Gagal menghapus ayat (${response.status}).`));
      }

      showToast(result.message || "Ayat berhasil dihapus.", "success");
      await fetchVerses();
      if (form.id === item.id) {
        resetForm();
      }
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-surface-secondary bg-surface-primary p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-text-primary">Kelola Ayat</h2>
            <p className="text-sm text-text-secondary">
              Pilih kitab dan pasal untuk mengedit ayat.
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
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
              disabled={bookLoading || bookOptions.length === 0}
            >
              {bookOptions.map((book) => (
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
            <input
              type="number"
              min={1}
              value={chapterInput}
              onChange={(event) => setChapterInput(event.target.value)}
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
              placeholder="Contoh: 1"
            />
          </label>

          <div className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Status Pasal
            </span>
            <div className="rounded-lg border border-surface-secondary bg-surface-secondary/30 px-3 py-2 text-sm text-text-secondary">
              {chapterLoading ? "Memuat daftar pasal..." : chapterExists ? "Sudah ada" : "Belum ada"}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {chapters.slice(0, 30).map((chapter) => (
            <button
              key={chapter.id}
              type="button"
              onClick={() => setChapterInput(String(chapter.chapter_number))}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                Number(chapterInput) === chapter.chapter_number
                  ? "bg-action text-text-inverse"
                  : "bg-surface-secondary/70 text-text-secondary hover:bg-surface-secondary"
              }`}
            >
              {chapter.chapter_number}
            </button>
          ))}
          {chapters.length > 30 ? (
            <span className="rounded-md bg-surface-secondary/70 px-2.5 py-1 text-xs font-semibold text-text-secondary">
              +{chapters.length - 30} pasal lain
            </span>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-surface-secondary bg-surface-primary p-5 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-surface-secondary p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-text-primary">
              {form.id ? "Edit Ayat" : "Tambah Ayat"}
            </p>
            {form.id ? (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1 rounded-lg border border-surface-secondary px-2 py-1 text-xs font-semibold text-text-secondary hover:bg-surface-secondary/60"
              >
                <X size={14} />
                Batal
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                verse_number
              </span>
              <input
                type="number"
                min={1}
                value={form.verseNumber}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, verseNumber: event.target.value }))
                }
                className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
                required
              />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Pericope (opsional)
              </span>
              <input
                type="text"
                value={form.pericope}
                onChange={(event) => setForm((prev) => ({ ...prev, pericope: event.target.value }))}
                className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
                placeholder="Contoh: Penciptaan"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Text
            </span>
            <textarea
              value={form.text}
              onChange={(event) => setForm((prev) => ({ ...prev, text: event.target.value }))}
              className="min-h-[120px] w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
              placeholder="Teks ayat..."
              required
            />
          </label>

          <button
            type="submit"
            disabled={saving || !selectedBook || !chapterNumber}
            className="inline-flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-text-inverse hover:bg-action/90 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : form.id ? (
              <Save size={16} />
            ) : (
              <Plus size={16} />
            )}
            {saving ? "Menyimpan..." : form.id ? "Update Ayat" : "Tambah Ayat"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-surface-secondary bg-surface-primary p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full max-w-md">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            />
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary py-2 pl-9 pr-3 text-sm outline-none focus:border-action"
              placeholder="Cari text/pericope..."
            />
          </div>
          <p className="text-sm text-text-secondary">
            Total ayat: <span className="font-semibold text-text-primary">{versePagination.total}</span>
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-surface-secondary">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-secondary/60 text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-3 py-3">Ayat</th>
                <th className="px-3 py-3">Pericope</th>
                <th className="px-3 py-3">Text</th>
                <th className="px-3 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {verseLoading ? (
                <tr>
                  <td colSpan={4} className="px-3 py-10 text-center text-text-secondary">
                    <Loader2 size={18} className="mx-auto animate-spin" />
                  </td>
                </tr>
              ) : verses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-10 text-center text-text-secondary">
                    Belum ada ayat pada kitab/pasal ini.
                  </td>
                </tr>
              ) : (
                verses.map((item) => {
                  const key = `${item.chapter_id}-${item.verse_number}`;
                  return (
                    <tr key={key} className="border-t border-surface-secondary/70 align-top">
                      <td className="px-3 py-3 font-semibold text-text-primary">{item.verse_number}</td>
                      <td className="px-3 py-3 text-text-secondary">{item.pericope || "-"}</td>
                      <td className="px-3 py-3 text-text-primary">{item.text}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-surface-secondary px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-secondary/60"
                          >
                            <Edit2 size={14} />
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={deletingKey === key}
                            onClick={() => void handleDelete(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-status-error/30 px-2.5 py-1.5 text-xs font-semibold text-status-error hover:bg-status-error/10 disabled:opacity-60"
                          >
                            {deletingKey === key ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
          <span>
            Halaman {versePagination.page} dari {Math.max(versePagination.total_pages, 1)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={versePagination.page <= 1}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              className="rounded-lg border border-surface-secondary px-3 py-1.5 font-semibold hover:bg-surface-secondary/60 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={versePagination.page >= Math.max(versePagination.total_pages, 1)}
              onClick={() =>
                setPage((prev) =>
                  Math.min(prev + 1, Math.max(versePagination.total_pages, 1)),
                )
              }
              className="rounded-lg border border-surface-secondary px-3 py-1.5 font-semibold hover:bg-surface-secondary/60 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
