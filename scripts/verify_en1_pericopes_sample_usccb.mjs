#!/usr/bin/env node

import fs from "fs";
import path from "path";
import process from "process";
import { createClient } from "@supabase/supabase-js";

const TARGET_LANG = "en";
const TARGET_VERSION = "EN1";
const USCCB_BASE_URL = "https://bible.usccb.org/bible";
const DEFAULT_REPORT = "docs/import/en1_usccb_pericope_verify_sample_report.json";
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_RETRIES = 5;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_SAMPLE_BOOKS = 20;
const DEFAULT_SEED = 20260221;

const ESTHER_EXTRA_CHAPTER_MAP = new Map([
  [11, "A"],
  [12, "B"],
  [13, "C"],
  [14, "D"],
  [15, "E"],
  [16, "F"],
]);

const HTML_ENTITY_MAP = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  hellip: "...",
};

function parseArgs(argv) {
  const args = {
    report: DEFAULT_REPORT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retries: DEFAULT_RETRIES,
    concurrency: DEFAULT_CONCURRENCY,
    sampleBooks: DEFAULT_SAMPLE_BOOKS,
    seed: DEFAULT_SEED,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--report") args.report = String(argv[i + 1] || "");
    else if (token === "--timeout-ms") args.timeoutMs = Number(argv[i + 1] || DEFAULT_TIMEOUT_MS);
    else if (token === "--retries") args.retries = Number(argv[i + 1] || DEFAULT_RETRIES);
    else if (token === "--concurrency") args.concurrency = Number(argv[i + 1] || DEFAULT_CONCURRENCY);
    else if (token === "--sample-books") args.sampleBooks = Number(argv[i + 1] || DEFAULT_SAMPLE_BOOKS);
    else if (token === "--seed") args.seed = Number(argv[i + 1] || DEFAULT_SEED);

    if (
      [
        "--report",
        "--timeout-ms",
        "--retries",
        "--concurrency",
        "--sample-books",
        "--seed",
      ].includes(token)
    ) {
      i += 1;
    }
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) args.timeoutMs = DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(args.retries) || args.retries < 0) args.retries = DEFAULT_RETRIES;
  if (!Number.isFinite(args.concurrency) || args.concurrency <= 0) args.concurrency = DEFAULT_CONCURRENCY;
  if (!Number.isFinite(args.sampleBooks) || args.sampleBooks <= 0) args.sampleBooks = DEFAULT_SAMPLE_BOOKS;
  if (!Number.isFinite(args.seed) || args.seed <= 0) args.seed = DEFAULT_SEED;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeTitle(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
}

function slugifyBookName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function createSeededRandom(seed) {
  let state = (Number(seed) || DEFAULT_SEED) >>> 0;
  return function random() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pickRandomBooks(books, count, seed) {
  const all = [...books];
  const random = createSeededRandom(seed);
  for (let i = all.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = all[i];
    all[i] = all[j];
    all[j] = tmp;
  }
  return all.slice(0, Math.min(count, all.length)).sort((a, b) => a.order_index - b.order_index);
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
          Accept: "text/markdown,text/plain,text/html",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const text = await response.text();
      clearTimeout(timer);
      return text;
    } catch (error) {
      clearTimeout(timer);
      if (attempt >= retries) throw error;
      await sleep(300 * (attempt + 1));
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

function stripTags(input) {
  return String(input || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function trimSectionContent(sectionText) {
  const text = String(sectionText || "");
  const cutPatterns = [
    /\n\\\* \[\[/,
    /\n[a-z]\. \[\[/i,
    /\nCopyright\b/i,
    /\n #### Pagination\b/i,
  ];
  let cutAt = text.length;
  for (const pattern of cutPatterns) {
    const match = text.match(pattern);
    if (match && Number.isInteger(match.index) && match.index >= 0) cutAt = Math.min(cutAt, match.index);
  }
  return text.slice(0, cutAt);
}

function findSingleSectionStart(text) {
  const source = String(text || "");
  const firstVerse = source.search(/<a name="\d{8}">\s*1(?:[^0-9]|$)/);
  if (firstVerse < 0) return 0;

  const headingLookback = 900;
  const headingWindowStart = Math.max(0, firstVerse - headingLookback);
  const before = source.slice(headingWindowStart, firstVerse);
  const candidates = [];
  const headingRegex = /(?:^|\n)#{1,6}\s+.+$/gm;
  const boldLineRegex = /(?:^|\n)\*\*[^*\n]{2,}?\*\*/g;
  let match;
  while ((match = headingRegex.exec(before))) {
    candidates.push(headingWindowStart + match.index + (match[0].startsWith("\n") ? 1 : 0));
  }
  while ((match = boldLineRegex.exec(before))) {
    candidates.push(headingWindowStart + match.index + (match[0].startsWith("\n") ? 1 : 0));
  }

  const nearby = candidates.filter((idx) => firstVerse - idx <= 450 && idx >= 0);
  if (nearby.length > 0) return Math.min(...nearby);
  return Math.max(0, firstVerse - 180);
}

function splitChapterSections(markdown) {
  const text = String(markdown || "");
  const markerRegex =
    /(?:^|\n)\s*(?:#{2,6}\s*)?(?:\*\*\s*)?(?:<a name="[^"]+">\s*)?\(?\s*(?:CHAPTER|PSALM)\s+([0-9]+|[A-F])\s*\)?(?:\s*\*\*)?/g;
  const markers = [];
  let match;
  while ((match = markerRegex.exec(text))) {
    markers.push({
      label: String(match[1] || "").toUpperCase(),
      index: match.index,
    });
  }

  const sections = new Map();
  if (markers.length === 0) {
    const start = findSingleSectionStart(text);
    const fallback = trimSectionContent(text.slice(start));
    if (normalizeText(fallback)) sections.set("1", fallback);
    return sections;
  }

  for (let i = 0; i < markers.length; i += 1) {
    const current = markers[i];
    const next = markers[i + 1];
    const rawSection = text.slice(current.index, next ? next.index : text.length);
    sections.set(current.label, trimSectionContent(rawSection));
  }
  return sections;
}

function cleanHeadingTitle(raw) {
  let text = String(raw || "")
    .replace(/\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\\([\[\]()*])/g, "$1");
  text = decodeHtmlEntities(stripTags(text))
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  text = text.replace(/^[-:;,.!?)\]\s]+|[-:;,.!?)\]\s]+$/g, "").trim();
  return text;
}

function isHeadingCandidate(title) {
  const value = normalizeText(title);
  if (!value) return false;
  const upper = value.toUpperCase();
  if (upper.startsWith("CHAPTER ")) return false;
  if (upper.startsWith("PSALM ")) return false;
  if (upper.startsWith("PAGINATION")) return false;
  if (/^[IVXLCDM]+$/i.test(value)) return false;
  if (!/[A-Za-z]/.test(value)) return false;
  if (value.length > 180) return false;
  return true;
}

function parseVerseTokens(sectionText) {
  const text = String(sectionText || "");
  const tokens = [];
  const seen = new Set();

  const anchorRegex = /<a name="[^"]+">\s*(\d{1,3})(?=[^0-9]|$)/g;
  let match;
  while ((match = anchorRegex.exec(text))) {
    const verse = Number(match[1]);
    if (!Number.isInteger(verse) || verse <= 0) continue;
    const key = `${match.index}::${verse}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push({ pos: match.index, verse_number: verse });
  }

  const lineRegex = /(?:^|\n)(\d{1,3})(?=[\u201c\u201d"'(\[]?[A-Za-z])/g;
  while ((match = lineRegex.exec(text))) {
    const verse = Number(match[1]);
    if (!Number.isInteger(verse) || verse <= 0) continue;
    const atLineStart = match[0].startsWith("\n");
    const pos = atLineStart ? match.index + 1 : match.index;
    const key = `${pos}::${verse}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push({ pos, verse_number: verse });
  }

  tokens.sort((a, b) => a.pos - b.pos);
  return tokens;
}

function parseHeadingTokens(sectionText) {
  const text = String(sectionText || "");
  const headings = [];
  const markdownHeadingRegex = /^(#{2,6})\s+(.+)$/gm;
  const boldRegex = /\*\*([^*\n]{2,}?)\*\*/g;
  let match;

  while ((match = markdownHeadingRegex.exec(text))) {
    const title = cleanHeadingTitle(match[2]);
    if (!isHeadingCandidate(title)) continue;
    headings.push({ pos: match.index, title });
  }
  while ((match = boldRegex.exec(text))) {
    const title = cleanHeadingTitle(match[1]);
    if (!isHeadingCandidate(title)) continue;
    headings.push({ pos: match.index, title });
  }

  headings.sort((a, b) => a.pos - b.pos);
  return headings;
}

function extractPericopeStartsFromSection(sectionText) {
  const text = trimSectionContent(sectionText);
  const verseTokens = parseVerseTokens(text);
  const headingTokens = parseHeadingTokens(text);
  const mapped = [];

  for (const heading of headingTokens) {
    const nextVerse = verseTokens.find((token) => token.pos > heading.pos);
    if (!nextVerse) continue;
    if (nextVerse.pos - heading.pos > 1400) continue;
    mapped.push({
      verse_number: nextVerse.verse_number,
      title: heading.title,
      heading_pos: heading.pos,
    });
  }

  const byVerse = new Map();
  for (const item of mapped) {
    const existing = byVerse.get(item.verse_number);
    if (!existing || item.heading_pos >= existing.heading_pos) byVerse.set(item.verse_number, item);
  }

  return Array.from(byVerse.values())
    .sort((a, b) => a.verse_number - b.verse_number)
    .map((item) => ({ verse_number: item.verse_number, title: item.title }));
}

function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchAll(client, table, selectClause, pageSize = 1000, builder = null) {
  const rows = [];
  let from = 0;
  while (true) {
    let query = client.from(table).select(selectClause).range(from, from + pageSize - 1);
    if (typeof builder === "function") query = builder(query);
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
    const partial = await fetchAll(client, table, selectClause, pageSize, (query) =>
      query.in(column, chunk),
    );
    rows.push(...partial);
  }
  return rows;
}

function applyVerseFallback(starts, verseNumbers) {
  const sortedVerses = [...verseNumbers].sort((a, b) => a - b);
  const byVerse = new Map();
  let fallbackCount = 0;

  for (const start of starts) {
    const requestedVerse = Number(start.verse_number);
    if (!Number.isInteger(requestedVerse) || requestedVerse <= 0) continue;
    let resolvedVerse = requestedVerse;
    if (!sortedVerses.includes(resolvedVerse)) {
      const nextVerse = sortedVerses.find((n) => n >= requestedVerse) || null;
      const prevVerse = sortedVerses.length ? sortedVerses[sortedVerses.length - 1] : null;
      resolvedVerse = nextVerse || prevVerse || 0;
      if (resolvedVerse > 0 && resolvedVerse !== requestedVerse) fallbackCount += 1;
    }
    if (!resolvedVerse) continue;
    byVerse.set(resolvedVerse, start.title);
  }

  return {
    resolved: Array.from(byVerse.entries())
      .map(([verse, title]) => ({ verse_number: Number(verse), title }))
      .sort((a, b) => a.verse_number - b.verse_number),
    fallbackCount,
  };
}

function compareChapter(expected, actual) {
  const expectedMap = new Map(expected.map((row) => [Number(row.verse_number), String(row.title || "")]));
  const actualMap = new Map(actual.map((row) => [Number(row.verse_number), String(row.title || "")]));

  const missing = [];
  const extra = [];
  const titleMismatches = [];

  for (const [verse, title] of expectedMap.entries()) {
    if (!actualMap.has(verse)) {
      missing.push({ verse, expected_title: title });
      continue;
    }
    const actualTitle = actualMap.get(verse) || "";
    if (normalizeTitle(actualTitle) !== normalizeTitle(title)) {
      titleMismatches.push({ verse, expected_title: title, actual_title: actualTitle });
    }
  }

  for (const [verse, title] of actualMap.entries()) {
    if (!expectedMap.has(verse)) extra.push({ verse, actual_title: title });
  }

  return { missing, extra, titleMismatches };
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

  const books = await fetchAll(client, "bible_books", "id,name,order_index", 1000, (query) =>
    query
      .eq("language_code", TARGET_LANG)
      .eq("version_code", TARGET_VERSION)
      .order("order_index", { ascending: true }),
  );
  if (books.length === 0) throw new Error(`Workspace ${TARGET_LANG}/${TARGET_VERSION} tidak ditemukan.`);

  const sampledBooks = pickRandomBooks(
    books.map((row) => ({ id: String(row.id), name: String(row.name), order_index: Number(row.order_index || 0) })),
    args.sampleBooks,
    args.seed,
  );

  const chapters = await fetchByInChunks(
    client,
    "bible_chapters",
    "id,book_id,chapter_number",
    "book_id",
    sampledBooks.map((book) => book.id),
    1000,
  );

  const chapterById = new Map();
  const chapterJobs = [];
  for (const row of chapters) {
    const book = sampledBooks.find((b) => b.id === String(row.book_id));
    if (!book) continue;
    const chapterNumber = Number(row.chapter_number);
    if (!Number.isInteger(chapterNumber) || chapterNumber <= 0) continue;
    const chapter = {
      id: String(row.id),
      book_id: book.id,
      book_name: book.name,
      chapter_number: chapterNumber,
      slug: slugifyBookName(book.name),
      chapter_label:
        slugifyBookName(book.name) === "esther" && ESTHER_EXTRA_CHAPTER_MAP.has(chapterNumber)
          ? ESTHER_EXTRA_CHAPTER_MAP.get(chapterNumber)
          : String(chapterNumber),
    };
    chapterById.set(chapter.id, chapter);
    chapterJobs.push(chapter);
  }

  chapterJobs.sort((a, b) => {
    const ba = sampledBooks.find((x) => x.id === a.book_id)?.order_index || 0;
    const bb = sampledBooks.find((x) => x.id === b.book_id)?.order_index || 0;
    if (ba !== bb) return ba - bb;
    return a.chapter_number - b.chapter_number;
  });

  const verses = await fetchByInChunks(
    client,
    "bible_verses",
    "id,chapter_id,verse_number,pericope",
    "chapter_id",
    chapterJobs.map((c) => c.id),
    1000,
  );

  const verseNumbersByChapter = new Map();
  const actualPericopesByChapter = new Map();
  for (const row of verses) {
    const chapterId = String(row.chapter_id);
    const verseNumber = Number(row.verse_number);
    if (!Number.isInteger(verseNumber) || verseNumber <= 0) continue;
    if (!verseNumbersByChapter.has(chapterId)) verseNumbersByChapter.set(chapterId, []);
    verseNumbersByChapter.get(chapterId).push(verseNumber);

    const pericope = normalizeText(row.pericope);
    if (!pericope) continue;
    if (!actualPericopesByChapter.has(chapterId)) actualPericopesByChapter.set(chapterId, []);
    actualPericopesByChapter.get(chapterId).push({ verse_number: verseNumber, title: pericope });
  }
  for (const list of verseNumbersByChapter.values()) list.sort((a, b) => a - b);
  for (const list of actualPericopesByChapter.values()) list.sort((a, b) => a.verse_number - b.verse_number);

  const estherJobs = chapterJobs.filter((job) => job.slug === "esther");
  const estherSectionsByLabel = new Map();
  let fetchedPages = 0;
  if (estherJobs.length > 0) {
    const estherPages = await mapWithConcurrency(
      Array.from({ length: 10 }, (_, idx) => idx + 1),
      Math.min(5, args.concurrency),
      async (chapterNumber) => {
        const urlPath = `${USCCB_BASE_URL}/esther/${chapterNumber}.md`;
        const markdown = await fetchTextWithRetry(urlPath, args.timeoutMs, args.retries);
        fetchedPages += 1;
        return { markdown };
      },
    );
    for (const page of estherPages) {
      const sections = splitChapterSections(page.markdown);
      for (const [label, sectionText] of sections.entries()) {
        if (!estherSectionsByLabel.has(label)) estherSectionsByLabel.set(label, sectionText);
      }
    }
  }

  const sourceFetchErrors = [];
  const sourceMissingSections = [];
  const chapterFindings = [];
  let fallbackAppliedTotal = 0;

  const jobResults = await mapWithConcurrency(chapterJobs, args.concurrency, async (job) => {
    const sourceUrl =
      job.slug === "esther"
        ? `${USCCB_BASE_URL}/esther/${String(job.chapter_label).toLowerCase()}.md`
        : `${USCCB_BASE_URL}/${job.slug}/${job.chapter_number}.md`;
    try {
      let sectionText = "";
      if (job.slug === "esther") {
        sectionText = estherSectionsByLabel.get(String(job.chapter_label).toUpperCase()) || "";
      } else {
        const markdown = await fetchTextWithRetry(sourceUrl, args.timeoutMs, args.retries);
        fetchedPages += 1;
        const sections = splitChapterSections(markdown);
        sectionText =
          sections.get(String(job.chapter_label).toUpperCase()) ||
          sections.get(String(job.chapter_number).toUpperCase()) ||
          "";
      }
      if (!sectionText) {
        sourceMissingSections.push({
          book: job.book_name,
          chapter: job.chapter_number,
          source_url: sourceUrl,
        });
        return null;
      }

      const parsedStarts = extractPericopeStartsFromSection(sectionText);
      const fallback = applyVerseFallback(parsedStarts, verseNumbersByChapter.get(job.id) || []);
      fallbackAppliedTotal += fallback.fallbackCount;
      const actual = actualPericopesByChapter.get(job.id) || [];
      const compared = compareChapter(fallback.resolved, actual);
      if (
        compared.missing.length > 0 ||
        compared.extra.length > 0 ||
        compared.titleMismatches.length > 0
      ) {
        chapterFindings.push({
          book: job.book_name,
          chapter: job.chapter_number,
          source_url: sourceUrl,
          expected_count: fallback.resolved.length,
          actual_count: actual.length,
          missing: compared.missing.slice(0, 10),
          extra: compared.extra.slice(0, 10),
          title_mismatches: compared.titleMismatches.slice(0, 10),
        });
      }
      return {
        expectedCount: fallback.resolved.length,
        actualCount: actual.length,
      };
    } catch (error) {
      sourceFetchErrors.push({
        book: job.book_name,
        chapter: job.chapter_number,
        source_url: sourceUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  });

  const comparedResults = jobResults.filter(Boolean);
  const expectedTotal = comparedResults.reduce((sum, row) => sum + row.expectedCount, 0);
  const actualTotal = comparedResults.reduce((sum, row) => sum + row.actualCount, 0);
  const chaptersWithFindings = chapterFindings.length;

  const report = {
    started_at: new Date().toISOString(),
    params: {
      sample_books: args.sampleBooks,
      seed: args.seed,
      concurrency: args.concurrency,
    },
    target_workspace: `${TARGET_LANG}/${TARGET_VERSION}`,
    sampled_books: sampledBooks.map((book) => ({
      id: book.id,
      name: book.name,
      order_index: book.order_index,
    })),
    summary: {
      sampled_books: sampledBooks.length,
      sampled_chapters: chapterJobs.length,
      fetched_pages: fetchedPages,
      compared_chapters: comparedResults.length,
      chapters_with_findings: chaptersWithFindings,
      expected_pericope_starts_total: expectedTotal,
      actual_pericope_starts_total: actualTotal,
      source_fetch_errors: sourceFetchErrors.length,
      source_missing_sections: sourceMissingSections.length,
      fallback_applied_total: fallbackAppliedTotal,
      verification_passed:
        chaptersWithFindings === 0 &&
        sourceFetchErrors.length === 0 &&
        sourceMissingSections.length === 0,
    },
    samples: {
      findings: chapterFindings.slice(0, 200),
      source_fetch_errors: sourceFetchErrors.slice(0, 80),
      source_missing_sections: sourceMissingSections.slice(0, 80),
    },
    finished_at: new Date().toISOString(),
  };

  safeJsonWrite(args.report || DEFAULT_REPORT, report);
  console.log("EN1 USCCB pericope sample verification summary:");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Sampled books: ${sampledBooks.map((b) => b.name).join(", ")}`);
  console.log(`Report saved to: ${args.report || DEFAULT_REPORT}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

