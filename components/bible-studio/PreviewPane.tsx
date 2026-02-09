"use client";

import { BookOpenText, Loader2 } from "lucide-react";
import type { ChapterItem, VerseItem } from "@/components/bible-studio/types";

type PreviewPaneProps = {
  workspaceLabel: string;
  bookName: string | null;
  chapters: ChapterItem[];
  selectedChapter: number;
  onSelectChapter: (chapterNumber: number) => void;
  verses: VerseItem[];
  loading: boolean;
};

export default function PreviewPane({
  workspaceLabel,
  bookName,
  chapters,
  selectedChapter,
  onSelectChapter,
  verses,
  loading,
}: PreviewPaneProps) {
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
      </aside>

      <section className="rounded-xl border border-surface-secondary p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-text-primary">
              {bookName} {selectedChapter}
            </h3>
            <p className="text-xs text-text-secondary">Preview read-only (tidak mengubah data)</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded bg-action/10 px-2 py-1 text-xs font-semibold text-action">
            <BookOpenText size={14} />
            Reader
          </span>
        </div>

        {loading ? (
          <div className="py-10 text-center text-text-secondary">
            <Loader2 size={18} className="mx-auto animate-spin" />
          </div>
        ) : verses.length === 0 ? (
          <div className="rounded-lg border border-surface-secondary bg-surface-secondary/20 py-10 text-center text-sm text-text-secondary">
            Belum ada ayat pada bab ini.
          </div>
        ) : (
          <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
            {verses.map((verse) => (
              <article
                key={verse.id}
                className="rounded-lg border border-surface-secondary bg-surface-secondary/20 p-3"
              >
                {verse.pericope ? (
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-action">
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
