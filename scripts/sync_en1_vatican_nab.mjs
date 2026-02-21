#!/usr/bin/env node

import fs from "fs";
import path from "path";
import process from "process";
import { createClient } from "@supabase/supabase-js";

const TARGET_LANG = "en";
const TARGET_VERSION = "EN1";
const INDEX_URL = "https://www.vatican.va/archive/ENG0839/_INDEX.HTM";
const PAGE_BASE_URL = "https://www.vatican.va/archive/ENG0839";
const DEFAULT_REPORT = "docs/import/en1_vatican_nab_sync_report.json";
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_RETRIES = 5;
const DEFAULT_CONCURRENCY = 8;

const BOOK_PLAN = [
  { order_index: 1, grouping: "old", code: "GEN", name: "Genesis", abbreviation: "Gen" },
  { order_index: 2, grouping: "old", code: "EXO", name: "Exodus", abbreviation: "Exod" },
  { order_index: 3, grouping: "old", code: "LEV", name: "Leviticus", abbreviation: "Lev" },
  { order_index: 4, grouping: "old", code: "NUM", name: "Numbers", abbreviation: "Num" },
  { order_index: 5, grouping: "old", code: "DEU", name: "Deuteronomy", abbreviation: "Deut" },
  { order_index: 6, grouping: "old", code: "JOS", name: "Joshua", abbreviation: "Josh" },
  { order_index: 7, grouping: "old", code: "JUD", name: "Judges", abbreviation: "Judg" },
  { order_index: 8, grouping: "old", code: "RUT", name: "Ruth", abbreviation: "Ruth" },
  { order_index: 9, grouping: "old", code: "1SAM", name: "1 Samuel", abbreviation: "1Sam" },
  { order_index: 10, grouping: "old", code: "2SAM", name: "2 Samuel", abbreviation: "2Sam" },
  { order_index: 11, grouping: "old", code: "1KIN", name: "1 Kings", abbreviation: "1Kgs" },
  { order_index: 12, grouping: "old", code: "2KIN", name: "2 Kings", abbreviation: "2Kgs" },
  { order_index: 13, grouping: "old", code: "1CHR", name: "1 Chronicles", abbreviation: "1Chr" },
  { order_index: 14, grouping: "old", code: "2CHR", name: "2 Chronicles", abbreviation: "2Chr" },
  { order_index: 15, grouping: "old", code: "EZR", name: "Ezra", abbreviation: "Ezra" },
  { order_index: 16, grouping: "old", code: "NEH", name: "Nehemiah", abbreviation: "Neh" },
  { order_index: 17, grouping: "deutero", code: "TOB", name: "Tobit", abbreviation: "Tob" },
  { order_index: 18, grouping: "deutero", code: "JDT", name: "Judith", abbreviation: "Jdt" },
  { order_index: 19, grouping: "old", code: "EST", name: "Esther", abbreviation: "Est" },
  { order_index: 20, grouping: "deutero", code: "1MAC", name: "1 Maccabees", abbreviation: "1Macc" },
  { order_index: 21, grouping: "deutero", code: "2MAC", name: "2 Maccabees", abbreviation: "2Macc" },
  { order_index: 22, grouping: "old", code: "JOB", name: "Job", abbreviation: "Job" },
  { order_index: 23, grouping: "old", code: "PSA", name: "Psalms", abbreviation: "Ps" },
  { order_index: 24, grouping: "old", code: "PRO", name: "Proverbs", abbreviation: "Prov" },
  { order_index: 25, grouping: "old", code: "ECC", name: "Ecclesiastes", abbreviation: "Eccl" },
  { order_index: 26, grouping: "old", code: "SON", name: "Song of Songs", abbreviation: "Song" },
  { order_index: 27, grouping: "deutero", code: "WISD", name: "Wisdom", abbreviation: "Wis" },
  { order_index: 28, grouping: "deutero", code: "SIR", name: "Sirach", abbreviation: "Sir" },
  { order_index: 29, grouping: "old", code: "ISA", name: "Isaiah", abbreviation: "Isa" },
  { order_index: 30, grouping: "old", code: "JER", name: "Jeremiah", abbreviation: "Jer" },
  { order_index: 31, grouping: "old", code: "LAM", name: "Lamentations", abbreviation: "Lam" },
  { order_index: 32, grouping: "deutero", code: "BAR", name: "Baruch", abbreviation: "Bar" },
  { order_index: 33, grouping: "old", code: "EZE", name: "Ezekiel", abbreviation: "Ezek" },
  { order_index: 34, grouping: "old", code: "DAN", name: "Daniel", abbreviation: "Dan" },
  { order_index: 35, grouping: "old", code: "HOS", name: "Hosea", abbreviation: "Hos" },
  { order_index: 36, grouping: "old", code: "JOE", name: "Joel", abbreviation: "Joel" },
  { order_index: 37, grouping: "old", code: "AMO", name: "Amos", abbreviation: "Amos" },
  { order_index: 38, grouping: "old", code: "OBA", name: "Obadiah", abbreviation: "Obad" },
  { order_index: 39, grouping: "old", code: "JON", name: "Jonah", abbreviation: "Jonah" },
  { order_index: 40, grouping: "old", code: "MIC", name: "Micah", abbreviation: "Mic" },
  { order_index: 41, grouping: "old", code: "NAH", name: "Nahum", abbreviation: "Nah" },
  { order_index: 42, grouping: "old", code: "HAB", name: "Habakkuk", abbreviation: "Hab" },
  { order_index: 43, grouping: "old", code: "ZEP", name: "Zephaniah", abbreviation: "Zeph" },
  { order_index: 44, grouping: "old", code: "HAG", name: "Haggai", abbreviation: "Hag" },
  { order_index: 45, grouping: "old", code: "ZEC", name: "Zechariah", abbreviation: "Zech" },
  { order_index: 46, grouping: "old", code: "MAL", name: "Malachi", abbreviation: "Mal" },
  { order_index: 47, grouping: "new", code: "MAT", name: "Matthew", abbreviation: "Matt" },
  { order_index: 48, grouping: "new", code: "MAR", name: "Mark", abbreviation: "Mark" },
  { order_index: 49, grouping: "new", code: "LUK", name: "Luke", abbreviation: "Luke" },
  { order_index: 50, grouping: "new", code: "JOH", name: "John", abbreviation: "John" },
  { order_index: 51, grouping: "new", code: "ACT", name: "Acts", abbreviation: "Acts" },
  { order_index: 52, grouping: "new", code: "ROM", name: "Romans", abbreviation: "Rom" },
  { order_index: 53, grouping: "new", code: "1COR", name: "1 Corinthians", abbreviation: "1Cor" },
  { order_index: 54, grouping: "new", code: "2COR", name: "2 Corinthians", abbreviation: "2Cor" },
  { order_index: 55, grouping: "new", code: "GAL", name: "Galatians", abbreviation: "Gal" },
  { order_index: 56, grouping: "new", code: "EPH", name: "Ephesians", abbreviation: "Eph" },
  { order_index: 57, grouping: "new", code: "PHI", name: "Philippians", abbreviation: "Phil" },
  { order_index: 58, grouping: "new", code: "COL", name: "Colossians", abbreviation: "Col" },
  { order_index: 59, grouping: "new", code: "1THE", name: "1 Thessalonians", abbreviation: "1Thes" },
  { order_index: 60, grouping: "new", code: "2THE", name: "2 Thessalonians", abbreviation: "2Thes" },
  { order_index: 61, grouping: "new", code: "1TIM", name: "1 Timothy", abbreviation: "1Tim" },
  { order_index: 62, grouping: "new", code: "2TIM", name: "2 Timothy", abbreviation: "2Tim" },
  { order_index: 63, grouping: "new", code: "TIT", name: "Titus", abbreviation: "Titus" },
  { order_index: 64, grouping: "new", code: "PHL", name: "Philemon", abbreviation: "Phlm" },
  { order_index: 65, grouping: "new", code: "HEB", name: "Hebrews", abbreviation: "Heb" },
  { order_index: 66, grouping: "new", code: "JAM", name: "James", abbreviation: "Jas" },
  { order_index: 67, grouping: "new", code: "1PET", name: "1 Peter", abbreviation: "1Pet" },
  { order_index: 68, grouping: "new", code: "2PET", name: "2 Peter", abbreviation: "2Pet" },
  { order_index: 69, grouping: "new", code: "1JOH", name: "1 John", abbreviation: "1Jn" },
  { order_index: 70, grouping: "new", code: "2JOH", name: "2 John", abbreviation: "2Jn" },
  { order_index: 71, grouping: "new", code: "3JOH", name: "3 John", abbreviation: "3Jn" },
  { order_index: 72, grouping: "new", code: "JUDE", name: "Jude", abbreviation: "Jude" },
  { order_index: 73, grouping: "new", code: "REV", name: "Revelation", abbreviation: "Rev" },
];

const HTML_ENTITY_MAP = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "-",
  ndash: "-",
  hellip: "...",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
};

function parseArgs(argv) {
  const args = {
    dryRun: false,
    report: DEFAULT_REPORT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retries: DEFAULT_RETRIES,
    concurrency: DEFAULT_CONCURRENCY,
    keepExtraBooks: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") args.dryRun = true;
    else if (token === "--keep-extra-books") args.keepExtraBooks = true;
    else if (token === "--report") args.report = String(argv[i + 1] || "");
    else if (token === "--timeout-ms") args.timeoutMs = Number(argv[i + 1] || DEFAULT_TIMEOUT_MS);
    else if (token === "--retries") args.retries = Number(argv[i + 1] || DEFAULT_RETRIES);
    else if (token === "--concurrency") args.concurrency = Number(argv[i + 1] || DEFAULT_CONCURRENCY);

    if (["--report", "--timeout-ms", "--retries", "--concurrency"].includes(token)) i += 1;
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) args.timeoutMs = DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(args.retries) || args.retries < 0) args.retries = DEFAULT_RETRIES;
  if (!Number.isFinite(args.concurrency) || args.concurrency <= 0) args.concurrency = DEFAULT_CONCURRENCY;

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

function decodeHtmlEntities(input) {
  return String(input || "").replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, entity) => {
    const named = HTML_ENTITY_MAP[entity];
    if (named != null) return named;
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16);
      if (Number.isFinite(code)) return String.fromCodePoint(code);
      return full;
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      if (Number.isFinite(code)) return String.fromCodePoint(code);
      return full;
    }
    return full;
  });
}

function stripTags(input) {
  return String(input || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function cleanVerseText(rawHtmlSegment, verseNumber) {
  let raw = String(rawHtmlSegment || "");
  raw = raw
    .replace(/<a\b[^>]*\bhref\s*=\s*#\$[^>]*>[\s\S]*?<\/a>/gi, " ")
    .replace(/<a\b[^>]*\bname\s*=\s*-[^>]*>[\s\S]*?<\/a>/gi, " ")
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, " ");

  let text = decodeHtmlEntities(stripTags(raw))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";
  text = text.replace(new RegExp(`^${verseNumber}\\b\\s*`), "").trim();
  text = text.replace(/^(?:\d+\s+){1,6}(?=[A-Za-z"'([])/, "").trim();

  text = text
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\[\s+/g, "[")
    .replace(/\s+\]/g, "]")
    .replace(/\b([A-Za-z]+)\s+'s\b/g, "$1's")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTextWithRetry(url, timeoutMs, retries) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "mychatolic-web/import-bot",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const text = await response.text();
      clearTimeout(timer);
      return text;
    } catch (error) {
      clearTimeout(timer);
      if (attempt >= retries) throw error;
      await sleep(400 * (attempt + 1));
    }
  }
  throw new Error(`Fetch gagal: ${url}`);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const limit = Math.max(1, Math.min(items.length || 1, Number(concurrency) || 1));
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) break;
      results[current] = await mapper(items[current], current);
    }
  }

  const workers = Array.from({ length: limit }, () => worker());
  await Promise.all(workers);
  return results;
}

function extractSuffixesFromIndex(indexHtml) {
  const suffixSet = new Set();
  const regex = /__P([0-9A-Z]+)\.HTM/g;
  let match;
  while ((match = regex.exec(indexHtml))) {
    suffixSet.add(String(match[1]));
  }

  const suffixes = Array.from(suffixSet);
  suffixes.sort((a, b) => Number.parseInt(a, 36) - Number.parseInt(b, 36));
  return suffixes;
}

function extractMetaPart(pageHtml) {
  const match = pageHtml.match(/<meta\s+name="part"\s+content="([^"]+)"/i);
  if (!match) return "";
  return decodeHtmlEntities(match[1]).replace(/\s+/g, " ").trim();
}

function parseVersesFromPageHtml(pageHtml, pageUrl) {
  const part = extractMetaPart(pageHtml);
  const partSegments = part
    .split(">")
    .map((item) => normalizeText(item))
    .filter(Boolean);
  const metaBookName = partSegments.length >= 2 ? partSegments[1] : "";

  const bodyCutIndex = pageHtml.indexOf("<hr size=1 width=30% align=left/>");
  const bodyHtml = bodyCutIndex >= 0 ? pageHtml.slice(0, bodyCutIndex) : pageHtml;

  const anchorRegex = /<a name=([A-Z0-9]+\.[A-Z0-9]+\.[A-Z0-9]+\.[0-9]+)><\/a>/g;
  const anchors = [];
  let match;
  while ((match = anchorRegex.exec(bodyHtml))) {
    anchors.push({
      anchor: match[1],
      index: match.index,
      endIndex: anchorRegex.lastIndex,
    });
  }

  const verses = [];
  for (let i = 0; i < anchors.length; i += 1) {
    const current = anchors[i];
    const next = anchors[i + 1];
    const chunk = bodyHtml.slice(current.endIndex, next ? next.index : bodyHtml.length);

    const parts = current.anchor.split(".");
    if (parts.length !== 4) continue;
    const groupCode = parts[0];
    const bookCode = parts[1];
    const chapterToken = parts[2];
    const verseToken = parts[3];
    const verseNumber = Number(verseToken);
    if (!Number.isInteger(verseNumber) || verseNumber <= 0) continue;

    const text = cleanVerseText(chunk, verseNumber);
    if (!text) continue;

    verses.push({
      anchor: current.anchor,
      groupCode,
      bookCode,
      chapterToken,
      verseNumber,
      text,
      pageUrl,
      metaBookName,
    });
  }

  return verses;
}

function mapChapterTokenToNumber(bookCode, chapterToken) {
  if (chapterToken === "0") {
    const singleChapterBooks = new Set(["OBA", "PHL", "JUDE", "2JOH", "3JOH"]);
    if (singleChapterBooks.has(bookCode)) return 1;
  }
  if (/^\d+$/.test(chapterToken)) return Number(chapterToken);
  if (bookCode === "EST" && /^[A-F]$/.test(chapterToken)) {
    return 10 + (chapterToken.charCodeAt(0) - 64);
  }
  return null;
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
  const deduped = [];
  const seen = new Set();
  for (const value of values) {
    const key = String(value || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(value);
  }

  const rows = [];
  for (const chunk of chunkArray(deduped, 200)) {
    if (chunk.length === 0) continue;
    const partial = await fetchAll(client, table, selectClause, pageSize, (query) => query.in(column, chunk));
    rows.push(...partial);
  }
  return rows;
}

async function getNextLegacyBookId(client) {
  const rows = await fetchAll(client, "bible_books", "legacy_book_id");
  let maxId = 0;
  for (const row of rows) {
    const value = normalizeText(row.legacy_book_id);
    if (/^\d+$/.test(value)) {
      const n = Number(value);
      if (Number.isInteger(n) && n > maxId) maxId = n;
    }
  }
  return maxId + 1;
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

  const startedAt = new Date().toISOString();
  const planByCode = new Map(BOOK_PLAN.map((item) => [item.code, item]));

  console.log("Fetch Vatican NAB index...");
  const indexHtml = await fetchTextWithRetry(INDEX_URL, args.timeoutMs, args.retries);
  const pageSuffixes = extractSuffixesFromIndex(indexHtml);
  console.log(`Index pages found: ${pageSuffixes.length}`);

  let processed = 0;
  const pageResults = await mapWithConcurrency(pageSuffixes, args.concurrency, async (suffix) => {
    const pageUrl = `${PAGE_BASE_URL}/_P${suffix}.HTM`;
    const html = await fetchTextWithRetry(pageUrl, args.timeoutMs, args.retries);
    const verses = parseVersesFromPageHtml(html, pageUrl);
    const part = extractMetaPart(html);
    processed += 1;
    if (processed % 100 === 0 || processed === pageSuffixes.length) {
      console.log(`Fetched ${processed}/${pageSuffixes.length} pages...`);
    }
    return {
      suffix,
      pageUrl,
      part,
      verseCount: verses.length,
      verses,
    };
  });

  const unknownBookCodes = new Map();
  const unknownChapterTokens = new Map();
  let duplicateVerseKeysFromSource = 0;
  const sourceVerseByKey = new Map();
  const chapterKeySet = new Set();
  const sourceBookCodeToName = new Map();
  let sourcePagesWithVerses = 0;

  for (const page of pageResults) {
    if (!page || !page.verses || page.verses.length === 0) continue;
    sourcePagesWithVerses += 1;

    for (const verse of page.verses) {
      const planEntry = planByCode.get(verse.bookCode);
      if (!planEntry) {
        unknownBookCodes.set(verse.bookCode, (unknownBookCodes.get(verse.bookCode) || 0) + 1);
        continue;
      }

      const chapterNumber = mapChapterTokenToNumber(verse.bookCode, verse.chapterToken);
      if (!Number.isInteger(chapterNumber) || chapterNumber <= 0) {
        const unknownChapterKey = `${verse.bookCode}:${verse.chapterToken}`;
        unknownChapterTokens.set(unknownChapterKey, (unknownChapterTokens.get(unknownChapterKey) || 0) + 1);
        continue;
      }

      if (verse.metaBookName) {
        sourceBookCodeToName.set(verse.bookCode, verse.metaBookName);
      }

      const verseKey = `${verse.bookCode}::${chapterNumber}::${verse.verseNumber}`;
      chapterKeySet.add(`${verse.bookCode}::${chapterNumber}`);

      if (sourceVerseByKey.has(verseKey)) {
        duplicateVerseKeysFromSource += 1;
        continue;
      }
      sourceVerseByKey.set(verseKey, {
        bookCode: verse.bookCode,
        chapterNumber,
        verseNumber: verse.verseNumber,
        text: verse.text,
        pageUrl: page.pageUrl,
      });
    }
  }

  const sourceVerses = Array.from(sourceVerseByKey.values());
  sourceVerses.sort((a, b) => {
    const planA = planByCode.get(a.bookCode);
    const planB = planByCode.get(b.bookCode);
    const orderA = Number(planA?.order_index || 0);
    const orderB = Number(planB?.order_index || 0);
    if (orderA !== orderB) return orderA - orderB;
    if (a.chapterNumber !== b.chapterNumber) return a.chapterNumber - b.chapterNumber;
    return a.verseNumber - b.verseNumber;
  });

  const targetBooksBefore = await fetchAll(
    client,
    "bible_books",
    "id,name,abbreviation,grouping,order_index,legacy_book_id",
    1000,
    (query) =>
      query
        .eq("language_code", TARGET_LANG)
        .eq("version_code", TARGET_VERSION)
        .order("order_index", { ascending: true }),
  );
  const targetByKey = new Map(targetBooksBefore.map((item) => [normalizeBookKey(item.name), item]));

  let nextLegacyId = await getNextLegacyBookId(client);
  const bookCreates = [];
  const bookUpdates = [];
  for (const planEntry of BOOK_PLAN) {
    const key = normalizeBookKey(planEntry.name);
    const existing = targetByKey.get(key);
    if (!existing) {
      const legacyBookId = String(nextLegacyId);
      nextLegacyId += 1;
      bookCreates.push({
        code: planEntry.code,
        payload: {
          language_code: TARGET_LANG,
          version_code: TARGET_VERSION,
          name: planEntry.name,
          abbreviation: planEntry.abbreviation,
          grouping: planEntry.grouping,
          order_index: planEntry.order_index,
          legacy_book_id: legacyBookId,
        },
      });
      continue;
    }

    const needsUpdate =
      normalizeText(existing.name) !== normalizeText(planEntry.name) ||
      normalizeText(existing.abbreviation) !== normalizeText(planEntry.abbreviation) ||
      normalizeText(existing.grouping) !== normalizeText(planEntry.grouping) ||
      Number(existing.order_index || 0) !== Number(planEntry.order_index);

    if (needsUpdate) {
      bookUpdates.push({
        target_id: String(existing.id),
        payload: {
          name: planEntry.name,
          abbreviation: planEntry.abbreviation,
          grouping: planEntry.grouping,
          order_index: planEntry.order_index,
        },
      });
    }
  }

  if (!args.dryRun) {
    for (const update of bookUpdates) {
      const { error } = await client.from("bible_books").update(update.payload).eq("id", update.target_id);
      if (error) throw new Error(`Gagal update book ${update.target_id}: ${error.message}`);
    }

    for (const create of bookCreates) {
      const { error } = await client.from("bible_books").insert(create.payload);
      if (error) throw new Error(`Gagal create book ${create.payload.name}: ${error.message}`);
    }
  }

  const targetBooksAfter = await fetchAll(
    client,
    "bible_books",
    "id,name,abbreviation,grouping,order_index,legacy_book_id",
    1000,
    (query) =>
      query
        .eq("language_code", TARGET_LANG)
        .eq("version_code", TARGET_VERSION)
        .order("order_index", { ascending: true }),
  );
  const targetAfterByName = new Map(targetBooksAfter.map((item) => [normalizeBookKey(item.name), item]));
  const targetByCode = new Map();
  for (const planEntry of BOOK_PLAN) {
    const target = targetAfterByName.get(normalizeBookKey(planEntry.name));
    if (target) targetByCode.set(planEntry.code, target);
  }

  const targetBookIds = Array.from(targetByCode.values()).map((item) => String(item.id));
  const targetChaptersBefore = targetBookIds.length
    ? await fetchByInChunks(client, "bible_chapters", "id,book_id,chapter_number", "book_id", targetBookIds, 1000)
    : [];
  const targetChapterByKeyBefore = new Map(
    targetChaptersBefore.map((item) => [`${item.book_id}::${item.chapter_number}`, item]),
  );

  const chapterCreates = [];
  for (const chapterKey of chapterKeySet) {
    const [bookCode, chapterNumberRaw] = chapterKey.split("::");
    const chapterNumber = Number(chapterNumberRaw);
    const targetBook = targetByCode.get(bookCode);
    if (!targetBook) continue;
    const targetKey = `${targetBook.id}::${chapterNumber}`;
    if (!targetChapterByKeyBefore.has(targetKey)) {
      chapterCreates.push({
        book_id: String(targetBook.id),
        chapter_number: chapterNumber,
      });
    }
  }

  if (!args.dryRun && chapterCreates.length > 0) {
    const { error } = await client
      .from("bible_chapters")
      .upsert(chapterCreates, { onConflict: "book_id,chapter_number", ignoreDuplicates: false });
    if (error) throw new Error(`Gagal upsert chapters: ${error.message}`);
  }

  const targetChaptersAfter = targetBookIds.length
    ? await fetchByInChunks(client, "bible_chapters", "id,book_id,chapter_number", "book_id", targetBookIds, 1000)
    : [];
  const targetChapterByKeyAfter = new Map(
    targetChaptersAfter.map((item) => [`${item.book_id}::${item.chapter_number}`, item]),
  );

  const verseUpsertPayload = [];
  const expectedTargetVerseKey = new Set();
  for (const verse of sourceVerses) {
    const targetBook = targetByCode.get(verse.bookCode);
    if (!targetBook) continue;
    const targetChapter = targetChapterByKeyAfter.get(`${targetBook.id}::${verse.chapterNumber}`);
    if (!targetChapter?.id) continue;

    const text = normalizeText(verse.text);
    if (!text) continue;
    const targetVerseKey = `${targetChapter.id}::${verse.verseNumber}`;
    expectedTargetVerseKey.add(targetVerseKey);

    const legacyBookId = /^\d+$/.test(normalizeText(targetBook.legacy_book_id))
      ? Number(targetBook.legacy_book_id)
      : null;

    verseUpsertPayload.push({
      chapter_id: String(targetChapter.id),
      verse_number: verse.verseNumber,
      text,
      pericope: null,
      book_id: legacyBookId,
      chapter: verse.chapterNumber,
      content: text,
      type: "text",
    });
  }

  if (!args.dryRun && verseUpsertPayload.length > 0) {
    for (const chunk of chunkArray(verseUpsertPayload, 500)) {
      const { error } = await client
        .from("bible_verses")
        .upsert(chunk, { onConflict: "chapter_id,verse_number", ignoreDuplicates: false });
      if (error) throw new Error(`Gagal upsert verses: ${error.message}`);
    }
  }

  const targetChapterIds = targetChaptersAfter.map((item) => String(item.id));
  const targetVersesCurrent = targetChapterIds.length
    ? await fetchByInChunks(client, "bible_verses", "id,chapter_id,verse_number", "chapter_id", targetChapterIds, 1000)
    : [];

  const staleTargetVerses = targetVersesCurrent.filter(
    (row) => !expectedTargetVerseKey.has(`${row.chapter_id}::${Number(row.verse_number)}`),
  );
  if (!args.dryRun && staleTargetVerses.length > 0) {
    for (const chunk of chunkArray(staleTargetVerses.map((row) => String(row.id)), 500)) {
      const { error } = await client.from("bible_verses").delete().in("id", chunk);
      if (error) throw new Error(`Gagal hapus stale verses: ${error.message}`);
    }
  }

  const expectedChapterKey = new Set();
  for (const chapterKey of chapterKeySet) {
    const [bookCode, chapterNumberRaw] = chapterKey.split("::");
    const chapterNumber = Number(chapterNumberRaw);
    const targetBook = targetByCode.get(bookCode);
    if (!targetBook) continue;
    expectedChapterKey.add(`${targetBook.id}::${chapterNumber}`);
  }

  const staleTargetChapters = targetChaptersAfter.filter(
    (row) => !expectedChapterKey.has(`${row.book_id}::${row.chapter_number}`),
  );
  if (!args.dryRun && staleTargetChapters.length > 0) {
    for (const chunk of chunkArray(staleTargetChapters.map((row) => String(row.id)), 500)) {
      const { error } = await client.from("bible_chapters").delete().in("id", chunk);
      if (error) throw new Error(`Gagal hapus stale chapters: ${error.message}`);
    }
  }

  const expectedBookKeys = new Set(BOOK_PLAN.map((item) => normalizeBookKey(item.name)));
  const staleTargetBooks = targetBooksAfter.filter((row) => !expectedBookKeys.has(normalizeBookKey(row.name)));
  if (!args.dryRun && !args.keepExtraBooks && staleTargetBooks.length > 0) {
    for (const chunk of chunkArray(staleTargetBooks.map((row) => String(row.id)), 200)) {
      const { error } = await client
        .from("bible_books")
        .delete()
        .eq("language_code", TARGET_LANG)
        .eq("version_code", TARGET_VERSION)
        .in("id", chunk);
      if (error) throw new Error(`Gagal hapus stale books: ${error.message}`);
    }
  }

  const finalBooks = await fetchAll(
    client,
    "bible_books",
    "id,name,abbreviation,grouping,order_index",
    1000,
    (query) =>
      query
        .eq("language_code", TARGET_LANG)
        .eq("version_code", TARGET_VERSION)
        .order("order_index", { ascending: true }),
  );
  const finalBookIds = finalBooks.map((item) => String(item.id));
  const finalChapters = finalBookIds.length
    ? await fetchByInChunks(client, "bible_chapters", "id,book_id,chapter_number", "book_id", finalBookIds, 1000)
    : [];
  const finalChapterIds = finalChapters.map((item) => String(item.id));
  const finalVerses = finalChapterIds.length
    ? await fetchByInChunks(client, "bible_verses", "id,chapter_id,verse_number,text", "chapter_id", finalChapterIds, 1000)
    : [];

  const sourceBookCodesSeen = new Set(sourceVerses.map((item) => item.bookCode));
  const report = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    dry_run: args.dryRun,
    source: {
      index_url: INDEX_URL,
      page_base_url: PAGE_BASE_URL,
      indexed_pages_total: pageSuffixes.length,
      pages_with_verses: sourcePagesWithVerses,
    },
    target_workspace: `${TARGET_LANG}/${TARGET_VERSION}`,
    keep_extra_books: args.keepExtraBooks,
    summary: {
      source_books_with_verses: sourceBookCodesSeen.size,
      source_chapter_keys: chapterKeySet.size,
      source_verses: sourceVerses.length,
      source_duplicate_verse_keys_removed: duplicateVerseKeysFromSource,
      target_books_before: targetBooksBefore.length,
      target_books_created: bookCreates.length,
      target_books_updated: bookUpdates.length,
      target_books_stale: staleTargetBooks.length,
      target_chapters_before: targetChaptersBefore.length,
      target_chapters_created: chapterCreates.length,
      target_chapters_stale: staleTargetChapters.length,
      target_verses_upserted: verseUpsertPayload.length,
      target_verses_stale: staleTargetVerses.length,
      final_target_books: finalBooks.length,
      final_target_chapters: finalChapters.length,
      final_target_verses: finalVerses.length,
      unknown_book_codes_in_source: unknownBookCodes.size,
      unknown_chapter_tokens_in_source: unknownChapterTokens.size,
    },
    samples: {
      unknown_book_codes: Array.from(unknownBookCodes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50),
      unknown_chapter_tokens: Array.from(unknownChapterTokens.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100),
      source_book_name_by_code: Array.from(sourceBookCodeToName.entries()).sort((a, b) =>
        a[0].localeCompare(b[0]),
      ),
      stale_books: staleTargetBooks.slice(0, 30),
      stale_chapters: staleTargetChapters.slice(0, 30),
      stale_verses: staleTargetVerses.slice(0, 30),
    },
  };

  safeJsonWrite(args.report || DEFAULT_REPORT, report);
  console.log("EN1 Vatican NAB sync summary:");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report saved to: ${args.report || DEFAULT_REPORT}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
