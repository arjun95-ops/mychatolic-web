"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenText, Search } from "lucide-react";
import {
  CATEGORY_OPTIONS,
  GROUPING_LABELS,
  type BookItem,
  type ChapterItem,
  type StudioCategory,
  type WorkspaceOption,
} from "@/components/bible-studio/types";
import { parsePositiveInt } from "@/lib/bible-admin";

type NavigatorProps = {
  workspaceOptions: WorkspaceOption[];
  activeWorkspaceKey: string;
  onWorkspaceChange: (workspaceKey: string) => void;
  category: StudioCategory;
  onCategoryChange: (next: StudioCategory) => void;
  bookSearch: string;
  onBookSearchChange: (value: string) => void;
  books: BookItem[];
  booksLoading: boolean;
  booksDebugHint?: string | null;
  selectedBookId: string | null;
  onSelectBook: (bookId: string) => void;
  chapters: ChapterItem[];
  chaptersLoading: boolean;
  selectedChapter: number;
  verseCount: number;
  missingCount: number;
  chapterExists: boolean;
  onSelectChapter: (chapterNumber: number) => void;
};

function chapterStatusLabel(chapterExists: boolean, verseCount: number, missingCount: number): string {
  if (!chapterExists || verseCount === 0) return "Bab kosong";
  if (missingCount > 0) return `Ada gap (${missingCount})`;
  return "Bab terisi";
}

export default function Navigator({
  workspaceOptions,
  activeWorkspaceKey,
  onWorkspaceChange,
  category,
  onCategoryChange,
  bookSearch,
  onBookSearchChange,
  books,
  booksLoading,
  booksDebugHint,
  selectedBookId,
  onSelectBook,
  chapters,
  chaptersLoading,
  selectedChapter,
  verseCount,
  missingCount,
  chapterExists,
  onSelectChapter,
}: NavigatorProps) {
  const [chapterInput, setChapterInput] = useState(String(selectedChapter));

  useEffect(() => {
    setChapterInput(String(selectedChapter));
  }, [selectedChapter]);

  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId) || null,
    [books, selectedBookId],
  );

  return (
    <section className="space-y-4 rounded-2xl border border-surface-secondary bg-surface-primary p-4 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Workspace</p>
        <select
          value={activeWorkspaceKey}
          onChange={(event) => onWorkspaceChange(event.target.value)}
          className="mt-1 w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
        >
          {workspaceOptions.map((workspace) => (
            <option
              key={`${workspace.lang}:${workspace.version}`}
              value={`${workspace.lang}:${workspace.version}`}
            >
              {workspace.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Kategori Kitab</p>
        <div className="mt-2 grid grid-cols-1 gap-2">
          {CATEGORY_OPTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onCategoryChange(item)}
              className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
                category === item
                  ? "border-action bg-action text-text-inverse"
                  : "border-surface-secondary bg-surface-secondary/30 text-text-secondary hover:bg-surface-secondary/70 hover:text-text-primary"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="relative block">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            type="text"
            value={bookSearch}
            onChange={(event) => onBookSearchChange(event.target.value)}
            placeholder="Cari kitab..."
            className="w-full rounded-lg border border-surface-secondary bg-surface-primary py-2 pl-9 pr-3 text-sm outline-none focus:border-action"
          />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Kitab ({books.length})
        </p>
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {booksLoading ? (
            <p className="rounded-lg border border-surface-secondary bg-surface-secondary/20 px-3 py-4 text-sm text-text-secondary">
              Memuat kitab...
            </p>
          ) : books.length === 0 ? (
            <div className="space-y-2">
              <p className="rounded-lg border border-surface-secondary bg-surface-secondary/20 px-3 py-4 text-sm text-text-secondary">
                Tidak ada kitab pada filter ini.
              </p>
              {booksDebugHint ? (
                <p className="rounded-lg border border-status-pending/30 bg-status-pending/10 px-3 py-2 text-xs text-status-pending">
                  {booksDebugHint}
                </p>
              ) : null}
            </div>
          ) : (
            books.map((book) => {
              const active = selectedBookId === book.id;
              return (
                <button
                  key={book.id}
                  type="button"
                  onClick={() => onSelectBook(book.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                    active
                      ? "border-action bg-action/10"
                      : "border-surface-secondary bg-surface-secondary/20 hover:bg-surface-secondary/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        {book.order_index}. {book.name}
                      </p>
                      <p className="text-xs text-text-secondary">{book.abbreviation || "-"}</p>
                    </div>
                    <span className="rounded bg-brand-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-primary">
                      {GROUPING_LABELS[book.grouping]}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-surface-secondary bg-surface-secondary/20 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-text-primary">
            {selectedBook ? `Bab ${selectedBook.name}` : "Bab"}
          </p>
          <span className="rounded bg-surface-primary px-2 py-0.5 text-xs font-semibold text-text-secondary">
            {chapterStatusLabel(chapterExists, verseCount, missingCount)}
          </span>
        </div>

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
            onClick={() => {
              const chapterNumber = parsePositiveInt(chapterInput);
              if (chapterNumber) onSelectChapter(chapterNumber);
            }}
            className="rounded-lg border border-surface-secondary px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-secondary/60"
          >
            Buka
          </button>
        </div>

        <div className="grid max-h-44 grid-cols-6 gap-1 overflow-y-auto">
          {chaptersLoading ? (
            <p className="col-span-6 text-xs text-text-secondary">Memuat bab...</p>
          ) : chapters.length === 0 ? (
            <p className="col-span-6 text-xs text-text-secondary">
              Belum ada bab. Simpan ayat untuk membuat bab otomatis.
            </p>
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

      <div className="rounded-xl border border-action/30 bg-action/5 p-3 text-xs text-text-secondary">
        <p className="font-semibold text-text-primary">Workflow Studio</p>
        <p className="mt-1 inline-flex items-center gap-1">
          <BookOpenText size={13} />
          Workspace → Kitab → Bab → Ayat/Perikop/QC.
        </p>
      </div>
    </section>
  );
}
