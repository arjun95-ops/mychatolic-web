#!/usr/bin/env node

import fs from "fs";
import path from "path";
import process from "process";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_LANG = "id";
const DEFAULT_VERSION = "TB2";
const DEFAULT_CSV = "docs/import/tb2_text_refined.csv";
const DEFAULT_REPORT = "docs/import/tb2_text_import_report.json";

function parseArgs(argv) {
  const args = {
    lang: DEFAULT_LANG,
    version: DEFAULT_VERSION,
    csv: DEFAULT_CSV,
    report: DEFAULT_REPORT,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--lang") args.lang = String(argv[i + 1] || "");
    else if (token === "--version") args.version = String(argv[i + 1] || "");
    else if (token === "--csv") args.csv = String(argv[i + 1] || "");
    else if (token === "--report") args.report = String(argv[i + 1] || "");
    else if (token === "--dry-run") args.dryRun = true;
    if (["--lang", "--version", "--csv", "--report"].includes(token)) i += 1;
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

function safeJsonWrite(filePath, data) {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

async function fetchAll(client, table, selectClause, pageSize = 1000, builder = null) {
  const rows = [];
  let from = 0;

  while (true) {
    let query = client.from(table).select(selectClause).range(from, from + pageSize - 1);
    if (typeof builder === "function") {
      query = builder(query);
    }
    query = query.order("id", { ascending: true });

    const { data, error } = await query;
    if (error) throw new Error(`Gagal query ${table}: ${error.message}`);
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchByInChunks(client, table, selectClause, column, values, pageSize = 1000) {
  const rows = [];
  for (const chunk of chunkArray(values, 200)) {
    if (chunk.length === 0) continue;
    const partial = await fetchAll(client, table, selectClause, pageSize, (query) => query.in(column, chunk));
    rows.push(...partial);
  }
  return rows;
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(current);
      current = "";
      continue;
    }
    if (ch === "\n") {
      row.push(current);
      current = "";
      rows.push(row);
      row = [];
      continue;
    }
    if (ch === "\r") {
      continue;
    }
    current += ch;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const header = rows[0].map((item) => String(item || "").trim());
  const output = [];
  for (let i = 1; i < rows.length; i += 1) {
    const parts = rows[i];
    if (parts.length === 1 && String(parts[0] || "").trim() === "") continue;
    const obj = {};
    for (let c = 0; c < header.length; c += 1) {
      obj[header[c]] = parts[c] == null ? "" : String(parts[c]);
    }
    output.push(obj);
  }
  return output;
}

function normalizeText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeBookKey(value) {
  return normalizeText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.csv)) throw new Error(`CSV tidak ditemukan: ${args.csv}`);

  const csvRows = parseCsv(fs.readFileSync(args.csv, "utf8"));
  const csvMap = new Map();
  for (const row of csvRows) {
    const key = `${normalizeBookKey(row.book_name)}::${Number(row.chapter || 0)}::${Number(row.verse || 0)}`;
    csvMap.set(key, {
      text: normalizeText(row.text),
      pericope: normalizeText(row.pericope) || null,
    });
  }

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

  const books = await fetchAll(
    client,
    "bible_books",
    "id,name,order_index,legacy_book_id",
    1000,
    (query) =>
      query
        .eq("language_code", args.lang)
        .eq("version_code", args.version)
        .order("order_index", { ascending: true }),
  );
  const bookIds = books.map((item) => String(item.id));
  const chapters = bookIds.length
    ? await fetchByInChunks(client, "bible_chapters", "id,book_id,chapter_number", "book_id", bookIds, 1000)
    : [];
  const chapterIds = chapters.map((item) => String(item.id));
  const verses = chapterIds.length
    ? await fetchByInChunks(
        client,
        "bible_verses",
        "id,chapter_id,verse_number,text,pericope,book_id,chapter,content,type",
        "chapter_id",
        chapterIds,
        1000,
      )
    : [];

  const bookById = new Map(books.map((item) => [String(item.id), item]));
  const chapterById = new Map(chapters.map((item) => [String(item.id), item]));

  const updates = [];
  const missingInCsv = [];
  let changedRows = 0;
  let unchangedRows = 0;

  for (const row of verses) {
    const verseNumber = Number(row.verse_number || 0);
    if (!Number.isInteger(verseNumber) || verseNumber < 1) continue;
    const chapter = chapterById.get(String(row.chapter_id));
    if (!chapter) continue;
    const book = bookById.get(String(chapter.book_id));
    if (!book) continue;

    const key = `${normalizeBookKey(book.name)}::${Number(chapter.chapter_number)}::${verseNumber}`;
    const csvValue = csvMap.get(key);
    if (!csvValue) {
      if (missingInCsv.length < 500) {
        missingInCsv.push({
          book: String(book.name || ""),
          chapter: Number(chapter.chapter_number || 0),
          verse: verseNumber,
        });
      }
      continue;
    }

    const currentText = normalizeText(row.text);
    const currentPericope = normalizeText(row.pericope) || null;
    const nextText = csvValue.text || currentText;
    const nextPericope = csvValue.pericope || null;

    if (currentText === nextText && currentPericope === nextPericope) {
      unchangedRows += 1;
      continue;
    }
    changedRows += 1;

    updates.push({
      id: String(row.id),
      chapter_id: String(row.chapter_id),
      verse_number: verseNumber,
      book_id: row.book_id ?? null,
      chapter: row.chapter ?? null,
      text: nextText,
      content: nextText,
      pericope: nextPericope,
      type: "text",
    });
  }

  if (!args.dryRun && updates.length > 0) {
    for (const chunk of chunkArray(updates, 500)) {
      const payload = chunk.map((item) => ({
        id: item.id,
        chapter_id: item.chapter_id,
        verse_number: item.verse_number,
        book_id: item.book_id,
        chapter: item.chapter,
        text: item.text,
        content: item.content,
        pericope: item.pericope,
        type: item.type,
      }));
      const { error } = await client
        .from("bible_verses")
        .upsert(payload, { onConflict: "id", ignoreDuplicates: false });
      if (error) throw new Error(`Gagal upsert bible_verses dari CSV: ${error.message}`);
    }
  }

  const report = {
    dry_run: args.dryRun,
    lang: args.lang,
    version: args.version,
    csv: args.csv,
    summary: {
      csv_rows: csvRows.length,
      db_books: books.length,
      db_chapters: chapters.length,
      db_verses_text_rows: verses.filter((item) => Number(item.verse_number || 0) > 0).length,
      updates_prepared: updates.length,
      rows_changed: changedRows,
      rows_unchanged: unchangedRows,
      missing_in_csv: missingInCsv.length,
    },
    samples: {
      missing_in_csv: missingInCsv.slice(0, 200),
      updates: updates.slice(0, 120),
    },
  };

  safeJsonWrite(args.report, report);
  console.log("TB CSV import summary:");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report saved to: ${args.report}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

