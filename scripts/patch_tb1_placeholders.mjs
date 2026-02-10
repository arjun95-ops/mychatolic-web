#!/usr/bin/env node

import fs from "fs";
import path from "path";
import process from "process";
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

const PLACEHOLDER_PREFIX = "[MISSING_VERSE][AUTO]";
const DEFAULT_LANG = "id";
const DEFAULT_VERSION = "TB1";
const DEFAULT_INPUT = "docs/import/tb1_placeholder_patch_template.csv";
const DEFAULT_TEMPLATE_OUT = "docs/import/tb1_placeholder_patch_template.csv";
const DEFAULT_REPORT = "docs/import/tb1_placeholder_patch_apply_report.json";

function parseArgs(argv) {
  const args = {
    lang: DEFAULT_LANG,
    version: DEFAULT_VERSION,
    input: DEFAULT_INPUT,
    templateOut: DEFAULT_TEMPLATE_OUT,
    report: DEFAULT_REPORT,
    dryRun: false,
    allowNonPlaceholder: false,
    generateTemplate: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") args.dryRun = true;
    else if (token === "--allow-non-placeholder") args.allowNonPlaceholder = true;
    else if (token === "--generate-template") args.generateTemplate = true;
    else if (token === "--lang") args.lang = String(argv[i + 1] || "");
    else if (token === "--version") args.version = String(argv[i + 1] || "");
    else if (token === "--input") args.input = String(argv[i + 1] || "");
    else if (token === "--template-out") args.templateOut = String(argv[i + 1] || "");
    else if (token === "--report") args.report = String(argv[i + 1] || "");

    if (
      token === "--lang" ||
      token === "--version" ||
      token === "--input" ||
      token === "--template-out" ||
      token === "--report"
    ) {
      i += 1;
    }
  }

  return args;
}

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  const text = fs.readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/g)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function normalizeBookKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parsePositiveInt(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseOptionalText(value) {
  const text = String(value || "").trim();
  return text ? text : null;
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function normalizeHeaders(inputRow) {
  const row = {};
  for (const [key, value] of Object.entries(inputRow || {})) {
    const normalized = String(key || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    row[normalized] = value;
  }
  return row;
}

function rowToPatch(rowRaw, rowNumber) {
  const row = normalizeHeaders(rowRaw);
  const bookName = String(row.book_name ?? row.book ?? row.kitab ?? "").trim();
  const chapter = parsePositiveInt(row.chapter ?? row.chapter_number ?? row.pasal);
  const verse = parsePositiveInt(row.verse ?? row.verse_number ?? row.ayat);
  const text = String(row.text ?? row.content ?? "").trim();
  const pericope = parseOptionalText(row.pericope ?? row.perikop);
  const grouping = parseOptionalText(row.grouping ?? row.category ?? row.kategori);

  return {
    rowNumber,
    bookName,
    chapter,
    verse,
    text,
    pericope,
    grouping,
  };
}

async function fetchWorkspaceBooks(client, lang, version) {
  const { data, error } = await client
    .from("bible_books")
    .select("id,name,abbreviation,grouping,order_index,legacy_book_id")
    .eq("language_code", lang)
    .eq("version_code", version)
    .order("order_index", { ascending: true });
  if (error) throw new Error(`Gagal memuat bible_books: ${error.message}`);
  return data || [];
}

async function fetchWorkspaceChapters(client, bookIds) {
  const chapters = [];
  for (const chunk of chunkArray(bookIds, 500)) {
    if (chunk.length === 0) continue;
    const { data, error } = await client
      .from("bible_chapters")
      .select("id,book_id,chapter_number")
      .in("book_id", chunk);
    if (error) throw new Error(`Gagal memuat bible_chapters: ${error.message}`);
    chapters.push(...(data || []));
  }
  return chapters;
}

async function fetchPlaceholders(client, chapterIds) {
  const rows = [];
  for (const chunk of chunkArray(chapterIds, 500)) {
    if (chunk.length === 0) continue;
    const { data, error } = await client
      .from("bible_verses")
      .select("id,chapter_id,verse_number,text,pericope")
      .in("chapter_id", chunk)
      .ilike("text", `${PLACEHOLDER_PREFIX}%`);
    if (error) throw new Error(`Gagal memuat placeholder verses: ${error.message}`);
    rows.push(...(data || []));
  }
  return rows;
}

async function fetchVersesByChapters(client, chapterIds) {
  const rows = [];
  for (const chunk of chunkArray(chapterIds, 500)) {
    if (chunk.length === 0) continue;
    const { data, error } = await client
      .from("bible_verses")
      .select("id,chapter_id,verse_number,text,pericope")
      .in("chapter_id", chunk);
    if (error) throw new Error(`Gagal memuat verse targets: ${error.message}`);
    rows.push(...(data || []));
  }
  return rows;
}

async function ensureChapter(client, chapterByKey, bookId, chapterNumber) {
  const key = `${bookId}::${chapterNumber}`;
  const existing = chapterByKey.get(key);
  if (existing) return existing;

  const { data, error } = await client
    .from("bible_chapters")
    .upsert(
      {
        book_id: bookId,
        chapter_number: chapterNumber,
      },
      { onConflict: "book_id,chapter_number", ignoreDuplicates: false },
    )
    .select("id,book_id,chapter_number")
    .maybeSingle();
  if (error) throw new Error(`Gagal ensure chapter ${key}: ${error.message}`);
  if (!data?.id) throw new Error(`Chapter ${key} tidak bisa dibuat/diambil.`);

  chapterByKey.set(key, data);
  return data;
}

function buildBookLookup(books) {
  const lookup = new Map();
  for (const book of books) {
    const names = [book.name, book.abbreviation].filter(Boolean);
    for (const rawName of names) {
      const key = normalizeBookKey(rawName);
      if (!key) continue;
      if (!lookup.has(key)) lookup.set(key, []);
      lookup.get(key).push(book);
    }
  }
  return lookup;
}

function resolveBook(lookup, rawBookName) {
  const key = normalizeBookKey(rawBookName);
  const matches = lookup.get(key) || [];
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  // Prioritaskan nama lengkap exact (bukan abbreviation).
  const exactName = matches.find((book) => normalizeBookKey(book.name) === key);
  return exactName || matches[0];
}

function writeTemplateCsv(filePath, rows) {
  const lines = ["book_name,grouping,chapter,verse,text,pericope,notes"];
  for (const row of rows) {
    lines.push(
      [
        row.book_name,
        row.grouping || "",
        row.chapter,
        row.verse,
        "",
        "",
        "Isi teks final ayat di kolom text",
      ].join(","),
    );
  }
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function safeJsonWrite(filePath, data) {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function isPlaceholderText(text) {
  return String(text || "").startsWith(PLACEHOLDER_PREFIX);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv(path.join(process.cwd(), ".env.local"));
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const client = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const lang = String(args.lang || DEFAULT_LANG).trim().toLowerCase();
  const version = String(args.version || DEFAULT_VERSION).trim().toUpperCase();

  const books = await fetchWorkspaceBooks(client, lang, version);
  if (books.length === 0) {
    console.error(`Workspace ${lang}/${version} tidak punya kitab.`);
    process.exit(1);
  }
  const bookLookup = buildBookLookup(books);
  const chapters = await fetchWorkspaceChapters(
    client,
    books.map((b) => b.id),
  );
  const chapterByKey = new Map(chapters.map((c) => [`${c.book_id}::${c.chapter_number}`, c]));

  const placeholders = await fetchPlaceholders(
    client,
    chapters.map((c) => c.id),
  );
  const placeholderRows = placeholders
    .map((v) => {
      const chapter = chapters.find((c) => c.id === v.chapter_id);
      if (!chapter) return null;
      const book = books.find((b) => b.id === chapter.book_id);
      if (!book) return null;
      return {
        book_name: book.name,
        grouping: book.grouping,
        order_index: Number(book.order_index || 0),
        chapter: chapter.chapter_number,
        verse: v.verse_number,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order_index - b.order_index || a.chapter - b.chapter || a.verse - b.verse);

  if (args.generateTemplate) {
    writeTemplateCsv(path.join(process.cwd(), args.templateOut), placeholderRows);
    console.log(
      `Template generated: ${args.templateOut} (${placeholderRows.length} rows, workspace ${lang}/${version})`,
    );
    if (args.dryRun) return;
  }

  const inputPath = path.join(process.cwd(), args.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input CSV not found: ${args.input}`);
    process.exit(1);
  }

  const workbook = XLSX.readFile(inputPath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
  const parsedRows = rawRows.map((row, idx) => rowToPatch(row, idx + 2));

  const summary = {
    generated_at: new Date().toISOString(),
    workspace: `${lang}/${version}`,
    input: args.input,
    report: args.report,
    dry_run: args.dryRun,
    allow_non_placeholder: args.allowNonPlaceholder,
    total_input_rows: parsedRows.length,
    valid_rows: 0,
    inserted: 0,
    updated: 0,
    skipped_invalid: 0,
    skipped_empty_text: 0,
    skipped_missing_book: 0,
    skipped_missing_legacy_book_id: 0,
    skipped_non_placeholder_existing: 0,
    failed: 0,
    details: [],
  };

  const candidateRows = [];
  for (const row of parsedRows) {
    if (!row.bookName || !row.chapter || !row.verse) {
      summary.skipped_invalid += 1;
      summary.details.push({
        row: row.rowNumber,
        status: "skipped_invalid",
        reason: "book_name/chapter/verse wajib valid.",
      });
      continue;
    }
    if (!row.text) {
      summary.skipped_empty_text += 1;
      summary.details.push({
        row: row.rowNumber,
        status: "skipped_empty_text",
        reason: "Kolom text kosong.",
      });
      continue;
    }
    if (isPlaceholderText(row.text)) {
      summary.skipped_invalid += 1;
      summary.details.push({
        row: row.rowNumber,
        status: "skipped_invalid",
        reason: "Kolom text masih placeholder.",
      });
      continue;
    }

    const book = resolveBook(bookLookup, row.bookName);
    if (!book) {
      summary.skipped_missing_book += 1;
      summary.details.push({
        row: row.rowNumber,
        status: "skipped_missing_book",
        reason: `Book tidak ditemukan di workspace: ${row.bookName}`,
      });
      continue;
    }

    const legacyBookId = parsePositiveInt(book.legacy_book_id);
    if (!legacyBookId) {
      summary.skipped_missing_legacy_book_id += 1;
      summary.details.push({
        row: row.rowNumber,
        status: "skipped_missing_legacy_book_id",
        reason: `Book ${book.name} belum punya legacy_book_id`,
      });
      continue;
    }

    candidateRows.push({
      ...row,
      resolvedBook: book,
      legacyBookId,
    });
  }

  summary.valid_rows = candidateRows.length;
  if (candidateRows.length === 0) {
    safeJsonWrite(path.join(process.cwd(), args.report), summary);
    console.log("Tidak ada row valid untuk diproses.");
    return;
  }

  for (const row of candidateRows) {
    try {
      const chapter = await ensureChapter(
        client,
        chapterByKey,
        row.resolvedBook.id,
        row.chapter,
      );
      const chapterId = chapter.id;
      const verseNumber = row.verse;

      const existingRows = await fetchVersesByChapters(client, [chapterId]);
      const existing = existingRows.find((v) => Number(v.verse_number) === verseNumber) || null;
      const existingIsPlaceholder = existing ? isPlaceholderText(existing.text) : false;

      if (existing && !args.allowNonPlaceholder && !existingIsPlaceholder) {
        summary.skipped_non_placeholder_existing += 1;
        summary.details.push({
          row: row.rowNumber,
          status: "skipped_non_placeholder_existing",
          key: `${row.resolvedBook.name} ${row.chapter}:${row.verse}`,
        });
        continue;
      }

      const payload = {
        chapter_id: chapterId,
        verse_number: verseNumber,
        text: row.text,
        pericope: row.pericope,
        book_id: row.legacyBookId,
        chapter: row.chapter,
        content: row.text,
        type: "text",
      };

      if (!args.dryRun) {
        const { error } = await client
          .from("bible_verses")
          .upsert(payload, { onConflict: "chapter_id,verse_number", ignoreDuplicates: false });
        if (error) {
          summary.failed += 1;
          summary.details.push({
            row: row.rowNumber,
            status: "failed",
            key: `${row.resolvedBook.name} ${row.chapter}:${row.verse}`,
            reason: error.message,
          });
          continue;
        }
      }

      if (existing) {
        summary.updated += 1;
        summary.details.push({
          row: row.rowNumber,
          status: args.dryRun ? "dry_run_update" : "updated",
          key: `${row.resolvedBook.name} ${row.chapter}:${row.verse}`,
        });
      } else {
        summary.inserted += 1;
        summary.details.push({
          row: row.rowNumber,
          status: args.dryRun ? "dry_run_insert" : "inserted",
          key: `${row.resolvedBook.name} ${row.chapter}:${row.verse}`,
        });
      }
    } catch (error) {
      summary.failed += 1;
      summary.details.push({
        row: row.rowNumber,
        status: "failed",
        key: `${row.bookName} ${row.chapter}:${row.verse}`,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const finalChapters = await fetchWorkspaceChapters(
    client,
    books.map((b) => b.id),
  );
  const remainingPlaceholderRows = await fetchPlaceholders(
    client,
    finalChapters.map((c) => c.id),
  );
  summary.remaining_placeholders = remainingPlaceholderRows.length;

  safeJsonWrite(path.join(process.cwd(), args.report), summary);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
