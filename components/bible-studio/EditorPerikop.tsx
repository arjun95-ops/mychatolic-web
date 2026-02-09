"use client";

import { FormEvent, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { VerseItem } from "@/components/bible-studio/types";
import { parsePositiveInt } from "@/lib/bible-admin";

type PericopeEntry = {
  startVerse: number;
  endVerse: number;
  title: string;
};

type EditorPerikopProps = {
  lang: string;
  version: string;
  selectedBookId: string | null;
  selectedChapter: number;
  verses: VerseItem[];
  onRefresh: () => Promise<void>;
};

function extractMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}

export default function EditorPerikop({
  lang,
  version,
  selectedBookId,
  selectedChapter,
  verses,
  onRefresh,
}: EditorPerikopProps) {
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [startVerse, setStartVerse] = useState("");
  const [endVerse, setEndVerse] = useState("");
  const [saving, setSaving] = useState(false);

  const maxVerse = useMemo(
    () => verses.reduce((max, verse) => Math.max(max, verse.verse_number), 0),
    [verses],
  );

  const pericopeEntries = useMemo<PericopeEntry[]>(() => {
    const starts = verses
      .filter((verse) => Boolean(verse.pericope))
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedBookId) return;

    const start = parsePositiveInt(startVerse);
    const end = parsePositiveInt(endVerse);
    if (!title.trim()) {
      showToast("Judul perikop wajib diisi.", "error");
      return;
    }
    if (!start || !end) {
      showToast("startVerse dan endVerse harus angka bulat positif.", "error");
      return;
    }
    if (end < start) {
      showToast("endVerse tidak boleh lebih kecil dari startVerse.", "error");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/bible/pericopes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language_code: lang,
          version_code: version,
          book_id: selectedBookId,
          chapter_number: selectedChapter,
          title: title.trim(),
          start_verse: start,
          end_verse: end,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(extractMessage(result, `Gagal menyimpan perikop (${response.status}).`));
      }

      showToast(result.message || "Perikop berhasil disimpan.", "success");
      setTitle("");
      setStartVerse("");
      setEndVerse("");
      await onRefresh();
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  if (!selectedBookId) {
    return (
      <div className="rounded-xl border border-surface-secondary bg-surface-secondary/20 p-6 text-sm text-text-secondary">
        Pilih kitab dan bab terlebih dahulu.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-surface-secondary p-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Set Perikop (Range)</h3>
          <p className="text-xs text-text-secondary">
            Title disimpan hanya di ayat awal, ayat lain dalam range akan dikosongkan field perikop-nya.
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Title
          </span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
            placeholder="Contoh: Khotbah di Bukit"
            required
          />
        </label>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              startVerse
            </span>
            <input
              type="number"
              min={1}
              value={startVerse}
              onChange={(event) => setStartVerse(event.target.value)}
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              endVerse
            </span>
            <input
              type="number"
              min={1}
              value={endVerse}
              onChange={(event) => setEndVerse(event.target.value)}
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
              required
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-text-inverse hover:bg-action/90 disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? "Menyimpan..." : "Simpan Perikop"}
        </button>
      </form>

      <section className="rounded-xl border border-surface-secondary p-4">
        <h3 className="text-sm font-semibold text-text-primary">Daftar Perikop Bab Ini</h3>
        {pericopeEntries.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">Belum ada perikop.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {pericopeEntries.map((item) => (
              <div
                key={`${item.startVerse}-${item.title}`}
                className="flex flex-col gap-2 rounded-lg border border-surface-secondary bg-surface-secondary/20 px-3 py-2 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                  <p className="text-xs text-text-secondary">
                    Ayat {item.startVerse} - {item.endVerse}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTitle(item.title);
                    setStartVerse(String(item.startVerse));
                    setEndVerse(String(item.endVerse));
                  }}
                  className="inline-flex items-center justify-center rounded-lg border border-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-secondary/60"
                >
                  Edit
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
