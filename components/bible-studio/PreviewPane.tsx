"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { BookOpenText, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { ChapterItem, VerseItem } from "@/components/bible-studio/types";

type PreviewPaneProps = {
  lang: string;
  version: string;
  selectedBookId: string | null;
  workspaceLabel: string;
  bookName: string | null;
  chapters: ChapterItem[];
  selectedChapter: number;
  onSelectChapter: (chapterNumber: number) => void;
  verses: VerseItem[];
  loading: boolean;
  onRefresh: () => Promise<void>;
};

type ApiResult = {
  message?: string;
  existing_verses?: number;
  allow_force?: boolean;
  deleted_verses?: number;
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

function submitOnMetaEnter<T extends HTMLInputElement | HTMLTextAreaElement>(event: KeyboardEvent<T>) {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}

export default function PreviewPane({
  lang,
  version,
  selectedBookId,
  workspaceLabel,
  bookName,
  chapters,
  selectedChapter,
  onSelectChapter,
  verses,
  loading,
  onRefresh,
}: PreviewPaneProps) {
  const { showToast } = useToast();
  const [editingVerseId, setEditingVerseId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editPericope, setEditPericope] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPericopeForm, setShowPericopeForm] = useState(false);
  const [newVerseNumber, setNewVerseNumber] = useState("1");
  const [newText, setNewText] = useState("");
  const [newPericope, setNewPericope] = useState("");
  const [rangeTitle, setRangeTitle] = useState("");
  const [rangeStartVerse, setRangeStartVerse] = useState("");
  const [rangeEndVerse, setRangeEndVerse] = useState("");
  const [chapterInput, setChapterInput] = useState("1");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingVerseId, setDeletingVerseId] = useState<string | null>(null);
  const [chapterActionKey, setChapterActionKey] = useState<"add" | "delete" | null>(null);

  const maxVerse = useMemo(
    () => verses.reduce((max, verse) => Math.max(max, verse.verse_number), 0),
    [verses],
  );
  const maxChapterNumber = useMemo(
    () => chapters.reduce((max, chapter) => Math.max(max, chapter.chapter_number), 0),
    [chapters],
  );
  const selectedChapterRow = useMemo(
    () => chapters.find((chapter) => chapter.chapter_number === selectedChapter) || null,
    [chapters, selectedChapter],
  );

  useEffect(() => {
    setEditingVerseId(null);
    setEditText("");
    setEditPericope("");
    setShowAddForm(false);
    setShowPericopeForm(false);
    setNewText("");
    setNewPericope("");
    setNewVerseNumber(String(Math.max(maxVerse + 1, 1)));
    setRangeTitle("");
    setRangeStartVerse("");
    setRangeEndVerse("");
  }, [bookName, maxVerse, selectedBookId, selectedChapter]);

  useEffect(() => {
    setChapterInput(String(Math.max(maxChapterNumber + 1, 1)));
  }, [maxChapterNumber, selectedBookId]);

  const pericopeEntries = useMemo(() => {
    const starts = verses
      .filter((verse) => Boolean((verse.pericope || "").trim()))
      .sort((a, b) => a.verse_number - b.verse_number);

    return starts.map((verse, index) => {
      const nextStart = starts[index + 1]?.verse_number;
      const computedEnd = nextStart ? nextStart - 1 : maxVerse;
      return {
        startVerse: verse.verse_number,
        endVerse: Math.max(computedEnd, verse.verse_number),
        title: verse.pericope || "",
      };
    });
  }, [maxVerse, verses]);

  const startEdit = (verse: VerseItem) => {
    setEditingVerseId(verse.id);
    setEditText(verse.text);
    setEditPericope(verse.pericope || "");
    setShowAddForm(false);
    setShowPericopeForm(false);
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>, verse: VerseItem) => {
    event.preventDefault();
    if (!selectedBookId) return;
    if (!editText.trim()) {
      showToast("Teks ayat wajib diisi.", "error");
      return;
    }

    setSavingKey(verse.id);
    try {
      const response = await fetch("/api/admin/bible/verses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language_code: lang,
          version_code: version,
          book_id: selectedBookId,
          chapter_number: selectedChapter,
          verse_number: verse.verse_number,
          text: editText.trim(),
          pericope: editPericope.trim() || null,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as ApiResult;
      if (!response.ok) {
        throw new Error(extractMessage(result, `Gagal menyimpan ayat (${response.status}).`));
      }

      showToast(result.message || "Ayat berhasil diperbarui.", "success");
      setEditingVerseId(null);
      await onRefresh();
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
    } finally {
      setSavingKey(null);
    }
  };

  const handleAddSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedBookId) return;

    const verseNumber = toPositiveInt(newVerseNumber);
    if (!verseNumber) {
      showToast("Nomor ayat harus angka bulat positif.", "error");
      return;
    }
    if (!newText.trim()) {
      showToast("Teks ayat wajib diisi.", "error");
      return;
    }

    setSavingKey("add");
    try {
      const response = await fetch("/api/admin/bible/verses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language_code: lang,
          version_code: version,
          book_id: selectedBookId,
          chapter_number: selectedChapter,
          verse_number: verseNumber,
          text: newText.trim(),
          pericope: newPericope.trim() || null,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as ApiResult;
      if (!response.ok) {
        throw new Error(extractMessage(result, `Gagal menambah ayat (${response.status}).`));
      }

      showToast(result.message || "Ayat berhasil ditambahkan.", "success");
      setNewText("");
      setNewPericope("");
      setNewVerseNumber(String(verseNumber + 1));
      await onRefresh();
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
    } finally {
      setSavingKey(null);
    }
  };

  const handleDelete = async (verse: VerseItem) => {
    if (!selectedBookId) return;
    if (!window.confirm(`Hapus ayat ${verse.verse_number}?`)) return;

    setDeletingVerseId(verse.id);
    try {
      const response = await fetch("/api/admin/bible/verses/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language_code: lang,
          version_code: version,
          book_id: selectedBookId,
          chapter_number: selectedChapter,
          verse_number: verse.verse_number,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as ApiResult;
      if (!response.ok) {
        throw new Error(extractMessage(result, `Gagal menghapus ayat (${response.status}).`));
      }
      showToast(result.message || "Ayat berhasil dihapus.", "success");
      if (editingVerseId === verse.id) setEditingVerseId(null);
      await onRefresh();
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
    } finally {
      setDeletingVerseId(null);
    }
  };

  const handlePericopeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedBookId) return;

    const start = toPositiveInt(rangeStartVerse);
    const end = toPositiveInt(rangeEndVerse);
    if (!rangeTitle.trim()) {
      showToast("Judul perikop wajib diisi.", "error");
      return;
    }
    if (!start || !end) {
      showToast("Start/End ayat harus angka bulat positif.", "error");
      return;
    }
    if (end < start) {
      showToast("End ayat tidak boleh lebih kecil dari start ayat.", "error");
      return;
    }

    setSavingKey("pericope");
    try {
      const response = await fetch("/api/admin/bible/pericopes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language_code: lang,
          version_code: version,
          book_id: selectedBookId,
          chapter_number: selectedChapter,
          title: rangeTitle.trim(),
          start_verse: start,
          end_verse: end,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as ApiResult;
      if (!response.ok) {
        throw new Error(extractMessage(result, `Gagal menyimpan perikop (${response.status}).`));
      }
      showToast(result.message || "Perikop berhasil disimpan.", "success");
      await onRefresh();
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
    } finally {
      setSavingKey(null);
    }
  };

  const handleAddChapter = async () => {
    if (!selectedBookId) return;
    const chapterNumber = toPositiveInt(chapterInput);
    if (!chapterNumber) {
      showToast("Nomor bab harus angka bulat positif.", "error");
      return;
    }

    setChapterActionKey("add");
    try {
      const response = await fetch("/api/admin/bible/chapters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language_code: lang,
          version_code: version,
          book_id: selectedBookId,
          chapter_number: chapterNumber,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as ApiResult;
      if (!response.ok) {
        throw new Error(extractMessage(result, `Gagal menambah bab (${response.status}).`));
      }
      showToast(result.message || "Bab berhasil ditambahkan.", "success");
      await onRefresh();
      onSelectChapter(chapterNumber);
      setChapterInput(String(chapterNumber + 1));
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
    } finally {
      setChapterActionKey(null);
    }
  };

  const handleDeleteChapter = async () => {
    if (!selectedBookId || !selectedChapterRow) return;

    if (!window.confirm(`Hapus bab ${selectedChapter}?`)) return;

    const remainingChapterNumbers = chapters
      .map((chapter) => chapter.chapter_number)
      .filter((num) => num !== selectedChapter)
      .sort((a, b) => a - b);
    const fallbackChapter =
      remainingChapterNumbers.find((num) => num > selectedChapter) ||
      remainingChapterNumbers[remainingChapterNumbers.length - 1] ||
      1;

    setChapterActionKey("delete");
    try {
      const requestDeleteChapter = async (force: boolean) => {
        const response = await fetch("/api/admin/bible/chapters/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language_code: lang,
            version_code: version,
            book_id: selectedBookId,
            chapter_number: selectedChapter,
            force,
          }),
        });
        const result = (await response.json().catch(() => ({}))) as ApiResult;
        return { response, result };
      };

      let { response, result } = await requestDeleteChapter(false);
      if (!response.ok && response.status === 409 && result.allow_force) {
        const existingVerses = Number(result.existing_verses || 0);
        const forceConfirm = window.confirm(
          existingVerses > 0
            ? `Bab ${selectedChapter} berisi ${existingVerses} ayat. Hapus paksa semua ayat/perikop pada bab ini?`
            : `Bab ${selectedChapter} tidak kosong. Lanjut hapus paksa?`,
        );
        if (!forceConfirm) {
          showToast("Dibatalkan. Bab tidak dihapus.", "info");
          return;
        }
        const forced = await requestDeleteChapter(true);
        response = forced.response;
        result = forced.result;
      }

      if (!response.ok) {
        throw new Error(extractMessage(result, `Gagal menghapus bab (${response.status}).`));
      }

      showToast(result.message || `Bab ${selectedChapter} berhasil dihapus.`, "success");
      await onRefresh();
      onSelectChapter(fallbackChapter);
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
    } finally {
      setChapterActionKey(null);
    }
  };

  if (!bookName) {
    return (
      <div className="rounded-xl border border-surface-secondary bg-surface-secondary/20 p-6 text-sm text-text-secondary">
        Pilih kitab dan bab untuk melihat preview.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_1fr]">
      <aside className="space-y-3 rounded-xl border border-surface-secondary bg-surface-secondary/20 p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-secondary">Workspace</p>
          <p className="text-sm font-semibold text-text-primary">{workspaceLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-text-secondary">Kitab</p>
          <p className="text-sm font-semibold text-text-primary">{bookName}</p>
        </div>
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-text-secondary">Grid Bab</p>
          <div className="grid max-h-64 grid-cols-6 gap-1 overflow-y-auto">
            {chapters.length === 0 ? (
              <p className="col-span-6 text-xs text-text-secondary">Belum ada bab.</p>
            ) : (
              chapters.map((chapter) => {
                const active = chapter.chapter_number === selectedChapter;
                return (
                  <button
                    key={chapter.id}
                    type="button"
                    onClick={() => onSelectChapter(chapter.chapter_number)}
                    className={`rounded-md px-2 py-1 text-xs font-semibold ${
                      active
                        ? "bg-action text-text-inverse"
                        : "bg-surface-primary text-text-secondary hover:bg-surface-secondary"
                    }`}
                  >
                    {chapter.chapter_number}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-lg border border-surface-secondary bg-surface-primary/70 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Kelola Bab
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              value={chapterInput}
              onChange={(event) => setChapterInput(event.target.value)}
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
              placeholder="Nomor bab"
            />
            <button
              type="button"
              disabled={chapterActionKey !== null || !selectedBookId}
              onClick={() => void handleAddChapter()}
              className="inline-flex items-center gap-1 rounded-lg border border-surface-secondary px-2.5 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-secondary/60 disabled:opacity-60"
            >
              {chapterActionKey === "add" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              Tambah
            </button>
          </div>
          <button
            type="button"
            disabled={chapterActionKey !== null || !selectedBookId || !selectedChapterRow}
            onClick={() => void handleDeleteChapter()}
            className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-status-error/30 px-2.5 py-2 text-xs font-semibold text-status-error hover:bg-status-error/10 disabled:opacity-60"
          >
            {chapterActionKey === "delete" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            Hapus Bab Aktif
          </button>
          <p className="mt-2 text-[11px] text-text-secondary">
            Default aman: bab non-kosong akan minta konfirmasi kedua sebelum hapus paksa.
          </p>
        </div>
      </aside>

      <section className="rounded-xl border border-surface-secondary p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-text-primary">
              {bookName} {selectedChapter}
            </h3>
            <p className="text-xs text-text-secondary">
              Preview + quick edit (koreksi ayat/perikop langsung dari panel ini).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAddForm((prev) => !prev);
                setShowPericopeForm(false);
                setEditingVerseId(null);
              }}
              className="inline-flex items-center gap-1 rounded border border-surface-secondary px-2 py-1 text-xs font-semibold text-text-secondary hover:bg-surface-secondary/60"
            >
              {showAddForm ? <X size={14} /> : <Plus size={14} />}
              {showAddForm ? "Tutup Form" : "Tambah Ayat"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPericopeForm((prev) => !prev);
                setShowAddForm(false);
                setEditingVerseId(null);
              }}
              className="inline-flex items-center gap-1 rounded border border-surface-secondary px-2 py-1 text-xs font-semibold text-text-secondary hover:bg-surface-secondary/60"
            >
              {showPericopeForm ? <X size={14} /> : <Pencil size={14} />}
              {showPericopeForm ? "Tutup Perikop" : "Set Perikop"}
            </button>
            <span className="inline-flex items-center gap-1 rounded bg-action/10 px-2 py-1 text-xs font-semibold text-action">
              <BookOpenText size={14} />
              Reader
            </span>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-text-secondary">
            <Loader2 size={18} className="mx-auto animate-spin" />
          </div>
        ) : (
          <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
            {showAddForm ? (
              <form
                onSubmit={(event) => void handleAddSubmit(event)}
                className="rounded-lg border border-action/30 bg-action/5 p-3"
              >
                <p className="mb-2 text-sm font-semibold text-text-primary">Tambah Ayat Baru</p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Ayat
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={newVerseNumber}
                      onChange={(event) => setNewVerseNumber(event.target.value)}
                      className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Perikop (opsional)
                    </span>
                    <input
                      type="text"
                      value={newPericope}
                      onChange={(event) => setNewPericope(event.target.value)}
                      className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
                    />
                  </label>
                </div>
                <label className="mt-2 block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Teks Ayat
                  </span>
                  <textarea
                    value={newText}
                    onChange={(event) => setNewText(event.target.value)}
                    onKeyDown={submitOnMetaEnter}
                    className="min-h-[110px] w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
                    placeholder="Isi ayat..."
                  />
                </label>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewText("");
                      setNewPericope("");
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-surface-secondary px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-secondary/60"
                  >
                    <X size={14} />
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={savingKey === "add"}
                    className="inline-flex items-center gap-1 rounded-lg bg-action px-2.5 py-1.5 text-xs font-semibold text-text-inverse hover:bg-action/90 disabled:opacity-60"
                  >
                    {savingKey === "add" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Save size={14} />
                    )}
                    Simpan Ayat
                  </button>
                </div>
              </form>
            ) : null}

            {showPericopeForm ? (
              <section className="rounded-lg border border-surface-secondary bg-surface-secondary/30 p-3">
                <form onSubmit={(event) => void handlePericopeSubmit(event)} className="space-y-2">
                  <p className="text-sm font-semibold text-text-primary">Set Perikop Range</p>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Judul
                    </span>
                    <input
                      type="text"
                      value={rangeTitle}
                      onChange={(event) => setRangeTitle(event.target.value)}
                      onKeyDown={submitOnMetaEnter}
                      className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
                      placeholder="Contoh: Khotbah di Bukit"
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Start Ayat
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={rangeStartVerse}
                        onChange={(event) => setRangeStartVerse(event.target.value)}
                        className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        End Ayat
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={rangeEndVerse}
                        onChange={(event) => setRangeEndVerse(event.target.value)}
                        onKeyDown={submitOnMetaEnter}
                        className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
                      />
                    </label>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingKey === "pericope" || verses.length === 0}
                      className="inline-flex items-center gap-1 rounded-lg bg-action px-2.5 py-1.5 text-xs font-semibold text-text-inverse hover:bg-action/90 disabled:opacity-60"
                    >
                      {savingKey === "pericope" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Save size={14} />
                      )}
                      Simpan Perikop
                    </button>
                  </div>
                </form>

                <div className="mt-3 border-t border-surface-secondary pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Daftar Perikop Bab Ini
                  </p>
                  {pericopeEntries.length === 0 ? (
                    <p className="text-xs text-text-secondary">Belum ada perikop.</p>
                  ) : (
                    <div className="space-y-2">
                      {pericopeEntries.map((entry) => (
                        <button
                          key={`${entry.startVerse}-${entry.title}`}
                          type="button"
                          onClick={() => {
                            setRangeTitle(entry.title);
                            setRangeStartVerse(String(entry.startVerse));
                            setRangeEndVerse(String(entry.endVerse));
                          }}
                          className="flex w-full items-center justify-between rounded-lg border border-surface-secondary bg-surface-primary px-2.5 py-2 text-left hover:bg-surface-secondary/40"
                        >
                          <span className="truncate pr-3 text-xs font-semibold text-text-primary">
                            {entry.title}
                          </span>
                          <span className="text-xs text-text-secondary">
                            {entry.startVerse}-{entry.endVerse}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            ) : null}

            {verses.length === 0 ? (
              <div className="rounded-lg border border-surface-secondary bg-surface-secondary/20 py-10 text-center text-sm text-text-secondary">
                Belum ada ayat pada bab ini.
              </div>
            ) : (
              verses.map((verse) => (
                <article
                  key={verse.id}
                  className="rounded-lg border border-surface-secondary bg-surface-secondary/20 p-3"
                >
                  {editingVerseId === verse.id ? (
                    <form onSubmit={(event) => void handleEditSubmit(event, verse)}>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                            Ayat
                          </span>
                          <input
                            type="number"
                            value={String(verse.verse_number)}
                            disabled
                            className="w-full rounded-lg border border-surface-secondary bg-surface-secondary/40 px-3 py-2 text-sm text-text-secondary"
                          />
                        </label>
                        <label className="block md:col-span-2">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                            Perikop (opsional)
                          </span>
                          <input
                            type="text"
                            value={editPericope}
                            onChange={(event) => setEditPericope(event.target.value)}
                            className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
                          />
                        </label>
                      </div>
                      <label className="mt-2 block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                          Teks Ayat
                        </span>
                        <textarea
                          value={editText}
                          onChange={(event) => setEditText(event.target.value)}
                          onKeyDown={submitOnMetaEnter}
                          className="min-h-[110px] w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
                        />
                      </label>
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingVerseId(null)}
                          className="inline-flex items-center gap-1 rounded-lg border border-surface-secondary px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-secondary/60"
                        >
                          <X size={14} />
                          Batal
                        </button>
                        <button
                          type="submit"
                          disabled={savingKey === verse.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-action px-2.5 py-1.5 text-xs font-semibold text-text-inverse hover:bg-action/90 disabled:opacity-60"
                        >
                          {savingKey === verse.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Save size={14} />
                          )}
                          Simpan
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      {verse.pericope ? (
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-action">
                          {verse.pericope}
                        </p>
                      ) : null}
                      <p className="text-sm leading-relaxed text-text-primary">
                        <span className="mr-2 font-bold text-action">{verse.verse_number}</span>
                        {verse.text}
                      </p>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(verse)}
                          className="inline-flex items-center gap-1 rounded-lg border border-surface-secondary px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-secondary/60"
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={deletingVerseId === verse.id}
                          onClick={() => void handleDelete(verse)}
                          className="inline-flex items-center gap-1 rounded-lg border border-status-error/30 px-2.5 py-1.5 text-xs font-semibold text-status-error hover:bg-status-error/10 disabled:opacity-60"
                        >
                          {deletingVerseId === verse.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                          Hapus
                        </button>
                      </div>
                    </>
                  )}
                </article>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
