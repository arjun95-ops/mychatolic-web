"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { CheckCircle2, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useBibleWorkspace } from "@/components/bible/BibleWorkspaceProvider";

type PreviewRow = {
  rowNumber: number;
  book_name: string;
  abbreviation: string;
  grouping: string;
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

const HEADER_ALIASES: Record<string, string> = {
  book: "book_name",
  book_name: "book_name",
  kitab: "book_name",
  nama_kitab: "book_name",
  singkatan: "abbreviation",
  abbreviation: "abbreviation",
  abbr: "abbreviation",
  grouping: "grouping",
  group: "grouping",
  kelompok: "grouping",
  order: "order_index",
  urutan: "order_index",
  order_index: "order_index",
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
  subtitle: "pericope",
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeGrouping(value: string): string {
  return value.trim().toLowerCase();
}

function toPositiveIntOrEmpty(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export default function BibleImportManager() {
  const { showToast } = useToast();
  const { lang, version } = useBibleWorkspace();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const canImport = rows.length > 0 && errors.length === 0 && !importing && !!lang && !!version;

  const previewRows = useMemo(() => rows.slice(0, 100), [rows]);

  const resetResult = () => {
    setSummary(null);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setFileName(file.name);
    setParsing(true);
    resetResult();

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        defval: "",
      });

      const parsedRows: PreviewRow[] = [];
      const parsingErrors: string[] = [];

      rawRows.forEach((rawRow, index) => {
        const rowNumber = index + 2;
        const mapped: Record<string, string> = {};

        Object.entries(rawRow).forEach(([key, value]) => {
          const normalized = normalizeHeader(key);
          const targetKey = HEADER_ALIASES[normalized] || normalized;
          mapped[targetKey] = String(value ?? "").trim();
        });

        const row: PreviewRow = {
          rowNumber,
          book_name: mapped.book_name || "",
          abbreviation: mapped.abbreviation || "",
          grouping: normalizeGrouping(mapped.grouping || ""),
          order_index: mapped.order_index || "",
          chapter: mapped.chapter || "",
          verse: mapped.verse || "",
          text: mapped.text || "",
          pericope: mapped.pericope || "",
        };

        if (!row.book_name) {
          parsingErrors.push(`Baris ${rowNumber}: kolom book_name wajib diisi.`);
        }
        if (!toPositiveIntOrEmpty(row.chapter)) {
          parsingErrors.push(`Baris ${rowNumber}: kolom chapter harus angka bulat positif.`);
        }
        if (!toPositiveIntOrEmpty(row.verse)) {
          parsingErrors.push(`Baris ${rowNumber}: kolom verse harus angka bulat positif.`);
        }
        if (!row.text.trim()) {
          parsingErrors.push(`Baris ${rowNumber}: kolom text wajib diisi.`);
        }
        if (row.grouping && !["old", "new", "deutero"].includes(row.grouping)) {
          parsingErrors.push(`Baris ${rowNumber}: grouping hanya boleh old/new/deutero.`);
        }
        if (row.order_index && !toPositiveIntOrEmpty(row.order_index)) {
          parsingErrors.push(`Baris ${rowNumber}: order_index harus angka bulat positif.`);
        }

        parsedRows.push(row);
      });

      if (parsedRows.length === 0) {
        throw new Error("File kosong. Isi minimal satu baris data.");
      }

      setRows(parsedRows);
      setErrors(parsingErrors);
      if (parsingErrors.length > 0) {
        showToast(`Parsing selesai dengan ${parsingErrors.length} error.`, "error");
      } else {
        showToast(`Parsing berhasil: ${parsedRows.length} baris siap import.`, "success");
      }
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      setRows([]);
      setErrors([message]);
      showToast(`Gagal parsing file: ${message}`, "error");
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!canImport) return;
    setImporting(true);
    resetResult();

    try {
      const payloadRows = rows.map((row) => ({
        rowNumber: row.rowNumber,
        data: {
          book_name: row.book_name,
          abbreviation: row.abbreviation || null,
          grouping: row.grouping || null,
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
        totalRows?: number;
        createdBooks?: number;
        createdChapters?: number;
      };

      const failedRows = Array.isArray(result.failedRows) ? result.failedRows : [];
      const totalRows = Number(result.totalRows || rows.length);
      const successCount = Number(result.successCount || 0);
      const createdBooks = Number(result.createdBooks || 0);
      const createdChapters = Number(result.createdChapters || 0);

      if (!response.ok) {
        throw new Error(result.message || `Import gagal (${response.status}).`);
      }

      setSummary({
        totalRows,
        successCount,
        failedRows,
        createdBooks,
        createdChapters,
      });

      if (failedRows.length > 0) {
        showToast(
          `Import selesai parsial: ${successCount}/${totalRows} baris berhasil.`,
          "error",
        );
      } else {
        showToast(`Import selesai: ${successCount} baris berhasil.`, "success");
      }
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-surface-secondary bg-surface-primary p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-text-primary">Import Excel</h2>
            <p className="text-sm text-text-secondary">
              Upload `.xlsx`, cek preview, lalu import batch ke bahasa+versi aktif.
            </p>
            <p className="mt-2 text-xs text-text-secondary">
              Header disarankan:{" "}
              <code className="rounded bg-surface-secondary px-1 py-0.5">
                book_name, grouping, order_index, chapter, verse, text, pericope
              </code>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              className="inline-flex items-center gap-2 rounded-lg border border-surface-secondary px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-secondary/60 disabled:opacity-60"
            >
              {parsing ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
              {parsing ? "Memproses..." : "Pilih File"}
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!canImport}
              className="inline-flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-text-inverse hover:bg-action/90 disabled:opacity-60"
            >
              {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {importing ? "Importing..." : "Import Sekarang"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-surface-secondary bg-surface-secondary/30 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-text-secondary">File</p>
            <p className="mt-1 text-sm font-semibold text-text-primary">{fileName || "-"}</p>
          </div>
          <div className="rounded-lg border border-surface-secondary bg-surface-secondary/30 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-text-secondary">Rows Parsed</p>
            <p className="mt-1 text-sm font-semibold text-text-primary">{rows.length}</p>
          </div>
          <div className="rounded-lg border border-surface-secondary bg-surface-secondary/30 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-text-secondary">Errors</p>
            <p className="mt-1 text-sm font-semibold text-status-error">{errors.length}</p>
          </div>
          <div className="rounded-lg border border-surface-secondary bg-surface-secondary/30 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-text-secondary">Scope</p>
            <p className="mt-1 text-xs font-mono text-text-primary">
              {lang.toUpperCase()} / {version}
            </p>
          </div>
        </div>
      </section>

      {summary ? (
        <section className="rounded-2xl border border-surface-secondary bg-surface-primary p-5 shadow-sm">
          <h3 className="text-base font-bold text-text-primary">Hasil Import</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-surface-secondary bg-surface-secondary/30 px-3 py-2">
              <p className="text-xs uppercase text-text-secondary">Total</p>
              <p className="mt-1 text-lg font-bold text-text-primary">{summary.totalRows}</p>
            </div>
            <div className="rounded-lg border border-surface-secondary bg-surface-secondary/30 px-3 py-2">
              <p className="text-xs uppercase text-text-secondary">Berhasil</p>
              <p className="mt-1 text-lg font-bold text-status-success">{summary.successCount}</p>
            </div>
            <div className="rounded-lg border border-surface-secondary bg-surface-secondary/30 px-3 py-2">
              <p className="text-xs uppercase text-text-secondary">Kitab Baru</p>
              <p className="mt-1 text-lg font-bold text-text-primary">{summary.createdBooks}</p>
            </div>
            <div className="rounded-lg border border-surface-secondary bg-surface-secondary/30 px-3 py-2">
              <p className="text-xs uppercase text-text-secondary">Pasal Baru</p>
              <p className="mt-1 text-lg font-bold text-text-primary">
                {summary.createdChapters}
              </p>
            </div>
          </div>

          {summary.failedRows.length > 0 ? (
            <div className="mt-4 rounded-xl border border-status-error/30 bg-status-error/10 p-4">
              <p className="mb-2 text-sm font-semibold text-status-error">
                {summary.failedRows.length} baris gagal:
              </p>
              <ul className="space-y-1 text-xs text-status-error">
                {summary.failedRows.slice(0, 40).map((item, index) => (
                  <li key={`${item}-${index}`}>- {item}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-status-success/10 px-3 py-2 text-sm font-semibold text-status-success">
              <CheckCircle2 size={16} />
              Semua baris berhasil diimport.
            </div>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-surface-secondary bg-surface-primary p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-text-primary">Preview Parsed Rows</h3>
          <span className="text-xs text-text-secondary">
            Menampilkan {previewRows.length} dari {rows.length} baris
          </span>
        </div>

        {errors.length > 0 ? (
          <div className="mb-4 rounded-xl border border-status-error/30 bg-status-error/10 p-4">
            <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-status-error">
              <XCircle size={16} />
              Error Parsing ({errors.length})
            </div>
            <ul className="space-y-1 text-xs text-status-error">
              {errors.slice(0, 50).map((errorItem, index) => (
                <li key={`${errorItem}-${index}`}>- {errorItem}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-surface-secondary">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-secondary/60 uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-2 py-2">Row</th>
                <th className="px-2 py-2">Book</th>
                <th className="px-2 py-2">Group</th>
                <th className="px-2 py-2">Order</th>
                <th className="px-2 py-2">Chapter</th>
                <th className="px-2 py-2">Verse</th>
                <th className="px-2 py-2">Text</th>
                <th className="px-2 py-2">Pericope</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-2 py-8 text-center text-text-secondary">
                    Belum ada data preview.
                  </td>
                </tr>
              ) : (
                previewRows.map((row) => (
                  <tr key={row.rowNumber} className="border-t border-surface-secondary/70 align-top">
                    <td className="px-2 py-2 font-semibold text-text-primary">{row.rowNumber}</td>
                    <td className="px-2 py-2 text-text-primary">{row.book_name}</td>
                    <td className="px-2 py-2 text-text-secondary">{row.grouping || "-"}</td>
                    <td className="px-2 py-2 text-text-secondary">{row.order_index || "-"}</td>
                    <td className="px-2 py-2 text-text-secondary">{row.chapter}</td>
                    <td className="px-2 py-2 text-text-secondary">{row.verse}</td>
                    <td className="px-2 py-2 text-text-primary">{row.text}</td>
                    <td className="px-2 py-2 text-text-secondary">{row.pericope || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
