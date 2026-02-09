"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { VerseItem } from "@/components/bible-studio/types";

type QCPanelProps = {
  verses: VerseItem[];
  chapterExists: boolean;
  onOpenPreview: () => void;
};

function computeMissingVerses(verses: VerseItem[]): number[] {
  if (verses.length === 0) return [];
  const maxVerse = verses.reduce((max, item) => Math.max(max, item.verse_number), 0);
  const existing = new Set(verses.map((item) => item.verse_number));
  const missing: number[] = [];
  for (let i = 1; i <= maxVerse; i += 1) {
    if (!existing.has(i)) missing.push(i);
  }
  return missing;
}

export default function QCPanel({ verses, chapterExists, onOpenPreview }: QCPanelProps) {
  const [query, setQuery] = useState("");

  const sortedVerses = useMemo(
    () => [...verses].sort((a, b) => a.verse_number - b.verse_number),
    [verses],
  );
  const missing = useMemo(() => computeMissingVerses(sortedVerses), [sortedVerses]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return sortedVerses;
    return sortedVerses.filter((verse) => {
      const text = verse.text.toLowerCase();
      const pericope = (verse.pericope || "").toLowerCase();
      return text.includes(keyword) || pericope.includes(keyword);
    });
  }, [query, sortedVerses]);

  if (!chapterExists || verses.length === 0) {
    return (
      <div className="rounded-xl border border-surface-secondary bg-surface-secondary/20 p-6 text-sm text-text-secondary">
        Belum ada ayat pada bab ini, QC belum bisa dijalankan.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-surface-secondary bg-surface-secondary/20 p-3">
          <p className="text-xs uppercase tracking-wide text-text-secondary">Ayat Terisi</p>
          <p className="mt-1 text-xl font-bold text-text-primary">{verses.length}</p>
        </div>
        <div className="rounded-xl border border-surface-secondary bg-surface-secondary/20 p-3">
          <p className="text-xs uppercase tracking-wide text-text-secondary">Missing Gap</p>
          <p className="mt-1 text-xl font-bold text-status-error">{missing.length}</p>
        </div>
        <div className="rounded-xl border border-surface-secondary bg-surface-secondary/20 p-3">
          <p className="text-xs uppercase tracking-wide text-text-secondary">Aksi Cepat</p>
          <button
            type="button"
            onClick={onOpenPreview}
            className="mt-2 rounded-lg bg-action px-3 py-1.5 text-xs font-semibold text-text-inverse hover:bg-action/90"
          >
            Buka Preview
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-surface-secondary p-4">
        <h3 className="text-sm font-semibold text-text-primary">Daftar Gap Ayat</h3>
        {missing.length === 0 ? (
          <p className="mt-2 text-sm text-status-success">Tidak ada gap. Urutan ayat konsisten.</p>
        ) : (
          <p className="mt-2 text-sm text-status-error">Gap: {missing.join(", ")}</p>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-surface-secondary p-4">
        <label className="relative block">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari teks ayat/perikop dalam bab ini..."
            className="w-full rounded-lg border border-surface-secondary bg-surface-primary py-2 pl-9 pr-3 text-sm outline-none focus:border-action"
          />
        </label>

        <div className="flex flex-wrap gap-1.5">
          {sortedVerses.map((verse) => (
            <span
              key={verse.id}
              className="rounded bg-surface-secondary/60 px-2 py-0.5 text-xs font-semibold text-text-secondary"
            >
              {verse.verse_number}
            </span>
          ))}
        </div>

        <div className="max-h-72 overflow-y-auto rounded-lg border border-surface-secondary">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-secondary/60 text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-3 py-2">Ayat</th>
                <th className="px-3 py-2">Text</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-3 py-8 text-center text-text-secondary">
                    Tidak ada hasil.
                  </td>
                </tr>
              ) : (
                filtered.map((verse) => (
                  <tr key={verse.id} className="border-t border-surface-secondary/70 align-top">
                    <td className="px-3 py-2 font-semibold text-text-primary">{verse.verse_number}</td>
                    <td className="px-3 py-2 text-text-primary">
                      {verse.pericope ? (
                        <span className="mr-2 rounded bg-action/10 px-1.5 py-0.5 text-xs font-semibold text-action">
                          {verse.pericope}
                        </span>
                      ) : null}
                      {verse.text}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
