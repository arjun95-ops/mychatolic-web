"use client";

import { useState } from "react";

export default function BulkImportExport() {
    const [loading, setLoading] = useState(false);

    // --- EXPORT FUNCTIONALITY ONLY ---
    const handleExport = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/export-master-data');

            if (!response.ok) {
                // Try to parse error message if JSON
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Server Error: ${response.status}`);
            }

            // Convert response to Blob
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);

            // Create virtual anchor to trigger download
            const a = document.createElement('a');
            a.href = url;
            a.download = "Master_Data_Catholic.xlsx";
            document.body.appendChild(a);
            a.click();
            a.remove();

            // Cleanup
            window.URL.revokeObjectURL(url);

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error("Export Failed:", error);
            alert("Gagal mengunduh: " + message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex justify-end">
            <button
                onClick={handleExport}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-lg transition-all flex items-center gap-2 hover:translate-y-[-2px] active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? (
                    <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Downloading...
                    </>
                ) : (
                    <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        Export Data (.xlsx)
                    </>
                )}
            </button>
        </div>
    );
}
