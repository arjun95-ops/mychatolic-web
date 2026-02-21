#!/usr/bin/env node

import fs from "fs";
import path from "path";
import process from "process";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_LANG = "id";
const DEFAULT_VERSION = "TB2";
const DEFAULT_OUTPUT = "docs/import/tb2_text_raw.csv";

function parseArgs(argv) {
  const args = {
    lang: DEFAULT_LANG,
    version: DEFAULT_VERSION,
    out: DEFAULT_OUTPUT,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--lang") args.lang = String(argv[i + 1] || "");
    else if (token === "--version") args.version = String(argv[i + 1] || "");
    else if (token === "--out") args.out = String(argv[i + 1] || "");
    if (["--lang", "--version", "--out"].includes(token)) i += 1;
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

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsv(filePath, rows) {
  ensureDirForFile(filePath);
  const fields = ["book_name", "grouping", "order_index", "chapter", "verse", "text", "pericope"];
  const lines = [fields.join(",")];
  for (const row of rows) {
    lines.push(fields.map((field) => csvEscape(row[field] ?? "")).join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
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

  const books = await fetchAll(
    client,
    "bible_books",
    "id,name,grouping,order_index",
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
  const versesRaw = chapterIds.length
    ? await fetchByInChunks(
        client,
        "bible_verses",
        "id,chapter_id,verse_number,text,pericope",
        "chapter_id",
        chapterIds,
        1000,
      )
    : [];

  const bookById = new Map(books.map((item) => [String(item.id), item]));
  const chapterById = new Map(chapters.map((item) => [String(item.id), item]));

  const rows = [];
  for (const row of versesRaw) {
    const verseNumber = Number(row.verse_number || 0);
    if (!Number.isInteger(verseNumber) || verseNumber < 1) continue;
    const chapter = chapterById.get(String(row.chapter_id));
    if (!chapter) continue;
    const book = bookById.get(String(chapter.book_id));
    if (!book) continue;
    rows.push({
      book_name: String(book.name || ""),
      grouping: String(book.grouping || ""),
      order_index: Number(book.order_index || 0),
      chapter: Number(chapter.chapter_number || 0),
      verse: verseNumber,
      text: String(row.text || ""),
      pericope: row.pericope == null ? "" : String(row.pericope),
    });
  }

  rows.sort((a, b) => {
    const o = Number(a.order_index) - Number(b.order_index);
    if (o !== 0) return o;
    const c = Number(a.chapter) - Number(b.chapter);
    if (c !== 0) return c;
    return Number(a.verse) - Number(b.verse);
  });

  writeCsv(args.out, rows);
  console.log(
    JSON.stringify(
      {
        lang: args.lang,
        version: args.version,
        books: books.length,
        chapters: chapters.length,
        verses_exported: rows.length,
        output_csv: args.out,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

