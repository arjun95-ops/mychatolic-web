#!/usr/bin/env node

import fs from "fs";
import path from "path";
import process from "process";
import { createClient } from "@supabase/supabase-js";

const TARGET_LANG = "en";
const TARGET_VERSION = "EN1";
const USCCB_BASE_URL = "https://bible.usccb.org/bible";
const DEFAULT_REPORT = "docs/import/en1_usccb_pericope_sync_report.json";
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_RETRIES = 5;
const DEFAULT_CONCURRENCY = 8;

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
    dryRun: false,
    report: DEFAULT_REPORT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retries: DEFAULT_RETRIES,
    concurrency: DEFAULT_CONCURRENCY,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") args.dryRun = true;
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

function slugifyBookName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
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
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const text = await response.text();
      clearTimeout(timer);
      return text;
    } catch (error) {
      clearTimeout(timer);
      if (attempt >= retries) throw error;
      await sleep(350 * (attempt + 1));
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
    if (match && Number.isInteger(match.index) && match.index >= 0) {
      cutAt = Math.min(cutAt, match.index);
    }
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
  let match;
  while ((match = headingRegex.exec(before))) {
    const absoluteIndex = headingWindowStart + match.index + (match[0].startsWith("\n") ? 1 : 0);
    candidates.push(absoluteIndex);
  }

  const boldLineRegex = /(?:^|\n)\*\*[^*\n]{2,}?\*\*/g;
  while ((match = boldLineRegex.exec(before))) {
    const absoluteIndex = headingWindowStart + match.index + (match[0].startsWith("\n") ? 1 : 0);
    candidates.push(absoluteIndex);
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
  let match;
  while ((match = markdownHeadingRegex.exec(text))) {
    const title = cleanHeadingTitle(match[2]);
    if (!isHeadingCandidate(title)) continue;
    headings.push({ pos: match.index, title });
  }

  const boldRegex = /\*\*([^*\n]{2,}?)\*\*/g;
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
    if (!existing || item.heading_pos >= existing.heading_pos) {
      byVerse.set(item.verse_number, item);
    }
  }

  return Array.from(byVerse.values())
    .sort((a, b) => a.verse_number - b.verse_number)
    .map((item) => ({
      verse_number: item.verse_number,
      title: item.title,
    }));
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

function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
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
  const books = await fetchAll(
    client,
    "bible_books",
    "id,name,order_index",
    1000,
    (query) =>
      query
        .eq("language_code", TARGET_LANG)
        .eq("version_code", TARGET_VERSION)
        .order("order_index", { ascending: true }),
  );

  if (books.length === 0) {
    throw new Error(`Workspace ${TARGET_LANG}/${TARGET_VERSION} tidak ditemukan.`);
  }

  const bookById = new Map(books.map((book) => [String(book.id), book]));
  const bookIds = books.map((book) => String(book.id));

  const chaptersRaw = bookIds.length
    ? await fetchAll(
        client,
        "bible_chapters",
        "id,book_id,chapter_number",
        1000,
        (query) => query.in("book_id", bookIds),
      )
    : [];
  const chapters = chaptersRaw
    .map((row) => ({
      id: String(row.id),
      book_id: String(row.book_id),
      chapter_number: Number(row.chapter_number),
    }))
    .filter((row) => Number.isInteger(row.chapter_number) && row.chapter_number > 0);

  const versesRaw = chapters.length
    ? await fetchByInChunks(
        client,
        "bible_verses",
        "id,chapter_id,verse_number,pericope",
        "chapter_id",
        chapters.map((chapter) => chapter.id),
        1000,
      )
    : [];

  const verseByChapterAndNumber = new Map();
  const verseNumbersByChapter = new Map();
  let pericopeBeforeCount = 0;
  for (const row of versesRaw) {
    const chapterId = String(row.chapter_id);
    const verseNumber = Number(row.verse_number);
    if (!Number.isInteger(verseNumber) || verseNumber <= 0) continue;
    verseByChapterAndNumber.set(`${chapterId}::${verseNumber}`, {
      id: String(row.id),
      chapter_id: chapterId,
      verse_number: verseNumber,
    });
    if (!verseNumbersByChapter.has(chapterId)) verseNumbersByChapter.set(chapterId, []);
    verseNumbersByChapter.get(chapterId).push(verseNumber);
    if (normalizeText(row.pericope)) pericopeBeforeCount += 1;
  }
  for (const list of verseNumbersByChapter.values()) {
    list.sort((a, b) => a - b);
  }

  const chapterJobs = chapters
    .map((chapter) => {
      const book = bookById.get(chapter.book_id);
      if (!book) return null;
      const slug = slugifyBookName(book.name);
      return {
        chapter_id: chapter.id,
        chapter_number: chapter.chapter_number,
        book_id: chapter.book_id,
        book_name: String(book.name),
        book_order_index: Number(book.order_index || 0),
        slug,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.book_order_index !== b.book_order_index) return a.book_order_index - b.book_order_index;
      return a.chapter_number - b.chapter_number;
    });

  let fetchedPages = 0;
  const sourceErrors = [];
  const missingSections = [];
  const unresolvedVerseTargets = [];
  const chapterPericopeSummaries = [];

  const estherJobs = chapterJobs.filter((job) => job.slug === "esther");
  const estherSectionsByLabel = new Map();
  if (estherJobs.length > 0) {
    console.log("Fetch Esther chapter pages (special mapping A-F)...");
    const estherPages = await mapWithConcurrency(
      Array.from({ length: 10 }, (_, idx) => idx + 1),
      Math.min(5, args.concurrency),
      async (chapterNumber) => {
        const urlPath = `${USCCB_BASE_URL}/esther/${chapterNumber}.md`;
        const markdown = await fetchTextWithRetry(urlPath, args.timeoutMs, args.retries);
        fetchedPages += 1;
        return { chapterNumber, markdown };
      },
    );
    for (const page of estherPages) {
      const sections = splitChapterSections(page.markdown);
      for (const [label, sectionText] of sections.entries()) {
        if (!estherSectionsByLabel.has(label)) {
          estherSectionsByLabel.set(label, sectionText);
        }
      }
    }
  }

  console.log(`Parse pericope starts from USCCB chapters: ${chapterJobs.length}...`);
  let processed = 0;
  const chapterResults = await mapWithConcurrency(chapterJobs, args.concurrency, async (job) => {
    const chapterLabel =
      job.slug === "esther" && ESTHER_EXTRA_CHAPTER_MAP.has(job.chapter_number)
        ? ESTHER_EXTRA_CHAPTER_MAP.get(job.chapter_number)
        : String(job.chapter_number);

    try {
      let sectionText = "";
      let sourceUrl = "";

      if (job.slug === "esther") {
        sectionText = estherSectionsByLabel.get(String(chapterLabel).toUpperCase()) || "";
        sourceUrl = `${USCCB_BASE_URL}/esther/${String(chapterLabel).toLowerCase()}.md`;
      } else {
        sourceUrl = `${USCCB_BASE_URL}/${job.slug}/${job.chapter_number}.md`;
        const markdown = await fetchTextWithRetry(sourceUrl, args.timeoutMs, args.retries);
        fetchedPages += 1;
        const sections = splitChapterSections(markdown);
        sectionText =
          sections.get(String(chapterLabel).toUpperCase()) ||
          sections.get(String(job.chapter_number).toUpperCase()) ||
          "";
      }

      if (!sectionText) {
        missingSections.push({
          book: job.book_name,
          chapter: job.chapter_number,
          chapter_label: chapterLabel,
          source_url: sourceUrl,
        });
        return {
          job,
          source_url: sourceUrl,
          chapter_label: chapterLabel,
          pericope_starts: [],
        };
      }

      const starts = extractPericopeStartsFromSection(sectionText);
      processed += 1;
      if (processed % 120 === 0 || processed === chapterJobs.length) {
        console.log(`Parsed ${processed}/${chapterJobs.length} chapters...`);
      }
      return {
        job,
        source_url: sourceUrl,
        chapter_label: chapterLabel,
        pericope_starts: starts,
      };
    } catch (error) {
      sourceErrors.push({
        book: job.book_name,
        chapter: job.chapter_number,
        chapter_label: chapterLabel,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        job,
        source_url: "",
        chapter_label: chapterLabel,
        pericope_starts: [],
      };
    }
  });

  const updatesByVerseId = new Map();
  let headingsParsedTotal = 0;
  let headingsFallbackResolvedTotal = 0;
  for (const chapterResult of chapterResults) {
    const chapterId = chapterResult.job.chapter_id;
    const starts = chapterResult.pericope_starts || [];
    headingsParsedTotal += starts.length;

    chapterPericopeSummaries.push({
      book: chapterResult.job.book_name,
      chapter: chapterResult.job.chapter_number,
      chapter_label: chapterResult.chapter_label,
      source_url: chapterResult.source_url,
      starts_detected: starts.length,
      sample_titles: starts.slice(0, 4).map((item) => item.title),
    });

    for (const start of starts) {
      const requestedVerse = Number(start.verse_number);
      const requestedKey = `${chapterId}::${requestedVerse}`;
      let verse = verseByChapterAndNumber.get(requestedKey);
      if (!verse) {
        const available = verseNumbersByChapter.get(chapterId) || [];
        const nextVerse = available.find((n) => n >= requestedVerse) || null;
        const prevVerse = available.length ? available[available.length - 1] : null;
        const fallbackVerse = nextVerse || prevVerse;
        if (Number.isInteger(fallbackVerse) && fallbackVerse > 0) {
          verse = verseByChapterAndNumber.get(`${chapterId}::${fallbackVerse}`) || null;
          if (verse) headingsFallbackResolvedTotal += 1;
        }
      }

      if (!verse) {
        unresolvedVerseTargets.push({
          book: chapterResult.job.book_name,
          chapter: chapterResult.job.chapter_number,
          verse: requestedVerse,
          title: start.title,
          source_url: chapterResult.source_url,
        });
        continue;
      }
      updatesByVerseId.set(verse.id, {
        id: verse.id,
        pericope: start.title,
      });
    }
  }

  const updates = Array.from(updatesByVerseId.values());
  if (!args.dryRun) {
    for (const chapterIdChunk of chunkArray(chapters.map((chapter) => chapter.id), 200)) {
      const { error } = await client
        .from("bible_verses")
        .update({ pericope: null })
        .in("chapter_id", chapterIdChunk);
      if (error) throw new Error(`Gagal reset pericope EN1: ${error.message}`);
    }

    let updatedCount = 0;
    await mapWithConcurrency(updates, Math.min(30, Math.max(6, args.concurrency * 3)), async (row) => {
      const { error } = await client
        .from("bible_verses")
        .update({ pericope: row.pericope })
        .eq("id", row.id);
      if (error) throw new Error(`Gagal update pericope EN1 id=${row.id}: ${error.message}`);
      updatedCount += 1;
      if (updatedCount % 500 === 0 || updatedCount === updates.length) {
        console.log(`Applied pericope updates: ${updatedCount}/${updates.length}...`);
      }
    });
  }

  let pericopeAfterCount = pericopeBeforeCount;
  if (!args.dryRun) {
    const versesAfter = await fetchByInChunks(
      client,
      "bible_verses",
      "id,pericope",
      "chapter_id",
      chapters.map((chapter) => chapter.id),
      1000,
    );
    pericopeAfterCount = versesAfter.reduce(
      (count, row) => count + (normalizeText(row.pericope) ? 1 : 0),
      0,
    );
  }

  const report = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    dry_run: args.dryRun,
    source: {
      base_url: USCCB_BASE_URL,
      fetched_pages: fetchedPages,
      esther_sections_detected: Array.from(estherSectionsByLabel.keys()).sort((a, b) =>
        String(a).localeCompare(String(b)),
      ),
    },
    target_workspace: `${TARGET_LANG}/${TARGET_VERSION}`,
    summary: {
      books: books.length,
      chapters: chapters.length,
      verses: versesRaw.length,
      chapters_with_detected_headings: chapterPericopeSummaries.filter((item) => item.starts_detected > 0)
        .length,
      headings_detected_from_source: headingsParsedTotal,
      headings_resolved_to_existing_verses: updates.length,
      headings_resolved_with_fallback_verse: headingsFallbackResolvedTotal,
      headings_unresolved_missing_verse: unresolvedVerseTargets.length,
      source_fetch_errors: sourceErrors.length,
      source_missing_sections: missingSections.length,
      pericope_non_null_before: pericopeBeforeCount,
      pericope_non_null_after: pericopeAfterCount,
    },
    samples: {
      source_fetch_errors: sourceErrors.slice(0, 80),
      source_missing_sections: missingSections.slice(0, 80),
      unresolved_headings: unresolvedVerseTargets.slice(0, 120),
      chapter_detection_summary: chapterPericopeSummaries
        .filter((item) => item.starts_detected > 0)
        .slice(0, 200),
    },
  };

  safeJsonWrite(args.report || DEFAULT_REPORT, report);
  console.log("EN1 USCCB pericope sync summary:");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report saved to: ${args.report || DEFAULT_REPORT}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
