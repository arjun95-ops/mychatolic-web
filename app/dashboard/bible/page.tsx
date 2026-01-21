"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import {
    Book,
    BookOpen,
    Search,
    Edit2,
    Trash2,
    Eye,
    Plus,
    Save,
    X,
    Hash,
    Loader2
} from "lucide-react";

interface BibleBook {
    id: string;
    name: string;
    category: string;
    abbreviation: string;
}

interface BibleVerse {
    id: string;
    chapter_id: string;
    verse_number: number;
    text: string;
    pericope?: string | null;
    book_name?: string; // Client-side hydration
    chapter_number?: number; // Client-side hydration
    book_id?: string;
}

export default function BibleDataManagerPage() {
    const { showToast } = useToast();

    // Filters
    const [selectedCategory, setSelectedCategory] = useState("Perjanjian Lama");
    const [books, setBooks] = useState<BibleBook[]>([]);
    const [selectedBookId, setSelectedBookId] = useState<string>("");
    const [chapters, setChapters] = useState<number[]>([]);
    const [selectedChapter, setSelectedChapter] = useState<string>(""); // Chapter Number as string used in UI
    const [searchQuery, setSearchQuery] = useState("");

    // Data
    const [verses, setVerses] = useState<BibleVerse[]>([]);
    const [loading, setLoading] = useState(false);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingVerse, setEditingVerse] = useState<Partial<BibleVerse> | null>(null);
    const [saving, setSaving] = useState(false);

    // Categories
    const categories = ["Perjanjian Lama", "Perjanjian Baru", "Deuterokanonika"];

    // 1. Fetch Books on Category Change
    useEffect(() => {
        const fetchBooks = async () => {
            const { data } = await supabase
                .from('bible_books')
                .select('*')
                .eq('category', selectedCategory)
                .order('book_order');

            setBooks(data || []);
            // Reset downstream filters
            setSelectedBookId("");
            setChapters([]);
            setSelectedChapter("");
            setVerses([]);
        };
        fetchBooks();
    }, [selectedCategory]);

    // 2. Fetch Chapters on Book Change
    useEffect(() => {
        if (!selectedBookId) return;

        const fetchChapters = async () => {
            const { data } = await supabase
                .from('bible_chapters')
                .select('chapter_number')
                .eq('book_id', selectedBookId)
                .order('chapter_number', { ascending: true });

            if (data) {
                setChapters(data.map(c => c.chapter_number));
                // Default select first chapter? No, let user choose.
                setVerses([]);
                setSelectedChapter("");
            }
        };
        fetchChapters();
    }, [selectedBookId]);

    // 3. Fetch Verses (filtered)
    useEffect(() => {
        fetchVerses();
    }, [selectedBookId, selectedChapter, searchQuery]);

    const fetchVerses = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('bible_verses')
                .select(`
                    id, 
                    verse_number, 
                    text, 
                    pericope,
                    bible_chapters!inner(
                        chapter_number,
                        bible_books!inner(id, name, category)
                    )
                `)
                .order('verse_number', { ascending: true })
                .limit(100); // Pagination limit for performance

            // Apply filters
            if (selectedBookId) {
                // Filter by related book
                // Note: Does Supabase support deep filtering nicely in one go? 
                // Yes, using the inner join notation in the filter:
                query = query.eq('bible_chapters.bible_books.id', selectedBookId);
            }

            if (selectedChapter) {
                query = query.eq('bible_chapters.chapter_number', parseInt(selectedChapter));
            }

            if (searchQuery) {
                query = query.ilike('text', `%${searchQuery}%`);
            }

            // Note: Category is implicitly handled by book selection, 
            // but if book is NOT selected, we might want to filter by category.
            // Complex deep filter:
            if (!selectedBookId) {
                query = query.eq('bible_chapters.bible_books.category', selectedCategory);
            }

            const { data, error } = await query;
            if (error) throw error;

            // Map flat structure for table
            const formatted: BibleVerse[] = (data || []).map((item: any) => ({
                id: item.id,
                chapter_id: item.bible_chapters?.id, // Note: ID might not be selected above, need to include if editing uses it
                verse_number: item.verse_number,
                text: item.text,
                pericope: item.pericope,
                book_name: item.bible_chapters?.bible_books?.name,
                chapter_number: item.bible_chapters?.chapter_number,
                book_id: item.bible_chapters?.bible_books?.id
            }));

            setVerses(formatted);

        } catch (err: any) {
            console.error("Fetch error:", err);
            // showToast("Gagal memuat ayat", "error"); // Reduce noise
        } finally {
            setLoading(false);
        }
    };

    // Actions
    const handleAdd = () => {
        setEditingVerse({
            book_id: selectedBookId || books[0]?.id,
            chapter_number: selectedChapter ? parseInt(selectedChapter) : 1,
            verse_number: verses.length + 1,
            text: "",
            pericope: ""
        });
        setIsModalOpen(true);
    };

    const handleEdit = (verse: BibleVerse) => {
        const foundBook = books.find(b => b.name === verse.book_name);
        setEditingVerse({
            id: verse.id,
            book_id: foundBook?.id || selectedBookId, // Fallback
            chapter_number: verse.chapter_number,
            verse_number: verse.verse_number,
            text: verse.text,
            pericope: verse.pericope || ""
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Hapus ayat ini?")) return;

        // Optimistic Delete
        setVerses(current => current.filter(v => v.id !== id));

        const { error } = await supabase.from('bible_verses').delete().eq('id', id);
        if (error) {
            showToast("Gagal menghapus", "error");
            fetchVerses(); // Revert
        } else {
            showToast("Ayat dihapus", "success");
        }
    };

    const handleSave = async () => {
        if (!editingVerse?.book_id || !editingVerse?.chapter_number || !editingVerse?.verse_number || !editingVerse?.text) {
            showToast("Lengkapi semua field wajib!", "error");
            return;
        }

        setSaving(true);
        try {
            // 1. Get/Create Chapter ID
            // We need the chapter ID based on Book + Chapter Number
            let chapterId: string;

            const { data: chapData, error: chapErr } = await supabase
                .from('bible_chapters')
                .select('id')
                .eq('book_id', editingVerse.book_id)
                .eq('chapter_number', editingVerse.chapter_number)
                .single();

            if (chapData) {
                chapterId = chapData.id;
            } else {
                // Auto-create chapter if missing
                const { data: newChap, error: createErr } = await supabase
                    .from('bible_chapters')
                    .insert({
                        book_id: editingVerse.book_id,
                        chapter_number: editingVerse.chapter_number
                    })
                    .select('id')
                    .single();

                if (createErr) throw createErr;
                chapterId = newChap.id;
            }

            // 2. Upsert Verse
            const payload = {
                chapter_id: chapterId,
                verse_number: editingVerse.verse_number,
                text: editingVerse.text,
                pericope: editingVerse.pericope || null
            };

            if (editingVerse.id) {
                // Update
                const { error } = await supabase
                    .from('bible_verses')
                    .update(payload)
                    .eq('id', editingVerse.id);
                if (error) throw error;
            } else {
                // Insert
                const { error } = await supabase
                    .from('bible_verses')
                    .insert(payload);
                if (error) throw error;
            }

            showToast("Data berhasil disimpan", "success");
            setIsModalOpen(false);
            fetchVerses(); // Refresh table to get proper joined data

        } catch (err: any) {
            console.error("Save error:", err);
            showToast(`Gagal menyimpan: ${err.message}`, "error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header / Title */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Book className="w-8 h-8 text-purple-600" />
                        Manajemen Data Alkitab
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400">
                        Edit, tambah, dan kelola ayat Alkitab secara mendetail.
                    </p>
                </div>
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-lg shadow-purple-200 dark:shadow-purple-900/20 transition-all transform hover:-translate-y-0.5"
                >
                    <Plus className="w-5 h-5" />
                    Tambah Ayat Manual
                </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 items-center">
                {/* Category */}
                <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm font-medium focus:ring-2 focus:ring-purple-500"
                >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                {/* Book */}
                <select
                    value={selectedBookId}
                    onChange={(e) => setSelectedBookId(e.target.value)}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm font-medium focus:ring-2 focus:ring-purple-500 max-w-xs"
                >
                    <option value="">-- Semua Kitab --</option>
                    {books.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>

                {/* Chapter */}
                <select
                    value={selectedChapter}
                    onChange={(e) => setSelectedChapter(e.target.value)}
                    disabled={!selectedBookId}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm font-medium focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                >
                    <option value="">-- Semua Bab --</option>
                    {chapters.map(c => (
                        <option key={c} value={c}>Pasal {c}</option>
                    ))}
                </select>

                {/* Search */}
                <div className="flex-1 w-full relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Cari isi ayat..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm min-h-[400px]">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin mb-2" />
                        <span className="text-sm">Memuat data...</span>
                    </div>
                ) : verses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <BookOpen className="w-12 h-12 mb-4 opacity-20" />
                        <p>Tidak ada data ayat ditemukan.</p>
                        <p className="text-xs mt-1">Coba ubah filter atau tambah data baru.</p>
                    </div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4 w-40">Referensi</th>
                                <th className="px-6 py-4 w-48">Perikop (Header)</th>
                                <th className="px-6 py-4">Isi Ayat</th>
                                <th className="px-6 py-4 w-24 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {verses.map(verse => (
                                <tr key={verse.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="px-6 py-4 align-top font-medium text-purple-600 dark:text-purple-400 whitespace-nowrap">
                                        {verse.book_name} {verse.chapter_number}:{verse.verse_number}
                                    </td>
                                    <td className="px-6 py-4 align-top">
                                        {verse.pericope ? (
                                            <span className="inline-block px-2 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded text-xs font-bold border border-purple-100 dark:border-purple-800">
                                                {verse.pericope}
                                            </span>
                                        ) : (
                                            <span className="text-slate-300 italic">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 align-top text-slate-700 dark:text-slate-300">
                                        <p className="line-clamp-2">{verse.text}</p>
                                    </td>
                                    <td className="px-6 py-4 align-top text-center">
                                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleEdit(verse)}
                                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Edit"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(verse.id)}
                                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Hapus"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Edit/Add Modal */}
            {isModalOpen && editingVerse && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                {editingVerse.id ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                {editingVerse.id ? "Edit Ayat" : "Tambah Ayat Baru"}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-4">
                            {/* Row 1: Book & Chapter */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Kitab</label>
                                    <select
                                        value={editingVerse.book_id}
                                        onChange={(e) => setEditingVerse({ ...editingVerse, book_id: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                                    >
                                        {books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Pasal</label>
                                    <input
                                        type="number"
                                        value={editingVerse.chapter_number}
                                        onChange={(e) => setEditingVerse({ ...editingVerse, chapter_number: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                                        min="1"
                                    />
                                </div>
                            </div>

                            {/* Row 2: Verse & Pericope */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1 col-span-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Ayat</label>
                                    <input
                                        type="number"
                                        value={editingVerse.verse_number}
                                        onChange={(e) => setEditingVerse({ ...editingVerse, verse_number: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold text-purple-600"
                                        min="1"
                                    />
                                </div>
                                <div className="space-y-1 col-span-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Judul Perikop (Opsional)</label>
                                    <input
                                        type="text"
                                        value={editingVerse.pericope || ""}
                                        onChange={(e) => setEditingVerse({ ...editingVerse, pericope: e.target.value })}
                                        placeholder="Judul bagian..."
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                                    />
                                </div>
                            </div>

                            {/* Text Area */}
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Isi Ayat</label>
                                <textarea
                                    value={editingVerse.text || ""}
                                    onChange={(e) => setEditingVerse({ ...editingVerse, text: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm h-32 leading-relaxed"
                                    placeholder="Tulis isi ayat..."
                                ></textarea>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                disabled={saving}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Simpan
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
