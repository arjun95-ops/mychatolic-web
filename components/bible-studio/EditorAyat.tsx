"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Loader2, Save, WandSparkles } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { VerseItem } from "@/components/bible-studio/types";
import { parsePositiveInt } from "@/lib/bible-admin";

type EditorAyatProps = {
  lang: string;
  version: string;
  selectedBookId: string | null;
  selectedChapter: number;
  verses: VerseItem[];
  onRefresh: () => Promise<void>;
};

type BatchPreviewRow = {
  verseNumber: number;
  text: string;
  exists: boolean;
};

function extractMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}

function parseBatchLines(input: string): string[] {
  return input
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function EditorAyat({
  lang,
  version,
  selectedBookId,
  selectedChapter,
  verses,
  onRefresh,
}: EditorAyatProps) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<"single" | "batch">("single");

  const maxVerse = useMemo(
    () => verses.reduce((max, item) => Math.max(max, item.verse_number), 0),
    [verses],
  );
  const nextVerse = Math.max(maxVerse + 1, 1);
  const existingVerseSet = useMemo(() => new Set(verses.map((item) => item.verse_number)), [verses]);

  const [singleVerseNumber, setSingleVerseNumber] = useState(String(nextVerse));
  const [singleText, setSingleText] = useState("");
  const [singlePericope, setSinglePericope] = useState("");
  const [singleSaving, setSingleSaving] = useState(false);

  const [batchStartVerse, setBatchStartVerse] = useState(String(nextVerse));
  const [batchText, setBatchText] = useState("");
  const [batchPreviewVisible, setBatchPreviewVisible] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  useEffect(() => {
    if (!singleText.trim()) setSingleVerseNumber(String(nextVerse));
    if (!batchText.trim()) setBatchStartVerse(String(nextVerse));
  }, [batchText, nextVerse, singleText]);

  const batchLines = useMemo(() => parseBatchLines(batchText), [batchText]);
  const batchStartNumber = parsePositiveInt(batchStartVerse);
  const batchPreviewRows: BatchPreviewRow[] = useMemo(() => {
    if (!batchStartNumber) return [];
    return batchLines.map((line, index) => {
      const verseNumber = batchStartNumber + index;
      return {
        verseNumber,
        text: line,
        exists: existingVerseSet.has(verseNumber),
      };
    });
  }, [batchLines, batchStartNumber, existingVerseSet]);

  const skippedIfNoOverwrite = useMemo(
    () => batchPreviewRows.filter((row) => row.exists).map((row) => row.verseNumber),
    [batchPreviewRows],
  );

  const handleSingleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedBookId) return;

    const verseNumber = parsePositiveInt(singleVerseNumber);
    if (!verseNumber) {
      showToast("verse_number harus angka bulat positif.", "error");
      return;
    }
    if (!singleText.trim()) {
      showToast("Teks ayat wajib diisi.", "error");
      return;
    }

    setSingleSaving(true);
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
          text: singleText.trim(),
          pericope: singlePericope.trim() || null,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(extractMessage(result, `Gagal menyimpan ayat (${response.status}).`));
      }

      showToast(result.message || "Ayat tersimpan.", "success");
      setSingleText("");
      setSinglePericope("");
      setSingleVerseNumber(String(verseNumber + 1));
      await onRefresh();
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
    } finally {
      setSingleSaving(false);
    }
  };

  const handleBatchSave = async () => {
    if (!selectedBookId) return;
    if (!batchStartNumber) {
      showToast("startVerse harus angka bulat positif.", "error");
      return;
    }
    if (batchLines.length === 0) {
      showToast("Isi minimal satu baris ayat.", "error");
      return;
    }

    setBatchSaving(true);
    try {
      const response = await fetch("/api/admin/bible/verses/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language_code: lang,
          version_code: version,
          book_id: selectedBookId,
          chapter_number: selectedChapter,
          start_verse: batchStartNumber,
          lines: batchLines,
          overwrite: overwriteExisting,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        inserted_or_updated?: number;
        skipped_existing?: number;
        failed_count?: number;
      };
      if (!response.ok) {
        throw new Error(extractMessage(result, `Gagal menyimpan batch (${response.status}).`));
      }

      const updatedCount = Number(result.inserted_or_updated || 0);
      const skippedCount = Number(result.skipped_existing || 0);
      const failedCount = Number(result.failed_count || 0);
      showToast(
        result.message ||
          `Batch selesai. Tersimpan ${updatedCount}, skip ${skippedCount}, gagal ${failedCount}.`,
        failedCount > 0 ? "error" : "success",
      );

      setBatchText("");
      setBatchPreviewVisible(false);
      await onRefresh();
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
    } finally {
      setBatchSaving(false);
    }
  };

  if (!selectedBookId) {
    return (
      <div className="rounded-xl border border-surface-secondary bg-surface-secondary/20 p-6 text-sm text-text-secondary">
        Pilih kitab dan bab dari navigator untuk mulai input ayat.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-surface-secondary bg-surface-secondary/30 p-1">
        <button
          type="button"
          onClick={() => setMode("single")}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
            mode === "single" ? "bg-action text-text-inverse" : "text-text-secondary"
          }`}
        >
          Single
        </button>
        <button
          type="button"
          onClick={() => setMode("batch")}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
            mode === "batch" ? "bg-action text-text-inverse" : "text-text-secondary"
          }`}
        >
          Batch Paste
        </button>
      </div>

      {mode === "single" ? (
        <form onSubmit={handleSingleSubmit} className="space-y-3 rounded-xl border border-surface-secondary p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                verse_number
              </span>
              <input
                type="number"
                min={1}
                value={singleVerseNumber}
                onChange={(event) => setSingleVerseNumber(event.target.value)}
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
                value={singlePericope}
                onChange={(event) => setSinglePericope(event.target.value)}
                placeholder="Contoh: Yesus Memberi Makan Lima Ribu Orang"
                className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Text
            </span>
            <textarea
              value={singleText}
              onChange={(event) => setSingleText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  const form = event.currentTarget.form;
                  form?.requestSubmit();
                }
              }}
              className="min-h-[140px] w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
              placeholder="Teks ayat..."
              required
            />
          </label>

          <button
            type="submit"
            disabled={singleSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-text-inverse hover:bg-action/90 disabled:opacity-60"
          >
            {singleSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {singleSaving ? "Menyimpan..." : "Simpan & Next"}
          </button>
        </form>
      ) : (
        <section className="space-y-4 rounded-xl border border-surface-secondary p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                startVerse
              </span>
              <input
                type="number"
                min={1}
                value={batchStartVerse}
                onChange={(event) => setBatchStartVerse(event.target.value)}
                className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
              />
            </label>
            <label className="flex items-end gap-2 md:col-span-2">
              <input
                type="checkbox"
                checked={overwriteExisting}
                onChange={(event) => setOverwriteExisting(event.target.checked)}
                className="h-4 w-4 rounded border-surface-secondary"
              />
              <span className="text-sm text-text-secondary">Overwrite existing verses</span>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Textarea Batch (1 baris = 1 ayat)
            </span>
            <textarea
              value={batchText}
              onChange={(event) => setBatchText(event.target.value)}
              className="min-h-[170px] w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
              placeholder={"Pada mulanya Allah menciptakan langit dan bumi.\nBumi belum berbentuk dan kosong..."}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setBatchPreviewVisible((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-lg border border-surface-secondary px-3 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-secondary/60"
            >
              <WandSparkles size={16} />
              {batchPreviewVisible ? "Sembunyikan Preview" : "Preview Mapping"}
            </button>
            <button
              type="button"
              onClick={() => void handleBatchSave()}
              disabled={batchSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-action px-3 py-2 text-sm font-semibold text-text-inverse hover:bg-action/90 disabled:opacity-60"
            >
              {batchSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {batchSaving ? "Menyimpan..." : "Simpan Batch"}
            </button>
          </div>

          {skippedIfNoOverwrite.length > 0 && !overwriteExisting ? (
            <p className="rounded-lg border border-status-pending/30 bg-status-pending/10 px-3 py-2 text-xs text-status-pending">
              Warning: ayat existing akan di-skip ({skippedIfNoOverwrite.join(", ")}).
            </p>
          ) : null}

          {batchPreviewVisible ? (
            <div className="overflow-x-auto rounded-lg border border-surface-secondary">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-secondary/60 text-xs uppercase tracking-wide text-text-secondary">
                  <tr>
                    <th className="px-3 py-2">Verse</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Text</th>
                  </tr>
                </thead>
                <tbody>
                  {batchPreviewRows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-text-secondary">
                        Belum ada mapping.
                      </td>
                    </tr>
                  ) : (
                    batchPreviewRows.slice(0, 300).map((row) => (
                      <tr key={`${row.verseNumber}-${row.text}`} className="border-t border-surface-secondary/70">
                        <td className="px-3 py-2 font-semibold text-text-primary">{row.verseNumber}</td>
                        <td className="px-3 py-2 text-xs">
                          {row.exists ? (
                            <span className="rounded bg-status-pending/20 px-2 py-0.5 font-semibold text-status-pending">
                              Existing
                            </span>
                          ) : (
                            <span className="rounded bg-status-success/20 px-2 py-0.5 font-semibold text-status-success">
                              New
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-text-primary">{row.text}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
