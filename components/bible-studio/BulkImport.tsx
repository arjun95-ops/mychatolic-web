"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { parsePositiveInt } from "@/lib/bible-admin";

type BulkImportProps = {
  lang: string;
  version: string;
  onImportFinished: () => Promise<void>;
};

type ParsedImportRow = {
  rowNumber: number;
  category: string;
  grouping: "old" | "new" | "deutero";
  book_name: string;
  abbreviation: string;
  order_index: string;
  chapter: string;
  verse: string;
  text: string;
  pericope: string;
};

type ImportSummary = {
  totalRows: number;
  successCount: number;
  failedRows: string[];
  createdBooks: number;
  createdChapters: number;
};

const CHUNK_SIZE = 250;

const HEADER_ALIASES: Record<string, string> = {
  category: "category",
  kategori: "category",
  grouping: "grouping",
  group: "grouping",
  kelompok: "grouping",
  book_name: "book_name",
  book: "book_name",
  kitab: "book_name",
  nama_kitab: "book_name",
  abbreviation: "abbreviation",
  abbr: "abbreviation",
  singkatan: "abbreviation",
  order_index: "order_index",
  order: "order_index",
  urutan: "order_index",
  chapter: "chapter",
  chapter_number: "chapter",
  pasal: "chapter",
  verse: "verse",
  verse_number: "verse",
  ayat: "verse",
  text: "text",
  verse_text: "text",
  ayat_text: "text",
  isi: "text",
  pericope: "pericope",
  perikop: "pericope",
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function mapGrouping(value: string): "old" | "new" | "deutero" | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "old";
  if (["old", "perjanjian lama", "old testament", "pl"].includes(normalized)) return "old";
  if (["new", "perjanjian baru", "new testament", "pb"].includes(normalized)) return "new";
  if (
    ["deutero", "deuterokanonika", "deuterocanon", "deuterocanonical", "deuterokanonik"].includes(
      normalized,
    )
  ) {
    return "deutero";
  }
  return null;
}

function createSimpleAbbreviation(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length >= 3) return `${words[0][0]}${words[1][0]}${words[2][0]}`.toUpperCase();
  if (words.length === 2) {
    const partA = words[0].slice(0, 1);
    const partB = words[1].slice(0, 2);
    return `${partA}${partB}`.toUpperCase();
  }
  const oneWord = words[0] || "BOK";
  return oneWord.slice(0, 3).toUpperCase();
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function extractMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}

export default function BulkImport({ lang, version, onImportFinished }: BulkImportProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Idle");
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const previewRows = useMemo(() => rows.slice(0, 100), [rows]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setParsing(true);
    setFileName(file.name);
    setRows([]);
    setParseErrors([]);
    setSummary(null);
    setProgress(0);
    setStatusText("Parsing file...");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });

      const parsed: ParsedImportRow[] = [];
      const errors: string[] = [];

      rawRows.forEach((raw, index) => {
        const rowNumber = index + 2;
        const mapped: Record<string, string> = {};

        Object.entries(raw).forEach(([key, value]) => {
          const normalized = normalizeHeader(key);
          const alias = HEADER_ALIASES[normalized] || normalized;
          mapped[alias] = String(value ?? "").trim();
        });

        const bookName = mapped.book_name || "";
        const chapter = mapped.chapter || "";
        const verse = mapped.verse || "";
        const text = mapped.text || "";
        const category = mapped.category || mapped.grouping || "";
        const grouping = mapGrouping(category);
        const abbreviation = (mapped.abbreviation || createSimpleAbbreviation(bookName)).toUpperCase();

        if (!bookName) errors.push(`Baris ${rowNumber}: book_name wajib diisi.`);
        if (!parsePositiveInt(chapter)) errors.push(`Baris ${rowNumber}: chapter harus angka bulat positif.`);
        if (!parsePositiveInt(verse)) errors.push(`Baris ${rowNumber}: verse harus angka bulat positif.`);
        if (!text.trim()) errors.push(`Baris ${rowNumber}: text wajib diisi.`);
        if (!grouping) {
          errors.push(
            `Baris ${rowNumber}: category/grouping tidak valid. Gunakan Perjanjian Lama/Baru/Deuterokanonika.`,
          );
        }
        if (mapped.order_index && !parsePositiveInt(mapped.order_index)) {
          errors.push(`Baris ${rowNumber}: order_index harus angka bulat positif.`);
        }

        parsed.push({
          rowNumber,
          category,
          grouping: grouping || "old",
          book_name: bookName,
          abbreviation,
          order_index: mapped.order_index || "",
          chapter,
          verse,
          text,
          pericope: mapped.pericope || "",
        });
      });

      if (parsed.length === 0) {
        throw new Error("File kosong. Isi minimal 1 baris.");
      }

      setRows(parsed);
      setParseErrors(errors);
      if (errors.length > 0) {
        setStatusText(`Parsing selesai dengan ${errors.length} error.`);
        showToast(`Parsing selesai dengan ${errors.length} error.`, "error");
      } else {
        setStatusText(`Parsing berhasil: ${parsed.length} baris siap import.`);
        showToast(`Parsing berhasil: ${parsed.length} baris siap import.`, "success");
      }
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      setParseErrors([message]);
      setStatusText(`Gagal parsing: ${message}`);
      showToast(`Gagal parsing: ${message}`, "error");
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (rows.length === 0 || parseErrors.length > 0 || importing) return;
    setImporting(true);
    setProgress(0);
    setSummary(null);

    const chunks = chunkArray(rows, CHUNK_SIZE);
    const failedRows: string[] = [];
    let successCount = 0;
    let createdBooks = 0;
    let createdChapters = 0;
    let processed = 0;

    try {
      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        setStatusText(`Import chunk ${i + 1}/${chunks.length}...`);

        const payloadRows = chunk.map((row) => ({
          rowNumber: row.rowNumber,
          data: {
            category: row.category,
            grouping: row.grouping,
            book_name: row.book_name,
            abbreviation: row.abbreviation,
            order_index: row.order_index || null,
            chapter: row.chapter,
            verse: row.verse,
            text: row.text,
            pericope: row.pericope || null,
          },
        }));

        const response = await fetch("/api/admin/bible/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language_code: lang,
            version_code: version,
            rows: payloadRows,
          }),
        });

        const result = (await response.json().catch(() => ({}))) as {
          message?: string;
          successCount?: number;
          failedRows?: string[];
          createdBooks?: number;
          createdChapters?: number;
        };

        if (!response.ok && response.status !== 207) {
          const message = extractMessage(result, `Chunk ${i + 1} gagal (${response.status}).`);
          failedRows.push(message);
          if (Array.isArray(result.failedRows)) failedRows.push(...result.failedRows);
        } else {
          successCount += Number(result.successCount || 0);
          createdBooks += Number(result.createdBooks || 0);
          createdChapters += Number(result.createdChapters || 0);
          if (Array.isArray(result.failedRows)) failedRows.push(...result.failedRows);
        }

        processed += chunk.length;
        setProgress(Math.round((processed / rows.length) * 100));
      }

      const nextSummary: ImportSummary = {
        totalRows: rows.length,
        successCount,
        failedRows,
        createdBooks,
        createdChapters,
      };
      setSummary(nextSummary);
      setStatusText(
        failedRows.length > 0
          ? `Import selesai dengan ${failedRows.length} baris bermasalah.`
          : "Import selesai.",
      );

      if (failedRows.length > 0) {
        showToast(`Import selesai parsial: ${successCount}/${rows.length} baris berhasil.`, "error");
      } else {
        showToast(`Import selesai: ${successCount} baris berhasil.`, "success");
      }

      await onImportFinished();
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      setStatusText(`Import gagal: ${message}`);
      showToast(message, "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-surface-secondary p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Bulk Import XLSX/CSV</h3>
            <p className="text-xs text-text-secondary">
              Format kolom: <code>category, book_name, chapter, verse, text, pericope(optional)</code>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing || importing}
              className="inline-flex items-center gap-2 rounded-lg border border-surface-secondary px-3 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-secondary/60 disabled:opacity-60"
            >
              {parsing ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
              {parsing ? "Parsing..." : "Pilih File"}
            </button>
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={rows.length === 0 || parseErrors.length > 0 || importing || parsing}
              className="inline-flex items-center gap-2 rounded-lg bg-action px-3 py-2 text-sm font-semibold text-text-inverse hover:bg-action/90 disabled:opacity-60"
            >
              {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {importing ? "Importing..." : "Import Sekarang"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-surface-secondary bg-surface-secondary/20 px-3 py-2">
            <p className="text-xs uppercase text-text-secondary">File</p>
            <p className="mt-1 text-sm font-semibold text-text-primary">{fileName || "-"}</p>
          </div>
          <div className="rounded-lg border border-surface-secondary bg-surface-secondary/20 px-3 py-2">
            <p className="text-xs uppercase text-text-secondary">Rows Parsed</p>
            <p className="mt-1 text-sm font-semibold text-text-primary">{rows.length}</p>
          </div>
          <div className="rounded-lg border border-surface-secondary bg-surface-secondary/20 px-3 py-2">
            <p className="text-xs uppercase text-text-secondary">Parse Errors</p>
            <p className="mt-1 text-sm font-semibold text-status-error">{parseErrors.length}</p>
          </div>
          <div className="rounded-lg border border-surface-secondary bg-surface-secondary/20 px-3 py-2">
            <p className="text-xs uppercase text-text-secondary">Workspace</p>
            <p className="mt-1 text-xs font-mono text-text-primary">
              {lang.toUpperCase()} / {version}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
            <div
              className="h-full bg-action transition-all"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          <p className="text-xs text-text-secondary">
            Status: {statusText} ({progress}%)
          </p>
        </div>
      </section>

      {parseErrors.length > 0 ? (
        <section className="rounded-xl border border-status-error/30 bg-status-error/10 p-4">
          <p className="text-sm font-semibold text-status-error">Error Parsing ({parseErrors.length})</p>
          <ul className="mt-2 space-y-1 text-xs text-status-error">
            {parseErrors.slice(0, 40).map((item, index) => (
              <li key={`${item}-${index}`}>- {item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary ? (
        <section className="rounded-xl border border-surface-secondary p-4">
          <h3 className="text-sm font-semibold text-text-primary">Hasil Import</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-surface-secondary bg-surface-secondary/20 px-3 py-2">
              <p className="text-xs uppercase text-text-secondary">Total</p>
              <p className="mt-1 text-lg font-bold text-text-primary">{summary.totalRows}</p>
            </div>
            <div className="rounded-lg border border-surface-secondary bg-surface-secondary/20 px-3 py-2">
              <p className="text-xs uppercase text-text-secondary">Berhasil</p>
              <p className="mt-1 text-lg font-bold text-status-success">{summary.successCount}</p>
            </div>
            <div className="rounded-lg border border-surface-secondary bg-surface-secondary/20 px-3 py-2">
              <p className="text-xs uppercase text-text-secondary">Kitab Baru</p>
              <p className="mt-1 text-lg font-bold text-text-primary">{summary.createdBooks}</p>
            </div>
            <div className="rounded-lg border border-surface-secondary bg-surface-secondary/20 px-3 py-2">
              <p className="text-xs uppercase text-text-secondary">Pasal Baru</p>
              <p className="mt-1 text-lg font-bold text-text-primary">{summary.createdChapters}</p>
            </div>
          </div>

          {summary.failedRows.length > 0 ? (
            <div className="mt-3 rounded-lg border border-status-error/30 bg-status-error/10 p-3">
              <p className="text-xs font-semibold text-status-error">
                {summary.failedRows.length} baris bermasalah:
              </p>
              <ul className="mt-1 space-y-1 text-xs text-status-error">
                {summary.failedRows.slice(0, 40).map((item, index) => (
                  <li key={`${item}-${index}`}>- {item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {previewRows.length > 0 ? (
        <section className="overflow-x-auto rounded-xl border border-surface-secondary">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-secondary/60 text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-3 py-2">Row</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Book</th>
                <th className="px-3 py-2">Ch</th>
                <th className="px-3 py-2">V</th>
                <th className="px-3 py-2">Text</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row) => (
                <tr key={row.rowNumber} className="border-t border-surface-secondary/70 align-top">
                  <td className="px-3 py-2 text-text-secondary">{row.rowNumber}</td>
                  <td className="px-3 py-2 text-text-secondary">{row.category || row.grouping}</td>
                  <td className="px-3 py-2 text-text-primary">{row.book_name}</td>
                  <td className="px-3 py-2 text-text-primary">{row.chapter}</td>
                  <td className="px-3 py-2 text-text-primary">{row.verse}</td>
                  <td className="px-3 py-2 text-text-primary">{row.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
