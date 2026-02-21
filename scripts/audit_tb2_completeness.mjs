#!/usr/bin/env node

import fs from "fs";
import path from "path";
import process from "process";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_LANG = "id";
const DEFAULT_SOURCE_VERSION = "TB1";
const DEFAULT_TARGET_VERSION = "TB2";
const DEFAULT_REPORT = "docs/import/tb2_completeness_audit_report.json";
const SAMPLE_LIMIT = 200;

function parseArgs(argv) {
  const args = {
    lang: DEFAULT_LANG,
    sourceVersion: DEFAULT_SOURCE_VERSION,
    targetVersion: DEFAULT_TARGET_VERSION,
    report: DEFAULT_REPORT,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--lang") args.lang = String(argv[i + 1] || "");
    else if (token === "--source-version") args.sourceVersion = String(argv[i + 1] || "");
    else if (token === "--target-version") args.targetVersion = String(argv[i + 1] || "");
    else if (token === "--report") args.report = String(argv[i + 1] || "");

    if (["--lang", "--source-version", "--target-version", "--report"].includes(token)) i += 1;
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

function chapterKey(bookKey, chapterNumber) {
  return `${bookKey}::${chapterNumber}`;
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

function toSetMapCount(setMap) {
  let total = 0;
  for (const set of setMap.values()) total += set.size;
  return total;
}

function compareValueSetMaps(sourceMap, targetMap) {
  const sourceKeys = new Set(sourceMap.keys());
  const targetKeys = new Set(targetMap.keys());
  const allChapterKeys = Array.from(new Set([...sourceKeys, ...targetKeys])).sort();

  const missingEntries = [];
  const extraEntries = [];
  let missingCount = 0;
  let extraCount = 0;

  for (const key of allChapterKeys) {
    const sourceSet = sourceMap.get(key) || new Set();
    const targetSet = targetMap.get(key) || new Set();

    const sourceValues = Array.from(sourceSet).sort((a, b) => a - b);
    for (const value of sourceValues) {
      if (!targetSet.has(value)) {
        missingCount += 1;
        if (missingEntries.length < SAMPLE_LIMIT) {
          missingEntries.push({ chapter_key: key, value });
        }
      }
    }

    const targetValues = Array.from(targetSet).sort((a, b) => a - b);
    for (const value of targetValues) {
      if (!sourceSet.has(value)) {
        extraCount += 1;
        if (extraEntries.length < SAMPLE_LIMIT) {
          extraEntries.push({ chapter_key: key, value });
        }
      }
    }
  }

  return {
    missingCount,
    extraCount,
    missingEntries,
    extraEntries,
  };
}

function compareChapterSets(sourceChapterSet, targetChapterSet) {
  const sourceValues = Array.from(sourceChapterSet).sort();
  const targetValues = Array.from(targetChapterSet).sort();
  const sourceLookup = new Set(sourceValues);
  const targetLookup = new Set(targetValues);

  const missing = [];
  const extra = [];
  for (const key of sourceValues) {
    if (!targetLookup.has(key) && missing.length < SAMPLE_LIMIT) missing.push(key);
  }
  for (const key of targetValues) {
    if (!sourceLookup.has(key) && extra.length < SAMPLE_LIMIT) extra.push(key);
  }

  return {
    missingCount: sourceValues.filter((key) => !targetLookup.has(key)).length,
    extraCount: targetValues.filter((key) => !sourceLookup.has(key)).length,
    missing,
    extra,
  };
}

function makeBookMaps(books) {
  const byId = new Map();
  const byKey = new Map();
  for (const row of books) {
    const key = normalizeBookKey(row.name);
    const item = {
      id: String(row.id),
      key,
      name: normalizeText(row.name),
      abbreviation: normalizeText(row.abbreviation),
      grouping: normalizeText(row.grouping),
      order_index: Number(row.order_index || 0),
    };
    byId.set(item.id, item);
    byKey.set(item.key, item);
  }
  return { byId, byKey };
}

function buildChapterIndex(chapters, bookById) {
  const chapterMetaById = new Map();
  const chapterKeySet = new Set();
  for (const row of chapters) {
    const book = bookById.get(String(row.book_id));
    if (!book) continue;
    const chapterNumber = Number(row.chapter_number || 0);
    if (!Number.isInteger(chapterNumber) || chapterNumber <= 0) continue;
    const key = chapterKey(book.key, chapterNumber);
    chapterMetaById.set(String(row.id), {
      id: String(row.id),
      key,
      chapter_number: chapterNumber,
      book_key: book.key,
      book_name: book.name,
    });
    chapterKeySet.add(key);
  }
  return { chapterMetaById, chapterKeySet };
}

function buildVerseIndexes(verses, chapterMetaById, placeholderPrefix = "") {
  const verseSetByChapter = new Map();
  const pericopeSetByChapter = new Map();
  const rowCountByVerseKey = new Map();
  let placeholderCount = 0;

  for (const row of verses) {
    const chapterMeta = chapterMetaById.get(String(row.chapter_id));
    if (!chapterMeta) continue;

    const verseNumber = Number(row.verse_number);
    if (!Number.isInteger(verseNumber) || verseNumber < 0) continue;

    const cKey = chapterMeta.key;
    if (!verseSetByChapter.has(cKey)) verseSetByChapter.set(cKey, new Set());
    verseSetByChapter.get(cKey).add(verseNumber);

    const pericope = normalizeText(row.pericope);
    if (pericope) {
      if (!pericopeSetByChapter.has(cKey)) pericopeSetByChapter.set(cKey, new Set());
      pericopeSetByChapter.get(cKey).add(verseNumber);
    }

    const text = normalizeText(row.text);
    if (placeholderPrefix && text.startsWith(placeholderPrefix)) placeholderCount += 1;

    const vKey = `${cKey}::${verseNumber}`;
    rowCountByVerseKey.set(vKey, (rowCountByVerseKey.get(vKey) || 0) + 1);
  }

  let duplicateRows = 0;
  const duplicateSamples = [];
  for (const [vKey, count] of rowCountByVerseKey.entries()) {
    if (count <= 1) continue;
    duplicateRows += count - 1;
    if (duplicateSamples.length < SAMPLE_LIMIT) duplicateSamples.push({ verse_key: vKey, count });
  }

  return {
    verseSetByChapter,
    pericopeSetByChapter,
    totalDistinctVerses: toSetMapCount(verseSetByChapter),
    totalPericopeStarts: toSetMapCount(pericopeSetByChapter),
    placeholderCount,
    duplicateRows,
    duplicateSamples,
  };
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

  const sourceBooks = await fetchAll(
    client,
    "bible_books",
    "id,name,abbreviation,grouping,order_index",
    1000,
    (query) =>
      query
        .eq("language_code", args.lang)
        .eq("version_code", args.sourceVersion)
        .order("order_index", { ascending: true }),
  );

  const targetBooks = await fetchAll(
    client,
    "bible_books",
    "id,name,abbreviation,grouping,order_index",
    1000,
    (query) =>
      query
        .eq("language_code", args.lang)
        .eq("version_code", args.targetVersion)
        .order("order_index", { ascending: true }),
  );

  const sourceBookMaps = makeBookMaps(sourceBooks);
  const targetBookMaps = makeBookMaps(targetBooks);
  const sourceBookKeys = new Set(sourceBookMaps.byKey.keys());
  const targetBookKeys = new Set(targetBookMaps.byKey.keys());

  const missingBooks = Array.from(sourceBookKeys).filter((key) => !targetBookKeys.has(key)).sort();
  const extraBooks = Array.from(targetBookKeys).filter((key) => !sourceBookKeys.has(key)).sort();

  const sourceBookIds = sourceBooks.map((row) => String(row.id));
  const targetBookIds = targetBooks.map((row) => String(row.id));

  const sourceChapters = sourceBookIds.length
    ? await fetchByInChunks(client, "bible_chapters", "id,book_id,chapter_number", "book_id", sourceBookIds, 1000)
    : [];
  const targetChapters = targetBookIds.length
    ? await fetchByInChunks(client, "bible_chapters", "id,book_id,chapter_number", "book_id", targetBookIds, 1000)
    : [];

  const sourceChapterIndex = buildChapterIndex(sourceChapters, sourceBookMaps.byId);
  const targetChapterIndex = buildChapterIndex(targetChapters, targetBookMaps.byId);

  const sourceChapterIds = sourceChapters.map((row) => String(row.id));
  const targetChapterIds = targetChapters.map((row) => String(row.id));

  const sourceVerses = sourceChapterIds.length
    ? await fetchByInChunks(
        client,
        "bible_verses",
        "id,chapter_id,verse_number,pericope,text",
        "chapter_id",
        sourceChapterIds,
        1000,
      )
    : [];
  const targetVerses = targetChapterIds.length
    ? await fetchByInChunks(
        client,
        "bible_verses",
        "id,chapter_id,verse_number,pericope,text",
        "chapter_id",
        targetChapterIds,
        1000,
      )
    : [];

  const sourceVerseIndex = buildVerseIndexes(sourceVerses, sourceChapterIndex.chapterMetaById, "");
  const targetVerseIndex = buildVerseIndexes(
    targetVerses,
    targetChapterIndex.chapterMetaById,
    "[MISSING_VERSE][AUTO][TB2]",
  );

  const chapterComparison = compareChapterSets(
    sourceChapterIndex.chapterKeySet,
    targetChapterIndex.chapterKeySet,
  );
  const verseComparison = compareValueSetMaps(
    sourceVerseIndex.verseSetByChapter,
    targetVerseIndex.verseSetByChapter,
  );
  const pericopeComparison = compareValueSetMaps(
    sourceVerseIndex.pericopeSetByChapter,
    targetVerseIndex.pericopeSetByChapter,
  );

  const report = {
    generated_at: new Date().toISOString(),
    scope: {
      language_code: args.lang,
      source_version: args.sourceVersion,
      target_version: args.targetVersion,
    },
    summary: {
      source_books: sourceBooks.length,
      target_books: targetBooks.length,
      missing_books_in_target: missingBooks.length,
      extra_books_in_target: extraBooks.length,
      source_chapters: sourceChapterIndex.chapterKeySet.size,
      target_chapters: targetChapterIndex.chapterKeySet.size,
      missing_chapters_in_target: chapterComparison.missingCount,
      extra_chapters_in_target: chapterComparison.extraCount,
      source_distinct_verses: sourceVerseIndex.totalDistinctVerses,
      target_distinct_verses: targetVerseIndex.totalDistinctVerses,
      missing_verses_in_target: verseComparison.missingCount,
      extra_verses_in_target: verseComparison.extraCount,
      source_pericope_starts: sourceVerseIndex.totalPericopeStarts,
      target_pericope_starts: targetVerseIndex.totalPericopeStarts,
      missing_pericope_starts_in_target: pericopeComparison.missingCount,
      extra_pericope_starts_in_target: pericopeComparison.extraCount,
      source_duplicate_verse_rows: sourceVerseIndex.duplicateRows,
      target_duplicate_verse_rows: targetVerseIndex.duplicateRows,
      target_tb2_placeholder_rows: targetVerseIndex.placeholderCount,
      complete_bab_ayat_perikop:
        missingBooks.length === 0 &&
        extraBooks.length === 0 &&
        chapterComparison.missingCount === 0 &&
        chapterComparison.extraCount === 0 &&
        verseComparison.missingCount === 0 &&
        verseComparison.extraCount === 0 &&
        pericopeComparison.missingCount === 0 &&
        pericopeComparison.extraCount === 0,
    },
    samples: {
      missing_books_in_target: missingBooks.slice(0, SAMPLE_LIMIT),
      extra_books_in_target: extraBooks.slice(0, SAMPLE_LIMIT),
      missing_chapters_in_target: chapterComparison.missing,
      extra_chapters_in_target: chapterComparison.extra,
      missing_verses_in_target: verseComparison.missingEntries,
      extra_verses_in_target: verseComparison.extraEntries,
      missing_pericope_starts_in_target: pericopeComparison.missingEntries,
      extra_pericope_starts_in_target: pericopeComparison.extraEntries,
      source_duplicate_verse_rows: sourceVerseIndex.duplicateSamples,
      target_duplicate_verse_rows: targetVerseIndex.duplicateSamples,
    },
  };

  safeJsonWrite(args.report || DEFAULT_REPORT, report);
  console.log("TB2 completeness audit summary:");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report saved to: ${args.report || DEFAULT_REPORT}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
