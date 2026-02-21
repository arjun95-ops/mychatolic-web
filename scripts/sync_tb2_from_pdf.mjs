#!/usr/bin/env node

import fs from "fs";
import path from "path";
import process from "process";
import { createClient } from "@supabase/supabase-js";

const TARGET_LANG = "id";
const TARGET_VERSION = "TB2";
const FALLBACK_VERSION = "TB1";
const DEFAULT_EXTRACT = "tmp/tb2_pdf_extract_full.json";
const DEFAULT_REPORT = "docs/import/tb2_pdf_sync_report.json";

function parseArgs(argv) {
  const args = {
    extract: DEFAULT_EXTRACT,
    report: DEFAULT_REPORT,
    dryRun: false,
    fallbackVersion: FALLBACK_VERSION,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--extract") args.extract = String(argv[i + 1] || "");
    else if (token === "--report") args.report = String(argv[i + 1] || "");
    else if (token === "--fallback-version") args.fallbackVersion = String(argv[i + 1] || "");
    else if (token === "--dry-run") args.dryRun = true;

    if (["--extract", "--report", "--fallback-version"].includes(token)) i += 1;
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
  const dedupedValues = [];
  const seen = new Set();
  for (const value of values) {
    const key = String(value || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    dedupedValues.push(value);
  }

  const rows = [];
  for (const chunk of chunkArray(dedupedValues, 200)) {
    if (chunk.length === 0) continue;
    const partial = await fetchAll(client, table, selectClause, pageSize, (query) => query.in(column, chunk));
    rows.push(...partial);
  }
  return rows;
}

function getExtractedVerse(extractedBooks, bookName, chapterNumber, verseNumber) {
  const byBook = extractedBooks[bookName];
  if (!byBook || typeof byBook !== "object") return null;
  const byChapter = byBook[String(chapterNumber)];
  if (!byChapter || typeof byChapter !== "object") return null;
  const row = byChapter[String(verseNumber)];
  if (!row || typeof row !== "object") return null;
  return row;
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

  if (!fs.existsSync(args.extract)) {
    throw new Error(`File extract tidak ditemukan: ${args.extract}`);
  }

  const extractPayload = JSON.parse(fs.readFileSync(args.extract, "utf8"));
  const extractedBooks = extractPayload?.books || {};

  const client = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const startedAt = new Date().toISOString();

  const targetBooks = await fetchAll(
    client,
    "bible_books",
    "id,name,order_index,legacy_book_id",
    1000,
    (query) =>
      query
        .eq("language_code", TARGET_LANG)
        .eq("version_code", TARGET_VERSION)
        .order("order_index", { ascending: true }),
  );
  if (targetBooks.length === 0) throw new Error("Workspace target TB2 tidak ditemukan.");

  const fallbackBooks = await fetchAll(
    client,
    "bible_books",
    "id,name,order_index",
    1000,
    (query) =>
      query
        .eq("language_code", TARGET_LANG)
        .eq("version_code", args.fallbackVersion)
        .order("order_index", { ascending: true }),
  );
  if (fallbackBooks.length === 0) throw new Error(`Workspace fallback ${args.fallbackVersion} tidak ditemukan.`);

  const targetBookById = new Map(targetBooks.map((item) => [String(item.id), item]));
  const targetBookByKey = new Map(targetBooks.map((item) => [normalizeBookKey(item.name), item]));
  const fallbackBookByKey = new Map(fallbackBooks.map((item) => [normalizeBookKey(item.name), item]));

  const targetBookIds = targetBooks.map((item) => String(item.id));
  const fallbackBookIds = fallbackBooks.map((item) => String(item.id));

  const targetChapters = targetBookIds.length
    ? await fetchByInChunks(client, "bible_chapters", "id,book_id,chapter_number", "book_id", targetBookIds, 1000)
    : [];
  const fallbackChapters = fallbackBookIds.length
    ? await fetchByInChunks(client, "bible_chapters", "id,book_id,chapter_number", "book_id", fallbackBookIds, 1000)
    : [];

  const targetChapterById = new Map(targetChapters.map((item) => [String(item.id), item]));
  const targetChapterByBookAndNumber = new Map(
    targetChapters.map((item) => [`${item.book_id}::${item.chapter_number}`, item]),
  );
  const fallbackChapterByBookAndNumber = new Map(
    fallbackChapters.map((item) => [`${item.book_id}::${item.chapter_number}`, item]),
  );

  const targetChapterIds = targetChapters.map((item) => String(item.id));
  const fallbackChapterIds = fallbackChapters.map((item) => String(item.id));

  const targetVerses = targetChapterIds.length
    ? await fetchByInChunks(
        client,
        "bible_verses",
        "id,chapter_id,verse_number,text,pericope,book_id,chapter,content,type",
        "chapter_id",
        targetChapterIds,
        1000,
      )
    : [];
  const fallbackVerses = fallbackChapterIds.length
    ? await fetchByInChunks(
        client,
        "bible_verses",
        "id,chapter_id,verse_number,text,pericope",
        "chapter_id",
        fallbackChapterIds,
        1000,
      )
    : [];

  const fallbackVerseMap = new Map();
  for (const row of fallbackVerses) {
    const chapter = fallbackChapters.find((item) => String(item.id) === String(row.chapter_id));
    if (!chapter) continue;
    const book = fallbackBooks.find((item) => String(item.id) === String(chapter.book_id));
    if (!book) continue;
    const key = `${normalizeBookKey(book.name)}::${Number(chapter.chapter_number)}::${Number(row.verse_number)}`;
    fallbackVerseMap.set(key, {
      text: normalizeText(row.text),
      pericope: normalizeText(row.pericope) || null,
    });
  }

  const updates = [];
  const unresolved = [];
  let extractedApplied = 0;
  let fallbackApplied = 0;
  let keptExisting = 0;
  let targetPlaceholdersBefore = 0;
  let targetPlaceholdersAfterProjected = 0;

  for (const row of targetVerses) {
    const verseNumber = Number(row.verse_number || 0);
    if (!Number.isInteger(verseNumber) || verseNumber < 1) {
      continue;
    }
    const chapter = targetChapterById.get(String(row.chapter_id));
    if (!chapter) continue;
    const book = targetBookById.get(String(chapter.book_id));
    if (!book) continue;
    const bookName = normalizeText(book.name);
    const chapterNumber = Number(chapter.chapter_number || 0);
    if (!Number.isInteger(chapterNumber) || chapterNumber < 1) continue;

    const existingText = normalizeText(row.text);
    if (existingText.startsWith("[MISSING_VERSE][AUTO]")) {
      targetPlaceholdersBefore += 1;
    }

    const extracted = getExtractedVerse(extractedBooks, bookName, chapterNumber, verseNumber);
    const extractedText = normalizeText(extracted?.text);
    const extractedPericope = normalizeText(extracted?.pericope) || null;

    let nextText = "";
    let nextPericope = normalizeText(row.pericope) || null;
    let source = "existing";

    if (extractedText) {
      nextText = extractedText;
      if (extractedPericope) nextPericope = extractedPericope;
      source = "extract";
      extractedApplied += 1;
    } else {
      const fallbackKey = `${normalizeBookKey(bookName)}::${chapterNumber}::${verseNumber}`;
      const fallback = fallbackVerseMap.get(fallbackKey) || null;
      if (fallback?.text) {
        nextText = fallback.text;
        if (fallback.pericope) nextPericope = fallback.pericope;
        source = "fallback_tb1";
        fallbackApplied += 1;
      } else if (existingText) {
        nextText = existingText;
        source = "existing";
        keptExisting += 1;
      } else {
        unresolved.push({
          book: bookName,
          chapter: chapterNumber,
          verse: verseNumber,
        });
        source = "unresolved";
      }
    }

    if (!nextText) {
      targetPlaceholdersAfterProjected += 1;
      continue;
    }
    if (nextText.startsWith("[MISSING_VERSE][AUTO]")) {
      targetPlaceholdersAfterProjected += 1;
    }

    updates.push({
      id: String(row.id),
      chapter_id: String(row.chapter_id),
      verse_number: verseNumber,
      text: nextText,
      content: nextText,
      pericope: nextPericope || null,
      type: "text",
      book_id: row.book_id ?? null,
      chapter: row.chapter ?? null,
      source,
    });
  }

  if (!args.dryRun && updates.length > 0) {
    for (const chunk of chunkArray(updates, 500)) {
      const payload = chunk.map((item) => ({
        id: item.id,
        chapter_id: item.chapter_id,
        verse_number: item.verse_number,
        text: item.text,
        content: item.content,
        pericope: item.pericope,
        type: item.type,
        book_id: item.book_id,
        chapter: item.chapter,
      }));
      const { error } = await client
        .from("bible_verses")
        .upsert(payload, { onConflict: "id", ignoreDuplicates: false });
      if (error) throw new Error(`Gagal upsert bible_verses TB2 dari PDF: ${error.message}`);
    }
  }

  const report = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    dry_run: args.dryRun,
    source_extract: args.extract,
    target_workspace: `${TARGET_LANG}/${TARGET_VERSION}`,
    fallback_workspace: `${TARGET_LANG}/${args.fallbackVersion}`,
    summary: {
      target_books: targetBooks.length,
      target_chapters: targetChapters.length,
      target_verses_text_rows: targetVerses.filter((item) => Number(item.verse_number || 0) > 0).length,
      updates_prepared: updates.length,
      extracted_applied: extractedApplied,
      fallback_tb1_applied: fallbackApplied,
      kept_existing_applied: keptExisting,
      unresolved_rows: unresolved.length,
      target_placeholders_before: targetPlaceholdersBefore,
      target_placeholders_after_projected: targetPlaceholdersAfterProjected,
    },
    samples: {
      unresolved: unresolved.slice(0, 300),
      updates_from_extract: updates.filter((item) => item.source === "extract").slice(0, 80),
      updates_from_fallback: updates.filter((item) => item.source === "fallback_tb1").slice(0, 80),
    },
  };

  safeJsonWrite(args.report || DEFAULT_REPORT, report);
  console.log("TB2 PDF sync summary:");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report saved to: ${args.report || DEFAULT_REPORT}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
