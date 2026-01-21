"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { BookOpen, ChevronRight, Bookmark, ArrowLeft, Search } from "lucide-react";
import Link from "next/link";

interface BibleBook {
    id: string;
    name: string;
    category: string;
    total_chapters?: number; // Optional, we can fetch count separately
}

interface BibleVerse {
    id: string;
    verse_number: number;
    text: string;
    pericope?: string;
}

export default function BiblePreviewPage() {
    const [selectedCategory, setSelectedCategory] = useState("Perjanjian Lama");
    const [books, setBooks] = useState<BibleBook[]>([]);
    const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null);
    const [chapters, setChapters] = useState<number[]>([]);
    const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
    const [verses, setVerses] = useState<BibleVerse[]>([]);
    const [loadingBooks, setLoadingBooks] = useState(false);
    const [loadingContent, setLoadingContent] = useState(false);

    // Fetch Books when category changes
    useEffect(() => {
        const fetchBooks = async () => {
            setLoadingBooks(true);
            setBooks([]);
            setSelectedBook(null);
            setChapters([]);

            try {
                const { data, error } = await supabase
                    .from('bible_books')
                    .select('id, name, category')
                    .eq('category', selectedCategory)
                    .order('book_order', { ascending: true }); // Assume sorting logic

                if (error) throw error;
                // If book_order is not reliable yet, sort by ID asc or Name (default DB sort)
                // For now, trusting the query order.
                setBooks(data || []);
            } catch (err) {
                console.error("Error fetching books", err);
            } finally {
                setLoadingBooks(false);
            }
        };

        fetchBooks();
    }, [selectedCategory]);

    // Fetch Chapters when Book is selected
    useEffect(() => {
        if (!selectedBook) return;

        const fetchChapters = async () => {
            // Count chapters? Using distinct count or max number
            // Easier: Select all chapters for book_id and list their numbers
            const { data, error } = await supabase
                .from('bible_chapters')
                .select('chapter_number')
                .eq('book_id', selectedBook.id)
                .order('chapter_number', { ascending: true });

            if (data) {
                const nums = data.map(c => c.chapter_number);
                setChapters(nums);
                // Auto-select first chapter if available and not set?
                // Let user pick.
                setSelectedChapter(null);
                setVerses([]);
            }
        };
        fetchChapters();
    }, [selectedBook]);

    // Fetch Verses when Chapter is selected
    useEffect(() => {
        if (!selectedBook || !selectedChapter) return;

        const fetchVerses = async () => {
            setLoadingContent(true);
            try {
                // 1. Get Chapter ID first
                const { data: chapData } = await supabase
                    .from('bible_chapters')
                    .select('id')
                    .eq('book_id', selectedBook.id)
                    .eq('chapter_number', selectedChapter)
                    .single();

                if (!chapData) return;

                // 2. Get Verses
                const { data: versesData, error } = await supabase
                    .from('bible_verses')
                    .select('id, verse_number, text, pericope')
                    .eq('chapter_id', chapData.id)
                    .order('verse_number', { ascending: true });

                if (error) throw error;
                setVerses(versesData || []);

            } catch (err) {
                console.error(err);
            } finally {
                setLoadingContent(false);
            }
        };

        fetchVerses();
    }, [selectedBook, selectedChapter]);

    const categories = ["Perjanjian Lama", "Perjanjian Baru", "Deuterokanonika"];

    return (
        <div className="flex h-screen overflow-hidden bg-white dark:bg-slate-950">
            {/* Sidebar (Navigation) */}
            <aside className="w-80 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50 dark:bg-slate-900 border-none">
                {/* Header */}
                <div className="h-16 flex items-center px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 gap-3">
                    <Link href="/dashboard/bible" className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <span className="font-bold text-slate-800 dark:text-white">Bible Reader</span>
                </div>

                {/* Tabs */}
                <div className="flex p-2 gap-1 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 overflow-x-auto scrollbar-hide">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${selectedCategory === cat
                                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                                    : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Books List (Filtered) */}
                <div className="flex-1 overflow-y-auto">
                    {loadingBooks ? (
                        <div className="p-8 text-center text-slate-400 text-sm">Loading books...</div>
                    ) : (
                        <div className="p-2 space-y-1">
                            {books.length === 0 && <div className="p-4 text-xs text-slate-400 text-center">Belum ada buku untuk kategori ini.</div>}
                            {books.map(book => (
                                <button
                                    key={book.id}
                                    onClick={() => setSelectedBook(book)}
                                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between group transition-all text-sm ${selectedBook?.id === book.id
                                            ? "bg-purple-600 text-white shadow-md shadow-purple-200 dark:shadow-purple-900/20"
                                            : "text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm"
                                        }`}
                                >
                                    <span className="font-medium">{book.name}</span>
                                    {selectedBook?.id === book.id && <ChevronRight className="w-4 h-4 opacity-80" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Chapter Grid (If Book Selected) */}
                {selectedBook && (
                    <div className="h-48 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex flex-col">
                        <div className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/50">
                            Chapters ({chapters.length})
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            <div className="grid grid-cols-5 gap-2">
                                {chapters.map(num => (
                                    <button
                                        key={num}
                                        onClick={() => setSelectedChapter(num)}
                                        className={`h-8 rounded-lg text-xs font-bold flex items-center justify-center transition-all ${selectedChapter === num
                                                ? "bg-purple-600 text-white shadow-sm"
                                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600"
                                            }`}
                                    >
                                        {num}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </aside>

            {/* Reading Pane */}
            <main className="flex-1 h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 scroll-smooth">
                {!selectedBook || !selectedChapter ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center max-w-sm mx-auto">
                        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-900 rounded-full flex items-center justify-center mb-4">
                            <BookOpen className="w-8 h-8 text-slate-300" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">Pilih Bacaan</h3>
                        <p className="text-sm">Silakan pilih Kitab dan Pasal dari menu sebelah kiri untuk mulai membaca.</p>
                    </div>
                ) : (
                    <div className="max-w-3xl mx-auto py-12 px-8 min-h-full bg-white dark:bg-slate-950 shadow-sm md:border-x border-slate-100 dark:border-slate-900">
                        {/* Header Title */}
                        <div className="mb-10 text-center border-b border-double border-slate-200 dark:border-slate-800 pb-8">
                            <h1 className="text-4xl font-serif font-bold text-slate-900 dark:text-white mb-2">
                                {selectedBook.name}
                            </h1>
                            <span className="text-xl font-serif italic text-slate-500 dark:text-slate-400 block">
                                Pasal {selectedChapter}
                            </span>
                        </div>

                        {/* Content */}
                        {loadingContent ? (
                            <div className="space-y-4 animate-pulse">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="flex gap-4">
                                        <div className="w-4 h-4 rounded bg-slate-200 dark:bg-slate-800 mt-1 shrink-0"></div>
                                        <div className="h-4 bg-slate-200 dark:bg-slate-800 w-full rounded"></div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-6 text-lg leading-relaxed font-serif text-slate-800 dark:text-slate-300">
                                {verses.length === 0 && (
                                    <div className="text-center text-slate-400 italic py-10">Ayat belum tersedia.</div>
                                )}
                                {verses.map((verse) => (
                                    <div key={verse.id}>
                                        {/* Pericope Section Header */}
                                        {verse.pericope && (
                                            <h3 className="text-xl font-sans font-bold text-slate-900 dark:text-white mt-10 mb-4 tracking-tight">
                                                {verse.pericope}
                                            </h3>
                                        )}

                                        {/* Verse Text */}
                                        <div className="relative pl-0 group">
                                            <span className="absolute -left-8 top-1 text-xs font-sans font-bold text-purple-600/50 w-6 text-right select-none">
                                                {verse.verse_number}
                                            </span>
                                            <span className="align-baseline">
                                                {verse.text}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Footer Nav Hint */}
                        <div className="mt-20 pt-10 border-t border-slate-100 dark:border-slate-900 flex justify-between text-sm text-slate-400 font-sans">
                            <button
                                onClick={() => {
                                    /* Logic for prev chapter */
                                    const idx = chapters.indexOf(selectedChapter);
                                    if (idx > 0) setSelectedChapter(chapters[idx - 1]);
                                }}
                                disabled={chapters.indexOf(selectedChapter) === 0}
                                className="hover:text-purple-600 disabled:opacity-0 transition-colors cursor-pointer"
                            >
                                &larr; Pasal Sebelumnya
                            </button>
                            <button
                                onClick={() => {
                                    /* Logic for next chapter */
                                    const idx = chapters.indexOf(selectedChapter);
                                    if (idx < chapters.length - 1) setSelectedChapter(chapters[idx + 1]);
                                }}
                                disabled={chapters.indexOf(selectedChapter) === chapters.length - 1}
                                className="hover:text-purple-600 disabled:opacity-0 transition-colors cursor-pointer"
                            >
                                Pasal Selanjutnya &rarr;
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
