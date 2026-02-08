"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { BookOpen, ChevronRight, Bookmark, ArrowLeft, Search, ChevronLeft } from "lucide-react";
import Link from "next/link";

interface BibleBook {
    id: string;
    name: string;
    category: string;
    abbreviation: string;
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

    // Loading States
    const [loadingBooks, setLoadingBooks] = useState(false);
    const [loadingChapters, setLoadingChapters] = useState(false);
    const [loadingContent, setLoadingContent] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // 1. Fetch Books when category changes
    useEffect(() => {
        const fetchBooks = async () => {
            setLoadingBooks(true);
            setBooks([]);
            setSelectedBook(null);
            setChapters([]);
            setErrorMsg(null);

            try {
                let query = supabase
                    .from('bible_books')
                    .select('id, name, category, abbreviation')
                    .order('book_order', { ascending: true });

                if (selectedCategory) {
                    query = query.eq('category', selectedCategory);
                }

                const { data, error } = await query;

                if (error) throw error;
                setBooks(data || []);
            } catch (err: any) {
                console.error("Error fetching books:", err.message || err);
                setErrorMsg("Gagal memuat data kitab. Silakan coba lagi.");
            } finally {
                setLoadingBooks(false);
            }
        };

        fetchBooks();
    }, [selectedCategory]);

    // 2. Fetch Chapters when Book is selected
    useEffect(() => {
        if (!selectedBook) return;

        const fetchChapters = async () => {
            setLoadingChapters(true);
            try {
                const { data, error } = await supabase
                    .from('bible_chapters')
                    .select('chapter_number')
                    .eq('book_id', selectedBook.id)
                    .order('chapter_number', { ascending: true });

                if (error) throw error;

                if (data) {
                    const nums = data.map(c => c.chapter_number);
                    setChapters(nums);
                    // Reset selection
                    setSelectedChapter(null);
                    setVerses([]);
                }
            } catch (err) {
                console.error("Error fetching chapters", err);
            } finally {
                setLoadingChapters(false);
            }
        };
        fetchChapters();
    }, [selectedBook]);

    // 3. Fetch Verses when Chapter is selected
    useEffect(() => {
        if (!selectedBook || !selectedChapter) return;

        const fetchVerses = async () => {
            setLoadingContent(true);
            try {
                // Get Chapter ID first
                const { data: chapData } = await supabase
                    .from('bible_chapters')
                    .select('id')
                    .eq('book_id', selectedBook.id)
                    .eq('chapter_number', selectedChapter)
                    .single();

                if (!chapData) return;

                // Get Verses
                const { data: versesData, error } = await supabase
                    .from('bible_verses')
                    .select('id, verse_number, text, pericope')
                    .eq('chapter_id', chapData.id)
                    .order('verse_number', { ascending: true });

                if (error) throw error;
                setVerses(versesData || []);

            } catch (err) {
                console.error("Error fetching verses", err);
            } finally {
                setLoadingContent(false);
            }
        };

        fetchVerses();
    }, [selectedBook, selectedChapter]);

    const categories = ["Perjanjian Lama", "Perjanjian Baru", "Deuterokanonika"];

    const handleNextChapter = () => {
        if (!selectedChapter) return;
        const idx = chapters.indexOf(selectedChapter);
        if (idx < chapters.length - 1) {
            setSelectedChapter(chapters[idx + 1]);
        }
    };

    const handlePrevChapter = () => {
        if (!selectedChapter) return;
        const idx = chapters.indexOf(selectedChapter);
        if (idx > 0) {
            setSelectedChapter(chapters[idx - 1]);
        }
    };

    return (
        <div className="flex h-[calc(100vh-theme(spacing.4))] overflow-hidden bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            {/* Sidebar (Navigation) */}
            <aside className="w-80 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden">
                {/* Header */}
                <div className="h-16 flex items-center px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 gap-3">
                    <Link href="/dashboard/bible" className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <span className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-purple-600" />
                        Pustaka Alkitab
                    </span>
                </div>

                {/* Categories Tabs */}
                <div className="flex p-2 gap-1 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 overflow-x-auto scrollbar-hide">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors border ${selectedCategory === cat
                                ? "bg-brand-primary/10 border-brand-primary/20 text-brand-primary dark:bg-brand-primary/30 dark:border-brand-primary/30 dark:text-brand-primary"
                                : "bg-transparent border-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Books List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {errorMsg ? (
                        <div className="p-4 text-center">
                            <p className="text-red-500 text-xs mb-2">{errorMsg}</p>
                            <button
                                onClick={() => window.location.reload()}
                                className="text-xs text-blue-500 hover:underline"
                            >
                                Reload Halaman
                            </button>
                        </div>
                    ) : loadingBooks ? (
                        <div className="p-8 flex justify-center">
                            <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : (
                        <div className="p-2 space-y-1">
                            {books.length === 0 && <div className="p-4 text-xs text-slate-400 text-center italic">Tidak ada buku ditemukan.</div>}
                            {books.map(book => (
                                <button
                                    key={book.id}
                                    onClick={() => setSelectedBook(book)}
                                    className={`w-full text-left px-4 py-3 rounded-lg flex items-center justify-between group transition-all text-sm ${selectedBook?.id === book.id
                                        ? "bg-brand-primary text-white shadow-md shadow-brand-primary/20 dark:shadow-brand-primary/20"
                                        : "text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm"
                                        }`}
                                >
                                    <span className="font-medium truncate">{book.name}</span>
                                    {selectedBook?.id === book.id && <ChevronRight className="w-4 h-4 opacity-80" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Chapter Selector (Bottom Panel) */}
                {selectedBook && (
                    <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex flex-col max-h-[40%]">
                        <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
                            <span>Pasal / Chapter</span>
                            <span className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 rounded">{chapters.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                            {loadingChapters ? (
                                <div className="text-center py-4 text-xs text-slate-400">Loading...</div>
                            ) : (
                                <div className="grid grid-cols-5 gap-2">
                                    {chapters.map(num => (
                                        <button
                                            key={num}
                                            onClick={() => setSelectedChapter(num)}
                                            className={`h-8 rounded-lg text-xs font-bold flex items-center justify-center transition-all border ${selectedChapter === num
                                                ? "bg-purple-600 text-white border-brand-primary shadow-sm"
                                                : "bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-primary/30 dark:hover:border-brand-primary/30 hover:text-brand-primary"
                                                }`}
                                        >
                                            {num}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </aside>

            {/* Reading Pane (Main Content) */}
            <main className="flex-1 h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 scroll-smooth relative">
                {!selectedBook || !selectedChapter ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center max-w-sm mx-auto">
                        <div className="w-20 h-20 bg-slate-100 dark:bg-slate-900 rounded-full flex items-center justify-center mb-6">
                            <BookOpen className="w-10 h-10 text-slate-300" />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">Mulai Membaca</h3>
                        <p className="text-sm leading-relaxed">
                            Pilih <span className="font-semibold text-slate-600 dark:text-slate-400">Kitab</span> dan <span className="font-semibold text-slate-600 dark:text-slate-400">Pasal</span> dari panel sebelah kiri untuk menampilkan ayat Alkitab.
                        </p>
                    </div>
                ) : (
                    <div className="max-w-4xl mx-auto py-12 px-8 md:px-12 min-h-full bg-white dark:bg-slate-950 shadow-sm border-x border-slate-100 dark:border-slate-900">
                        {/* Book Title Header */}
                        <div className="mb-12 text-center border-b-2 border-slate-100 dark:border-slate-900 pb-8">
                            <h1 className="text-4xl md:text-5xl font-serif font-extrabold text-slate-900 dark:text-white mb-3 tracking-tight">
                                {selectedBook.name}
                            </h1>
                            <span className="text-2xl font-serif italic text-slate-500 dark:text-slate-400 block">
                                Pasal {selectedChapter}
                            </span>
                        </div>

                        {/* Verses Content */}
                        {loadingContent ? (
                            <div className="space-y-6 animate-pulse max-w-2xl mx-auto">
                                {[1, 2, 3, 4, 5].map(i => (
                                    <div key={i} className="flex gap-4 items-start">
                                        <div className="w-4 h-4 rounded bg-slate-200 dark:bg-slate-800 mt-1 shrink-0"></div>
                                        <div className="space-y-2 w-full">
                                            <div className="h-4 bg-slate-200 dark:bg-slate-800 w-full rounded"></div>
                                            <div className="h-4 bg-slate-200 dark:bg-slate-800 w-[90%] rounded"></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-lg md:text-xl leading-8 md:leading-9 font-serif text-slate-800 dark:text-slate-300 max-w-3xl mx-auto text-justify">
                                {verses.length === 0 && (
                                    <div className="text-center text-slate-400 italic py-10 font-sans text-sm">Ayat belum tersedia untuk pasal ini.</div>
                                )}

                                {verses.map((verse, idx) => (
                                    <span key={verse.id} className="relative inline">
                                        {/* Pericope Section Header - Breaks the inline flow */}
                                        {verse.pericope && (
                                            <span className="block mt-8 mb-4">
                                                <h3 className="text-lg md:text-xl font-sans font-bold text-slate-900 dark:text-white tracking-tight border-l-4 border-brand-primary pl-4 py-1">
                                                    {verse.pericope}
                                                </h3>
                                            </span>
                                        )}

                                        {/* Verse Number & Text */}
                                        <span className="group">
                                            <sup className="text-[10px] md:text-xs font-sans font-bold text-brand-primary dark:text-brand-primary select-none mr-1 opacity-70 group-hover:opacity-100">
                                                {verse.verse_number}
                                            </sup>
                                            <span className={idx === verses.length - 1 ? "" : "mr-1"}>
                                                {verse.text}
                                            </span>
                                        </span>
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Footer Navigation */}
                        <div className="mt-24 pt-8 border-t border-slate-100 dark:border-slate-900 flex justify-between items-center text-sm font-sans">
                            <button
                                onClick={handlePrevChapter}
                                disabled={chapters.indexOf(selectedChapter) === 0}
                                className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-lg text-slate-600 dark:text-slate-400 hover:text-brand-primary dark:hover:text-brand-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                <div className="text-left">
                                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Sebelumnya</div>
                                    <div>Pasal {chapters[chapters.indexOf(selectedChapter) - 1]}</div>
                                </div>
                            </button>

                            <button
                                onClick={handleNextChapter}
                                disabled={chapters.indexOf(selectedChapter) === chapters.length - 1}
                                className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-lg text-slate-600 dark:text-slate-400 hover:text-brand-primary dark:hover:text-brand-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all text-right"
                            >
                                <div className="text-right">
                                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Selanjutnya</div>
                                    <div>Pasal {chapters[chapters.indexOf(selectedChapter) + 1]}</div>
                                </div>
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
