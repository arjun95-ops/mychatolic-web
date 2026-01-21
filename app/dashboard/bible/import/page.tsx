"use client";

import { useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle, ArrowRight, Loader2, ArrowLeft } from "lucide-react";
import * as XLSX from "xlsx";
import Link from "next/link";

interface BibleRow {
    category: string;
    book_name: string;
    chapter: number;
    verse: number;
    text: string;
    pericope?: string;
}

export default function BibleImportPage() {
    const { showToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [previewData, setPreviewData] = useState<BibleRow[]>([]);
    const [totalRows, setTotalRows] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentStatus, setCurrentStatus] = useState("");

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setFile(selectedFile);
        parseExcel(selectedFile);
    };

    const parseExcel = async (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = e.target?.result;
            const workbook = XLSX.read(data, { type: "binary" });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet) as any[];

            // Map and Validate standard columns
            const parsedRows: BibleRow[] = jsonData.map((row: any) => ({
                category: row['category'] || row['Category'] || "Perjanjian Baru", // Default fallback if missing
                book_name: row['book_name'] || row['Book Name'] || row['Book'],
                chapter: parseInt(row['chapter'] || row['Chapter']),
                verse: parseInt(row['verse'] || row['Verse']),
                text: row['text'] || row['Text'] || row['Isi Ayat'],
                pericope: row['pericope'] || row['Pericope'] || row['Judul Perikop'] || null
            })).filter(r => r.book_name && r.chapter && r.verse && r.text); // Basic validation

            setPreviewData(parsedRows.slice(0, 5));
            setTotalRows(parsedRows.length);
        };
        reader.readAsBinaryString(file);
    };

    const generateAbbreviation = (name: string) => {
        // Simple heuristic: First 3-4 letters or first letters of words
        // e.g., "Kejadian" -> "Kej", "Kisah Para Rasul" -> "Kis"
        const words = name.split(' ');
        if (words.length > 1) {
            // For multi-word books, take first 3 letters of first word? 
            // Or standard generic. Let's just take first 3 chars of first word for simplicity now
            // The user can edit later in master data if needed.
            return name.substring(0, 3);
        }
        return name.substring(0, 3);
    };

    const processImport = async () => {
        if (!file || totalRows === 0) return;

        // Reload full data to process
        const reader = new FileReader();
        reader.onload = async (e) => {
            const binData = e.target?.result;
            const workbook = XLSX.read(binData, { type: "binary" });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(sheet) as any[];

            await executeBatchImport(jsonData);
        };
        reader.readAsBinaryString(file);
    };

    const executeBatchImport = async (rawData: any[]) => {
        setIsProcessing(true);
        setProgress(0);
        setCurrentStatus("Initializing...");

        // Map data again
        const rows: BibleRow[] = rawData.map((row: any) => ({
            category: row['category'] || row['Category'] || "Perjanjian Baru",
            book_name: row['book_name'] || row['Book Name'] || row['Book'],
            chapter: parseInt(row['chapter'] || row['Chapter']),
            verse: parseInt(row['verse'] || row['Verse']),
            text: row['text'] || row['Text'] || row['Isi Ayat'],
            pericope: row['pericope'] || row['Pericope'] || row['Judul Perikop'] || null
        })).filter(r => r.book_name && r.chapter && r.verse && r.text);

        try {
            // Cache for IDs to reduce DB calls
            const bookCache: Record<string, string> = {}; // Name -> UUID
            const chapterCache: Record<string, string> = {}; // "BookUUID-ChapterNum" -> UUID

            let processedCount = 0;
            const total = rows.length;

            for (const row of rows) {
                // 1. Resolve Book ID
                let bookId = bookCache[row.book_name];

                if (!bookId) {
                    // Check DB
                    const { data: existingBook } = await supabase
                        .from('bible_books')
                        .select('id')
                        .ilike('name', row.book_name)
                        .single();

                    if (existingBook) {
                        bookId = existingBook.id;
                    } else {
                        // Insert New Book
                        const abbr = generateAbbreviation(row.book_name);
                        // We need a unique check for abbr strictly speaking

                        // Note: In V3 Schema 'abbreviation' is unique.
                        // Use maybeSingle to check safely
                        const { data: existingAbbr } = await supabase
                            .from('bible_books')
                            .select('id')
                            .eq('abbreviation', abbr)
                            .maybeSingle();

                        // If abbreviation exists, append a random digit to make it unique for now
                        const finalAbbr = existingAbbr ? `${abbr}${Math.floor(Math.random() * 10)}` : abbr;

                        const { data: newBook, error: bookError } = await supabase
                            .from('bible_books')
                            .insert({
                                name: row.book_name,
                                abbreviation: finalAbbr,
                                category: row.category,
                                book_order: 999
                            })
                            .select('id')
                            .single();

                        if (bookError) {
                            console.error(`Failed to create book ${row.book_name}`, bookError);
                            // If it failed because of Unique Constraint race condition or similar, we skip row
                            // Ideally we should retry, but for valid bulk data assume clean state
                            continue;
                        }
                        bookId = newBook.id;
                    }
                    bookCache[row.book_name] = bookId; // Update Cache
                }

                // 2. Resolve Chapter ID
                const chapterKey = `${bookId}-${row.chapter}`;
                let chapterId = chapterCache[chapterKey];

                if (!chapterId) {
                    const { data: existingChapter } = await supabase
                        .from('bible_chapters')
                        .select('id')
                        .eq('book_id', bookId)
                        .eq('chapter_number', row.chapter)
                        .single();

                    if (existingChapter) {
                        chapterId = existingChapter.id;
                    } else {
                        const { data: newChapter, error: chapError } = await supabase
                            .from('bible_chapters')
                            .insert({
                                book_id: bookId,
                                chapter_number: row.chapter
                            })
                            .select('id')
                            .single();

                        if (chapError) {
                            // If duplicated key error, it means it exists now
                            if (chapError.code === '23505') {
                                const { data: retryChap } = await supabase
                                    .from('bible_chapters')
                                    .select('id')
                                    .eq('book_id', bookId)
                                    .eq('chapter_number', row.chapter)
                                    .single();
                                if (retryChap) chapterId = retryChap.id;
                            } else {
                                continue; // Skip row
                            }
                        } else {
                            chapterId = newChapter.id;
                        }
                    }
                    if (chapterId) chapterCache[chapterKey] = chapterId;
                }

                if (!chapterId) continue;

                // 3. Upsert Verse
                const { error: verseError } = await supabase
                    .from('bible_verses')
                    .upsert({
                        chapter_id: chapterId,
                        verse_number: row.verse,
                        text: row.text,
                        pericope: row.pericope || null
                    }, {
                        onConflict: 'chapter_id, verse_number'
                    });

                if (verseError) {
                    console.error(`Failed verse ${row.book_name} ${row.chapter}:${row.verse}`, verseError);
                }

                processedCount++;
                if (processedCount % 10 === 0) {
                    // Update UI every 10 rows
                    setProgress(Math.round((processedCount / total) * 100));
                    setCurrentStatus(`Processing ${row.book_name} ${row.chapter}:${row.verse}...`);
                }
            }

            setProgress(100);
            setCurrentStatus("Import Completed Successfully!");
            showToast(`Berhasil mengimport ${processedCount} ayat!`, "success");

        } catch (error: any) {
            console.error("Bulk Import Error:", error);
            showToast("Terjadi kesalahan sistem saat import", "error");
            setCurrentStatus(`Error: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-20">
            <div className="flex items-center gap-4">
                <Link
                    href="/dashboard/bible"
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <FileSpreadsheet className="w-8 h-8 text-green-600" />
                        Import Alkitab (Excel)
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400">
                        Upload file .xlsx untuk import data Alkitab secara massal.
                    </p>
                </div>
            </div>

            {/* Upload Zone */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-4">
                    <Upload className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-lg font-medium text-slate-800 dark:text-white mb-2">
                    Drag file Excel di sini atau klik untuk upload
                </h3>
                <p className="text-sm text-slate-500 mb-6 max-w-md">
                    Pastikan kolom valid: category, book_name, chapter, verse, text, pericope (opsional).
                </p>

                <input
                    type="file"
                    accept=".xlsx, .xls"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                />

                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="px-6 py-2.5 bg-slate-900 dark:bg-slate-700 text-white rounded-lg font-medium hover:bg-slate-800 transition-all disabled:opacity-50"
                >
                    Pilih File Excel
                </button>
            </div>

            {/* Preview Section */}
            {previewData.length > 0 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-lg flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                            Preview Data ({totalRows} Rows Found)
                        </h3>
                        {/* Action Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={() => setPreviewData([])}
                                disabled={isProcessing}
                                className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            >
                                Batal
                            </button>
                            <button
                                onClick={processImport}
                                disabled={isProcessing}
                                className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-lg shadow-green-200 dark:shadow-green-900/20 font-bold flex items-center gap-2"
                            >
                                {isProcessing ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Processing... {progress}%
                                    </>
                                ) : (
                                    <>
                                        Import Sekarang
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    {isProcessing && (
                        <div className="space-y-2 bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                            <div className="flex justify-between text-xs font-mono text-slate-500 mb-1">
                                <span>{currentStatus}</span>
                                <span>{progress}%</span>
                            </div>
                            <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-green-500 transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Table */}
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase font-medium border-b border-slate-200 dark:border-slate-700">
                                <tr>
                                    <th className="px-4 py-3">Book</th>
                                    <th className="px-4 py-3">Ch:Ver</th>
                                    <th className="px-4 py-3">Text</th>
                                    <th className="px-4 py-3">Pericope</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {previewData.map((row, i) => (
                                    <tr key={i} className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        <td className="px-4 py-3 font-medium">{row.book_name}</td>
                                        <td className="px-4 py-3 text-slate-500 font-mono">{row.chapter}:{row.verse}</td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 truncate max-w-md" title={row.text}>{row.text}</td>
                                        <td className="px-4 py-3 text-slate-400 italic">{row.pericope || "-"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-800 text-xs text-center text-slate-500">
                            Showing first 5 rows of {totalRows} total rows
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
