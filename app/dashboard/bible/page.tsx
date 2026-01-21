"use client";

import { useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient"; // Using the project's existing client
import { Upload, Check, AlertTriangle, Trash2, FileText, Loader2, Book, BookOpen } from "lucide-react";
import Link from "next/link";

// Types based on the requirements
interface Verse {
    verse_number: number;
    text: string;
}

interface Chapter {
    chapter_number: number;
    verses: Verse[];
}

interface BookData {
    name: string;
    abbreviation: string;
    testament: string;
    book_order: number;
    chapters: Chapter[];
}

type LogType = 'info' | 'success' | 'error';

interface LogEntry {
    message: string;
    type: LogType;
    timestamp: Date;
}

export default function BiblePage() {
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressLabel, setProgressLabel] = useState("");
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const addLog = (message: string, type: LogType = 'info') => {
        setLogs(prev => [{ message, type, timestamp: new Date() }, ...prev]);
    };

    const clearLogs = () => setLogs([]);

    const handleClearData = async () => {
        if (!confirm("PERINGATAN: Ini akan MENGHAPUS SEMUA data Alkitab (Buku, Bab, Ayat). Apakah Anda yakin?")) {
            return;
        }

        setIsLoading(true);
        addLog("Memulai penghapusan data...", 'info');

        try {
            // Delete in order: Verses -> Chapters -> Books (Bottom-up approach for safety)
            // Note: If CASCADING DELETE is set up in Supabase, deleting books would suffice, 
            // but we'll do bottom-up to be safe and explicit.

            setProgressLabel("Menghapus Ayat...");
            const { error: versesError } = await supabase.from('bible_verses').delete().neq('id', 0); // Delete all
            if (versesError) throw versesError;
            addLog("Tabel bible_verses dikosongkan.", 'success');

            setProgressLabel("Menghapus Bab...");
            const { error: chaptersError } = await supabase.from('bible_chapters').delete().neq('id', 0);
            if (chaptersError) throw chaptersError;
            addLog("Tabel bible_chapters dikosongkan.", 'success');

            setProgressLabel("Menghapus Buku...");
            const { error: booksError } = await supabase.from('bible_books').delete().neq('id', 0);
            if (booksError) throw booksError;
            addLog("Tabel bible_books dikosongkan.", 'success');

            addLog("Semua data berhasil dihapus.", 'success');
        } catch (error: any) {
            console.error(error);
            addLog(`Gagal menghapus data: ${error.message || JSON.stringify(error)}`, 'error');
        } finally {
            setIsLoading(false);
            setProgressLabel("");
        }
    };

    const processFile = async (file: File) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                let text = e.target?.result;
                if (typeof text !== "string") return;

                // 1. Clean content (Remove BOM and whitespace)
                text = text.replace(/^\uFEFF/, '').trim();

                let data: any;
                try {
                    data = JSON.parse(text);
                } catch (parseError) {
                    throw new Error(`Invalid JSON format. Check the first 50 chars: "${text.substring(0, 50)}..."`);
                }

                // 2. Handle single object or array
                if (!Array.isArray(data)) {
                    // Check if it's a single book object clearly
                    if (typeof data === 'object' && data !== null && 'name' in data) {
                        data = [data];
                        addLog("Info: Mendeteksi single object, dikonversi ke array.", 'info');
                    } else {
                        throw new Error("Format JSON tidak valid: Harus berupa array atau object buku valid.");
                    }
                }

                // 3. Structural Validation
                if (data.length > 0) {
                    const firstItem = data[0];
                    if (!firstItem.name || !firstItem.chapters) {
                        throw new Error("Struktur JSON tidak valid: Field 'name' dan 'chapters' wajib ada.");
                    }
                }

                await importData(data as BookData[]);
            } catch (error: any) {
                console.error("File processing error:", error);
                addLog(`${error.message}`, 'error');
                setIsLoading(false);
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
            }
        };
        reader.readAsText(file);
    };

    const importData = async (books: BookData[]) => {
        setIsLoading(true);
        clearLogs();
        addLog(`Memulai import ${books.length} buku...`, 'info');

        let totalItems = books.length; // Simple progress based on books for now
        let processedItems = 0;

        try {
            for (const book of books) {
                processedItems++;
                const progressPercent = Math.round((processedItems / totalItems) * 100);
                setProgress(progressPercent);
                setProgressLabel(`Importing ${book.name}...`);

                // 1. Insert Book
                const { data: bookData, error: bookError } = await supabase
                    .from('bible_books')
                    .insert({
                        name: book.name,
                        abbreviation: book.abbreviation,
                        testament: book.testament,
                        book_order: book.book_order
                    })
                    .select('id')
                    .single();

                if (bookError) {
                    addLog(`Gagal insert buku ${book.name}: ${bookError.message}`, 'error');
                    continue; // Skip logs for chapters if book fails
                }

                const bookId = bookData.id;
                addLog(`Buku terdaftar: ${book.name}`, 'success');

                // 2. Process Chapters
                for (const chapter of book.chapters) {
                    setProgressLabel(`Importing ${book.name}: Bab ${chapter.chapter_number}...`);

                    const { data: chapterData, error: chapterError } = await supabase
                        .from('bible_chapters')
                        .insert({
                            book_id: bookId,
                            chapter_number: chapter.chapter_number
                        })
                        .select('id')
                        .single();

                    if (chapterError) {
                        addLog(`Error creating Bab ${chapter.chapter_number} for ${book.name}: ${chapterError.message}`, 'error');
                        continue;
                    }

                    const chapterId = chapterData.id;

                    // 3. Batch Insert Verses
                    if (chapter.verses && chapter.verses.length > 0) {
                        const versesPayload = chapter.verses.map(v => ({
                            chapter_id: chapterId,
                            verse_number: v.verse_number,
                            text: v.text
                        }));

                        const { error: versesError } = await supabase
                            .from('bible_verses')
                            .insert(versesPayload);

                        if (versesError) {
                            addLog(`Gagal insert ayat untuk ${book.name} Bab ${chapter.chapter_number}: ${versesError.message}`, 'error');
                        }
                    }
                }
            }

            addLog("Proses Import Selesai!", 'success');
        } catch (globalError: any) {
            addLog(`Critical Error: ${globalError.message}`, 'error');
        } finally {
            setIsLoading(false);
            setProgressLabel("");
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            processFile(file);
        }
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-10">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-600 flex items-center gap-2">
                        <Book className="w-8 h-8 text-purple-600" />
                        Manajemen Alkitab & Liturgi
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Upload dan kelola database Alkitab Katolik
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        href="/dashboard/bible/manual"
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors border border-slate-200 dark:border-slate-700 shadow-sm"
                    >
                        <FileText className="w-4 h-4" />
                        Input Manual
                    </Link>
                    <Link
                        href="/dashboard/bible/import"
                        className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg text-sm font-medium transition-colors border border-green-200 dark:border-green-800 shadow-sm"
                    >
                        <div className="flex items-center gap-2">
                            {/* Small icon if available, or just text */}
                            <span className="font-bold">+</span>
                            Import Excel
                        </div>
                    </Link>
                    <Link
                        href="/dashboard/bible/preview"
                        className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg text-sm font-medium transition-colors border border-blue-200 dark:border-blue-800 shadow-sm"
                    >
                        <BookOpen className="w-4 h-4" />
                        Preview Reader
                    </Link>
                    <button
                        onClick={handleClearData}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors border border-red-200 disabled:opacity-50"
                    >
                        <Trash2 className="w-4 h-4" />
                        Hapus Semua Data
                    </button>
                </div>
            </div>

            {/* Main Upload Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-sm">
                <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4">
                        <Upload className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">
                        Import Data Alkitab (JSON)
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 text-center max-w-md">
                        Pilih file JSON yang berisi struktur Buku, Bab, dan Ayat. Pastikan format sesuai standar.
                    </p>

                    <input
                        type="file"
                        accept=".json"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        disabled={isLoading}
                        className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-400 max-w-xs mx-auto"
                    />
                </div>

                {/* Progress Interface */}
                {isLoading && (
                    <div className="mt-8 space-y-3">
                        <div className="flex justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
                            <span>Status: <span className="text-blue-600">{progressLabel}</span></span>
                            <span>{progress}%</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                            <div
                                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                    </div>
                )}
            </div>

            {/* Logs Area */}
            <div className="bg-slate-900 text-slate-200 rounded-2xl p-6 shadow-sm border border-slate-800 h-96 flex flex-col">
                <div className="flex items-center justify-between mb-4 border-b border-slate-700 pb-3">
                    <h3 className="font-mono text-sm font-semibold flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        System Logs
                    </h3>
                    <div className="text-xs text-slate-500">
                        {logs.length} entries
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1 font-mono text-xs pr-2 custom-scrollbar">
                    {logs.length === 0 && (
                        <div className="text-slate-600 italic">No logs generated yet...</div>
                    )}
                    {logs.map((log, idx) => (
                        <div key={idx} className={`flex gap-3 py-1 border-b border-slate-800/50 ${log.type === 'error' ? 'text-red-400' :
                            log.type === 'success' ? 'text-green-400' : 'text-slate-300'
                            }`}>
                            <span className="text-slate-600 shrink-0">
                                [{log.timestamp.toLocaleTimeString()}]
                            </span>
                            <span className="break-all">{log.message}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
