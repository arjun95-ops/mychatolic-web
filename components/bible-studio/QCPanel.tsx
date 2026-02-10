"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  AUTO_MISSING_PLACEHOLDER_PREFIX,
  type VerseItem,
} from "@/components/bible-studio/types";
import {
  getKnownExpectedMaxReferenceLabel,
  getKnownExpectedMaxVerse,
} from "@/components/bible-studio/qc-reference";
import { parsePositiveInt } from "@/lib/bible-admin";

type QCPanelProps = {
  lang: string;
  version: string;
  selectedBookName: string | null;
  selectedChapter: number;
  verses: VerseItem[];
  chapterExists: boolean;
  onOpenPreview: () => void;
};

function computeMissingVerses(existingVerseSet: Set<number>, maxVerse: number): number[] {
  if (maxVerse <= 0) return [];
  const missing: number[] = [];
  for (let i = 1; i <= maxVerse; i += 1) {
    if (!existingVerseSet.has(i)) missing.push(i);
  }
  return missing;
}

type QcMode = "basic" | "strict";

export default function QCPanel({
  lang,
  version,
  selectedBookName,
  selectedChapter,
  verses,
  chapterExists,
  onOpenPreview,
}: QCPanelProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<QcMode>("strict");
  const [strictTargetOverrideByScope, setStrictTargetOverrideByScope] = useState<
    Record<string, string>
  >({});

  const sortedVerses = useMemo(
    () => [...verses].sort((a, b) => a.verse_number - b.verse_number),
    [verses],
  );
  const maxVerse = useMemo(
    () => sortedVerses.reduce((max, item) => Math.max(max, item.verse_number), 0),
    [sortedVerses],
  );

  const placeholderVerses = useMemo(
    () =>
      sortedVerses.filter((verse) => verse.text.startsWith(AUTO_MISSING_PLACEHOLDER_PREFIX)),
    [sortedVerses],
  );
  const placeholderVerseSet = useMemo(
    () => new Set(placeholderVerses.map((verse) => verse.verse_number)),
    [placeholderVerses],
  );

  const existingNonPlaceholderSet = useMemo(
    () =>
      new Set(
        sortedVerses
          .filter((verse) => !verse.text.startsWith(AUTO_MISSING_PLACEHOLDER_PREFIX))
          .map((verse) => verse.verse_number),
      ),
    [sortedVerses],
  );

  const basicMissing = useMemo(
    () => computeMissingVerses(existingNonPlaceholderSet, maxVerse),
    [existingNonPlaceholderSet, maxVerse],
  );

  const knownExpectedMax = useMemo(() => {
    if (!selectedBookName || !selectedChapter) return null;
    return getKnownExpectedMaxVerse({
      lang,
      version,
      bookName: selectedBookName,
      chapter: selectedChapter,
    });
  }, [lang, selectedBookName, selectedChapter, version]);

  const knownReferenceLabel = useMemo(
    () => getKnownExpectedMaxReferenceLabel({ lang, version }),
    [lang, version],
  );

  const scopeKey = `${lang}:${version}:${selectedBookName || "-"}:${selectedChapter}`;
  const defaultStrictTargetInput = knownExpectedMax
    ? String(knownExpectedMax)
    : maxVerse > 0
      ? String(maxVerse)
      : "1";
  const strictTargetInput = strictTargetOverrideByScope[scopeKey] ?? defaultStrictTargetInput;

  const strictTarget = useMemo(() => {
    const parsed = parsePositiveInt(strictTargetInput);
    if (parsed) return parsed;
    if (knownExpectedMax) return knownExpectedMax;
    return maxVerse;
  }, [knownExpectedMax, maxVerse, strictTargetInput]);

  const strictMissing = useMemo(
    () => computeMissingVerses(existingNonPlaceholderSet, strictTarget),
    [existingNonPlaceholderSet, strictTarget],
  );

  const activeMissing = mode === "strict" ? strictMissing : basicMissing;

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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-surface-secondary bg-surface-secondary/20 p-3">
          <p className="text-xs uppercase tracking-wide text-text-secondary">Ayat Total</p>
          <p className="mt-1 text-xl font-bold text-text-primary">{verses.length}</p>
        </div>
        <div className="rounded-xl border border-surface-secondary bg-surface-secondary/20 p-3">
          <p className="text-xs uppercase tracking-wide text-text-secondary">Ayat Final</p>
          <p className="mt-1 text-xl font-bold text-text-primary">
            {Math.max(verses.length - placeholderVerses.length, 0)}
          </p>
        </div>
        <div className="rounded-xl border border-surface-secondary bg-surface-secondary/20 p-3">
          <p className="text-xs uppercase tracking-wide text-text-secondary">Placeholder</p>
          <p className="mt-1 text-xl font-bold text-status-pending">{placeholderVerses.length}</p>
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

      <section className="space-y-3 rounded-xl border border-surface-secondary p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Mode QC</h3>
          <div className="inline-flex rounded-lg border border-surface-secondary bg-surface-secondary/20 p-1">
            <button
              type="button"
              onClick={() => setMode("basic")}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${
                mode === "basic" ? "bg-action text-text-inverse" : "text-text-secondary"
              }`}
            >
              Basic
            </button>
            <button
              type="button"
              onClick={() => setMode("strict")}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${
                mode === "strict" ? "bg-action text-text-inverse" : "text-text-secondary"
              }`}
            >
              Strict
            </button>
          </div>
        </div>

        <p className="text-xs text-text-secondary">
          Basic: cek rentang 1..ayat terakhir yang ada. Strict: cek rentang 1..target akhir
          dan hitung placeholder sebagai gap.
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-surface-secondary bg-surface-secondary/20 p-3">
            <p className="text-xs uppercase tracking-wide text-text-secondary">Gap Basic</p>
            <p className="mt-1 text-lg font-bold text-status-error">{basicMissing.length}</p>
          </div>
          <div className="rounded-lg border border-surface-secondary bg-surface-secondary/20 p-3">
            <p className="text-xs uppercase tracking-wide text-text-secondary">Gap Strict</p>
            <p className="mt-1 text-lg font-bold text-status-error">{strictMissing.length}</p>
          </div>
          <label className="rounded-lg border border-surface-secondary bg-surface-primary p-3">
            <span className="text-xs uppercase tracking-wide text-text-secondary">
              Target Ayat Akhir (Strict)
            </span>
            <input
              type="number"
              min={1}
              value={strictTargetInput}
              onChange={(event) => {
                const nextValue = event.target.value;
                setStrictTargetOverrideByScope((prev) => ({
                  ...prev,
                  [scopeKey]: nextValue,
                }));
              }}
              className="mt-1 w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-1.5 text-sm outline-none focus:border-action"
            />
          </label>
        </div>

        {knownExpectedMax ? (
          <p className="rounded-lg border border-status-success/30 bg-status-success/10 px-3 py-2 text-xs text-status-success">
            Referensi otomatis tersedia: ayat akhir {knownExpectedMax} (sumber:{" "}
            {knownReferenceLabel || "local reference"}).
          </p>
        ) : (
          <p className="rounded-lg border border-status-pending/30 bg-status-pending/10 px-3 py-2 text-xs text-status-pending">
            Referensi otomatis tidak tersedia untuk kitab/bab ini. Isi target ayat akhir secara
            manual untuk strict check.
          </p>
        )}

        {strictTarget > maxVerse ? (
          <p className="text-xs text-text-secondary">
            Strict mode memakai target ayat akhir {strictTarget} (data saat ini berakhir di ayat{" "}
            {maxVerse}).
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-surface-secondary p-4">
        <h3 className="text-sm font-semibold text-text-primary">
          Daftar Gap Ayat ({mode === "strict" ? "Strict" : "Basic"})
        </h3>
        {activeMissing.length === 0 ? (
          <p className="mt-2 text-sm text-status-success">
            Tidak ada gap pada mode {mode === "strict" ? "strict" : "basic"}.
          </p>
        ) : (
          <p className="mt-2 text-sm text-status-error">Gap: {activeMissing.join(", ")}</p>
        )}
      </section>

      <section className="rounded-xl border border-surface-secondary p-4">
        <h3 className="text-sm font-semibold text-text-primary">Placeholder Ayat</h3>
        {placeholderVerses.length === 0 ? (
          <p className="mt-2 text-sm text-status-success">Tidak ada placeholder.</p>
        ) : (
          <p className="mt-2 text-sm text-status-pending">
            Placeholder terdeteksi di ayat: {placeholderVerses.map((item) => item.verse_number).join(", ")}
          </p>
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
                      {placeholderVerseSet.has(verse.verse_number) ? (
                        <span className="mr-2 rounded bg-status-pending/20 px-1.5 py-0.5 text-xs font-semibold text-status-pending">
                          placeholder
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
