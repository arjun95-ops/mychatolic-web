"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { Save, BookOpen, Hash, AlignLeft, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface BibleBook {
    id: number;
    name: string;
    abbreviation: string;
}

export default function ManualEntryPage() {
    const { showToast } = useToast();
    const [books, setBooks] = useState<BibleBook[]>([]);
    const [selectedBookId, setSelectedBookId] = useState<string>("");
    const [chapter, setChapter] = useState<string>("");
    const [verseNumber, setVerseNumber] = useState<string>("");
    const [verseText, setVerseText] = useState<string>("");

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Fetch Bible Books
    useEffect(() => {
        const fetchBooks = async () => {
            try {
                const { data, error } = await supabase
                    .from('bible_books')
                    .select('*')
                    .order('id');

                if (error) throw error;
                setBooks(data || []);
            } catch (err: any) {
                console.error("Error fetching books:", err);
                showToast("Gagal mengambil data kitab", "error");
            } finally {
                setLoading(false);
            }
        };

        fetchBooks();
    }, [showToast]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedBookId || !chapter || !verseNumber || !verseText) {
            showToast("Semua field harus diisi!", "error");
            return;
        }

        setSaving(true);

        try {
            // 1. Get or Create Chapter ID
            let chapterId: number;

            // Check if chapter exists
            const { data: existingChapter, error: checkError } = await supabase
                .from('bible_chapters')
                .select('id')
                .eq('book_id', selectedBookId)
                .eq('chapter_number', chapter)
                .single(); // Use single() if we expect one, but check for error code PGRST116 (0 rows)

            if (checkError && checkError.code !== 'PGRST116') {
                throw checkError; // Real error
            }

            if (existingChapter) {
                chapterId = existingChapter.id;
            } else {
                // Insert new chapter
                const { data: newChapter, error: insertError } = await supabase
                    .from('bible_chapters')
                    .insert({
                        book_id: parseInt(selectedBookId),
                        chapter_number: parseInt(chapter)
                    })
                    .select()
                    .single();

                if (insertError) throw insertError;
                chapterId = newChapter.id;
            }

            // 2. Insert/Upsert Verse
            const { error: verseError } = await supabase
                .from('bible_verses')
                .upsert({
                    chapter_id: chapterId,
                    verse_number: parseInt(verseNumber),
                    text: verseText
                }, {
                    onConflict: 'chapter_id, verse_number'
                });

            if (verseError) throw verseError;

            // 3. Success Feedback
            showToast("Ayat berhasil disimpan!", "success");

            // Clear text field, auto-increment verse number for convenience
            setVerseText("");
            setVerseNumber((prev) => (parseInt(prev) + 1).toString());

        } catch (err: any) {
            console.error("Error saving verse:", err);
            showToast(`Gagal menyimpan: ${err.message}`, "error");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <div className="flex items-center gap-4">
                <Link
                    href="/dashboard/bible"
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Input Manual Alkitab</h1>
                    <p className="text-slate-500 dark:text-slate-400">Masukkan ayat Alkitab satu per satu ke database.</p>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <form onSubmit={handleSave} className="space-y-6">
                    {/* Book Selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-purple-600" />
                            Kitab
                        </label>
                        <select
                            value={selectedBookId}
                            onChange={(e) => setSelectedBookId(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 transition-all cursor-pointer appearance-none"
                            required
                        >
                            <option value="" disabled>Pilih Kitab...</option>
                            {books.map((book) => (
                                <option key={book.id} value={book.id}>
                                    {book.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        {/* Chapter Input */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <Hash className="w-4 h-4 text-purple-600" />
                                Pasal (Chapter)
                            </label>
                            <input
                                type="number"
                                value={chapter}
                                onChange={(e) => setChapter(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 transition-all placeholder:text-slate-400"
                                placeholder="1"
                                min="1"
                                required
                            />
                        </div>

                        {/* Verse Number Input */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <Hash className="w-4 h-4 text-blue-600" />
                                Ayat (Verse)
                            </label>
                            <input
                                type="number"
                                value={verseNumber}
                                onChange={(e) => setVerseNumber(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all placeholder:text-slate-400"
                                placeholder="1"
                                min="1"
                                required
                            />
                        </div>
                    </div>

                    {/* Verse Text Input */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <AlignLeft className="w-4 h-4 text-slate-500" />
                            Isi Ayat
                        </label>
                        <textarea
                            value={verseText}
                            onChange={(e) => setVerseText(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 transition-all placeholder:text-slate-400 min-h-[120px] resize-y leading-relaxed"
                            placeholder="Tuliskan isi ayat di sini..."
                            required
                        />
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-purple-200 dark:shadow-purple-900/20 transform transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {saving ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Menyimpan...
                                </>
                            ) : (
                                <>
                                    <Save className="w-5 h-5" />
                                    Simpan Ayat
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
