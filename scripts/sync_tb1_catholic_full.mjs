#!/usr/bin/env node

import fs from "fs";
import path from "path";
import process from "process";
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

const DEFAULT_LANG = "id";
const DEFAULT_VERSION = "TB1";
const DEFAULT_RESUME_FILE = "docs/import/tb1_catholic_sync_resume.json";
const DEFAULT_REPORT_FILE = "docs/import/tb1_catholic_sync_report.json";
const DEFAULT_DEUTERO_CSV = "docs/import/deuterokanonika_tb1_import_clean_v2.csv";
const KATAKOMBE_BASE_URL = "https://alkitab.katakombe.org";
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_RETRIES = 5;
const DEFAULT_RETRY_BASE_MS = 750;
const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_REQUEST_DELAY_MS = 0;

const BOOK_PLAN = [
  { order_index: 1, grouping: "old", name: "Kejadian", abbreviation: "Kej", source: { type: "tb", code: "Kej" } },
  { order_index: 2, grouping: "old", name: "Keluaran", abbreviation: "Kel", source: { type: "tb", code: "Kel" } },
  { order_index: 3, grouping: "old", name: "Imamat", abbreviation: "Im", source: { type: "tb", code: "Ima" } },
  { order_index: 4, grouping: "old", name: "Bilangan", abbreviation: "Bil", source: { type: "tb", code: "Bil" } },
  { order_index: 5, grouping: "old", name: "Ulangan", abbreviation: "Ul", source: { type: "tb", code: "Ula" } },
  { order_index: 6, grouping: "old", name: "Yosua", abbreviation: "Yos", source: { type: "tb", code: "Yos" } },
  { order_index: 7, grouping: "old", name: "Hakim-hakim", abbreviation: "Hak", source: { type: "tb", code: "Hak" } },
  { order_index: 8, grouping: "old", name: "Rut", abbreviation: "Rut", source: { type: "tb", code: "Rut" } },
  { order_index: 9, grouping: "old", name: "1 Samuel", abbreviation: "1Sam", source: { type: "tb", code: "1Sa" } },
  { order_index: 10, grouping: "old", name: "2 Samuel", abbreviation: "2Sam", source: { type: "tb", code: "2Sa" } },
  { order_index: 11, grouping: "old", name: "1 Raja-raja", abbreviation: "1Raj", source: { type: "tb", code: "1Ra" } },
  { order_index: 12, grouping: "old", name: "2 Raja-raja", abbreviation: "2Raj", source: { type: "tb", code: "2Ra" } },
  { order_index: 13, grouping: "old", name: "1 Tawarikh", abbreviation: "1Taw", source: { type: "tb", code: "1Ta" } },
  { order_index: 14, grouping: "old", name: "2 Tawarikh", abbreviation: "2Taw", source: { type: "tb", code: "2Ta" } },
  { order_index: 15, grouping: "old", name: "Ezra", abbreviation: "Ezr", source: { type: "tb", code: "Ezr" } },
  { order_index: 16, grouping: "old", name: "Nehemia", abbreviation: "Neh", source: { type: "tb", code: "Neh" } },
  {
    order_index: 17,
    grouping: "deutero",
    name: "Tobit",
    abbreviation: "Tob",
    source: { type: "katakombe", startPath: "/deuterokanonika/tobit/tobit-1.html" },
  },
  {
    order_index: 18,
    grouping: "deutero",
    name: "Yudit",
    abbreviation: "Yud",
    source: { type: "katakombe", startPath: "/deuterokanonika/yudit/yudit-1.html" },
  },
  {
    order_index: 19,
    grouping: "old",
    name: "Ester",
    abbreviation: "Est",
    source: {
      type: "tb_with_katakombe_overlay",
      code: "Est",
      startPath: "/deuterokanonika/tambahan-ester/tambahan-ester-a.html",
      chapterOffset: 10,
    },
  },
  {
    order_index: 20,
    grouping: "deutero",
    name: "1 Makabe",
    abbreviation: "1Mak",
    source: { type: "katakombe", startPath: "/deuterokanonika/1-makabe/1-makabe-1.html" },
  },
  {
    order_index: 21,
    grouping: "deutero",
    name: "2 Makabe",
    abbreviation: "2Mak",
    source: { type: "katakombe", startPath: "/deuterokanonika/2-makabe/2-makabe-1.html" },
  },
  { order_index: 22, grouping: "old", name: "Ayub", abbreviation: "Ayb", source: { type: "tb", code: "Ayb" } },
  { order_index: 23, grouping: "old", name: "Mazmur", abbreviation: "Mzm", source: { type: "tb", code: "Mzm" } },
  { order_index: 24, grouping: "old", name: "Amsal", abbreviation: "Ams", source: { type: "tb", code: "Ams" } },
  { order_index: 25, grouping: "old", name: "Pengkhotbah", abbreviation: "Pkh", source: { type: "tb", code: "Pkh" } },
  { order_index: 26, grouping: "old", name: "Kidung Agung", abbreviation: "Kid", source: { type: "tb", code: "Kid" } },
  {
    order_index: 27,
    grouping: "deutero",
    name: "Kebijaksanaan Salomo",
    abbreviation: "Keb",
    source: { type: "katakombe", startPath: "/deuterokanonika/kebijaksanaan-salomo/kebijaksanaan-salomo-1.html" },
  },
  {
    order_index: 28,
    grouping: "deutero",
    name: "Sirakh",
    abbreviation: "Sir",
    source: { type: "katakombe", startPath: "/deuterokanonika/yesus-bin-sirakh/sirakh-1.html" },
  },
  { order_index: 29, grouping: "old", name: "Yesaya", abbreviation: "Yes", source: { type: "tb", code: "Yes" } },
  { order_index: 30, grouping: "old", name: "Yeremia", abbreviation: "Yer", source: { type: "tb", code: "Yer" } },
  { order_index: 31, grouping: "old", name: "Ratapan", abbreviation: "Rat", source: { type: "tb", code: "Rat" } },
  {
    order_index: 32,
    grouping: "deutero",
    name: "Barukh",
    abbreviation: "Bar",
    source: { type: "katakombe", startPath: "/deuterokanonika/barukh/barukh-1.html" },
  },
  { order_index: 33, grouping: "old", name: "Yehezkiel", abbreviation: "Yeh", source: { type: "tb", code: "Yeh" } },
  {
    order_index: 34,
    grouping: "deutero",
    name: "Tambahan Daniel",
    abbreviation: "TDan",
    source: {
      type: "tb_with_katakombe_overlay",
      code: "Dan",
      startPath: "/deuterokanonika/tambahan-daniel/tambahan-daniel-3.html",
    },
  },
  { order_index: 35, grouping: "old", name: "Hosea", abbreviation: "Hos", source: { type: "tb", code: "Hos" } },
  { order_index: 36, grouping: "old", name: "Yoel", abbreviation: "Yoe", source: { type: "tb", code: "Yoe" } },
  { order_index: 37, grouping: "old", name: "Amos", abbreviation: "Amo", source: { type: "tb", code: "Amo" } },
  { order_index: 38, grouping: "old", name: "Obaja", abbreviation: "Oba", source: { type: "tb", code: "Oba" } },
  { order_index: 39, grouping: "old", name: "Yunus", abbreviation: "Yun", source: { type: "tb", code: "Yun" } },
  { order_index: 40, grouping: "old", name: "Mikha", abbreviation: "Mik", source: { type: "tb", code: "Mik" } },
  { order_index: 41, grouping: "old", name: "Nahum", abbreviation: "Nah", source: { type: "tb", code: "Nah" } },
  { order_index: 42, grouping: "old", name: "Habakuk", abbreviation: "Hab", source: { type: "tb", code: "Hab" } },
  { order_index: 43, grouping: "old", name: "Zefanya", abbreviation: "Zef", source: { type: "tb", code: "Zef" } },
  { order_index: 44, grouping: "old", name: "Hagai", abbreviation: "Hag", source: { type: "tb", code: "Hag" } },
  { order_index: 45, grouping: "old", name: "Zakharia", abbreviation: "Zak", source: { type: "tb", code: "Zak" } },
  { order_index: 46, grouping: "old", name: "Maleakhi", abbreviation: "Mal", source: { type: "tb", code: "Mal" } },
  { order_index: 47, grouping: "new", name: "Matius", abbreviation: "Mat", source: { type: "tb", code: "Mat" } },
  { order_index: 48, grouping: "new", name: "Markus", abbreviation: "Mrk", source: { type: "tb", code: "Mrk" } },
  { order_index: 49, grouping: "new", name: "Lukas", abbreviation: "Luk", source: { type: "tb", code: "Luk" } },
  { order_index: 50, grouping: "new", name: "Yohanes", abbreviation: "Yoh", source: { type: "tb", code: "Yoh" } },
  { order_index: 51, grouping: "new", name: "Kisah Para Rasul", abbreviation: "Kis", source: { type: "tb", code: "Kis" } },
  { order_index: 52, grouping: "new", name: "Roma", abbreviation: "Rom", source: { type: "tb", code: "Rom" } },
  { order_index: 53, grouping: "new", name: "1 Korintus", abbreviation: "1Kor", source: { type: "tb", code: "1Ko" } },
  { order_index: 54, grouping: "new", name: "2 Korintus", abbreviation: "2Kor", source: { type: "tb", code: "2Ko" } },
  { order_index: 55, grouping: "new", name: "Galatia", abbreviation: "Gal", source: { type: "tb", code: "Gal" } },
  { order_index: 56, grouping: "new", name: "Efesus", abbreviation: "Efe", source: { type: "tb", code: "Efe" } },
  { order_index: 57, grouping: "new", name: "Filipi", abbreviation: "Flp", source: { type: "tb", code: "Flp" } },
  { order_index: 58, grouping: "new", name: "Kolose", abbreviation: "Kol", source: { type: "tb", code: "Kol" } },
  { order_index: 59, grouping: "new", name: "1 Tesalonika", abbreviation: "1Tes", source: { type: "tb", code: "1Te" } },
  { order_index: 60, grouping: "new", name: "2 Tesalonika", abbreviation: "2Tes", source: { type: "tb", code: "2Te" } },
  { order_index: 61, grouping: "new", name: "1 Timotius", abbreviation: "1Tim", source: { type: "tb", code: "1Ti" } },
  { order_index: 62, grouping: "new", name: "2 Timotius", abbreviation: "2Tim", source: { type: "tb", code: "2Ti" } },
  { order_index: 63, grouping: "new", name: "Titus", abbreviation: "Tit", source: { type: "tb", code: "Tit" } },
  { order_index: 64, grouping: "new", name: "Filemon", abbreviation: "Flm", source: { type: "tb", code: "Flm" } },
  { order_index: 65, grouping: "new", name: "Ibrani", abbreviation: "Ibr", source: { type: "tb", code: "Ibr" } },
  { order_index: 66, grouping: "new", name: "Yakobus", abbreviation: "Yak", source: { type: "tb", code: "Yak" } },
  { order_index: 67, grouping: "new", name: "1 Petrus", abbreviation: "1Pet", source: { type: "tb", code: "1Pt" } },
  { order_index: 68, grouping: "new", name: "2 Petrus", abbreviation: "2Pet", source: { type: "tb", code: "2Pt" } },
  { order_index: 69, grouping: "new", name: "1 Yohanes", abbreviation: "1Yoh", source: { type: "tb", code: "1Yo" } },
  { order_index: 70, grouping: "new", name: "2 Yohanes", abbreviation: "2Yoh", source: { type: "tb", code: "2Yo" } },
  { order_index: 71, grouping: "new", name: "3 Yohanes", abbreviation: "3Yoh", source: { type: "tb", code: "3Yo" } },
  { order_index: 72, grouping: "new", name: "Yudas", abbreviation: "Yud", source: { type: "tb", code: "Yud" } },
  { order_index: 73, grouping: "new", name: "Wahyu", abbreviation: "Why", source: { type: "tb", code: "Why" } },
];

const HTML_ENTITY_MAP = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  hellip: "...",
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
};

function parseArgs(argv) {
  const args = {
    lang: DEFAULT_LANG,
    version: DEFAULT_VERSION,
    resumeFile: DEFAULT_RESUME_FILE,
    reportFile: DEFAULT_REPORT_FILE,
    deuteroCsv: DEFAULT_DEUTERO_CSV,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retries: DEFAULT_RETRIES,
    retryBaseMs: DEFAULT_RETRY_BASE_MS,
    chunkSize: DEFAULT_CHUNK_SIZE,
    requestDelayMs: DEFAULT_REQUEST_DELAY_MS,
    dryRun: false,
    resetResume: false,
    skipAudit: false,
    onlyBook: "",
    fromOrder: 1,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") args.dryRun = true;
    else if (token === "--reset-resume") args.resetResume = true;
    else if (token === "--skip-audit") args.skipAudit = true;
    else if (token === "--lang") args.lang = String(argv[i + 1] || "");
    else if (token === "--version") args.version = String(argv[i + 1] || "");
    else if (token === "--resume-file") args.resumeFile = String(argv[i + 1] || "");
    else if (token === "--report-file") args.reportFile = String(argv[i + 1] || "");
    else if (token === "--deutero-csv") args.deuteroCsv = String(argv[i + 1] || "");
    else if (token === "--timeout-ms") args.timeoutMs = Number(argv[i + 1] || DEFAULT_TIMEOUT_MS);
    else if (token === "--retries") args.retries = Number(argv[i + 1] || DEFAULT_RETRIES);
    else if (token === "--retry-base-ms") args.retryBaseMs = Number(argv[i + 1] || DEFAULT_RETRY_BASE_MS);
    else if (token === "--chunk-size") args.chunkSize = Number(argv[i + 1] || DEFAULT_CHUNK_SIZE);
    else if (token === "--request-delay-ms") args.requestDelayMs = Number(argv[i + 1] || DEFAULT_REQUEST_DELAY_MS);
    else if (token === "--only-book") args.onlyBook = String(argv[i + 1] || "");
    else if (token === "--from-order") args.fromOrder = Number(argv[i + 1] || 1);

    if (
      [
        "--lang",
        "--version",
        "--resume-file",
        "--report-file",
        "--deutero-csv",
        "--timeout-ms",
        "--retries",
        "--retry-base-ms",
        "--chunk-size",
        "--request-delay-ms",
        "--only-book",
        "--from-order",
      ].includes(token)
    ) {
      i += 1;
    }
  }

  return args;
}

function loadEnv(envPath) {
  const env = {};
  if (!fs.existsSync(envPath)) return env;
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

function sleep(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function toPositiveInt(value) {
  const n = Number(String(value || "").trim());
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function decodeHtmlEntities(input) {
  return String(input || "")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&([a-z]+);/gi, (_, name) => HTML_ENTITY_MAP[name.toLowerCase()] || `&${name};`);
}

function stripTags(input) {
  return String(input || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "");
}

function cleanText(input) {
  return String(input || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2000-\u200f\u2028-\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function escapeRegex(input) {
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchTextWithRetry(url, options) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryBaseMs = DEFAULT_RETRY_BASE_MS,
  } = options || {};

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "mychatolic-sync/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const text = await response.text();
      clearTimeout(timeout);
      return text;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt >= retries) break;
      const waitMs = retryBaseMs * Math.pow(2, Math.min(attempt, 4));
      await sleep(waitMs);
    }
  }

  throw new Error(`Gagal fetch ${url}: ${lastError || "Unknown error"}`);
}

function extractChapterNumbersFromBookHtml(html, bookCode) {
  const code = escapeRegex(bookCode);
  const regex = new RegExp(`/tb/${code}/(\\d+)/`, "g");
  const found = new Set();
  let match = null;
  while ((match = regex.exec(html)) !== null) {
    const chapter = toPositiveInt(match[1]);
    if (chapter) found.add(chapter);
  }
  return Array.from(found).sort((a, b) => a - b);
}

function parsePassageChapterHtml(html) {
  const blockMatch = html.match(/<div\s+id="passage-text"[^>]*>([\s\S]*?)<\/div>\s*<hr\s*\/?\s*>/i);
  if (!blockMatch) {
    throw new Error("Tidak menemukan blok passage-text.");
  }

  const block = blockMatch[1];
  const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const verses = [];
  let pendingPericope = null;
  let match = null;

  while ((match = paragraphRegex.exec(block)) !== null) {
    const paragraphHtml = match[1] || "";
    const pericopeMatch = paragraphHtml.match(/<span\s+class="paragraphtitle"[^>]*>([\s\S]*?)<\/span>/i);
    if (pericopeMatch) {
      const rawTitle = decodeHtmlEntities(stripTags(pericopeMatch[1] || ""));
      const title = cleanText(rawTitle);
      pendingPericope = title || null;
      continue;
    }

    const verseMatch = paragraphHtml.match(/<a[^>]+name\s*=\s*["']?v(\d+)["']?[^>]*>/i);
    if (!verseMatch) continue;

    const verseNumber = toPositiveInt(verseMatch[1]);
    if (!verseNumber) continue;

    let cleaned = paragraphHtml;
    cleaned = cleaned.replace(/<span\s+class="reftext"[^>]*>[\s\S]*?<\/span>/i, "");
    cleaned = decodeHtmlEntities(stripTags(cleaned));
    cleaned = cleanText(cleaned);

    if (!cleaned) continue;

    verses.push({
      verse_number: verseNumber,
      text: cleaned,
      pericope: pendingPericope || null,
    });

    pendingPericope = null;
  }

  const byVerse = new Map();
  for (const item of verses) {
    byVerse.set(item.verse_number, item);
  }

  return Array.from(byVerse.values()).sort((a, b) => a.verse_number - b.verse_number);
}

function toKatakombeUrl(pathOrUrl) {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return new URL(raw, KATAKOMBE_BASE_URL).toString();
}

function extractKatakombeNextPath(html) {
  const nextMatch = String(html || "").match(
    /<li[^>]*class=["'][^"']*\bnext\b[^"']*["'][^>]*>\s*<a[^>]+href=["']([^"']+)["']/i,
  );
  return String(nextMatch?.[1] || "").trim();
}

function parseKatakombeChapterNumber(titleText) {
  const normalized = cleanText(titleText);
  if (!normalized) return null;

  const tailMatch = normalized.match(/([0-9]+|[a-z])$/i);
  if (!tailMatch) return null;

  const token = String(tailMatch[1] || "").trim();
  if (/^\d+$/.test(token)) {
    return toPositiveInt(token);
  }

  const upper = token.toUpperCase();
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const idx = letters.indexOf(upper);
  if (idx < 0) return null;
  return idx + 1;
}

function parseKatakombeChapterHtml(html) {
  const titleMatch =
    String(html || "").match(/<h2[^>]*itemprop=["']name["'][^>]*>([\s\S]*?)<\/h2>/i) ||
    String(html || "").match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const title = cleanText(decodeHtmlEntities(stripTags(titleMatch?.[1] || "")));
  const chapterNumber = parseKatakombeChapterNumber(title);
  if (!chapterNumber) {
    throw new Error(`Tidak dapat membaca nomor pasal dari judul Katakombe: ${title || "-"}`);
  }

  const articleBodyMatch = String(html || "").match(
    /<div\s+class=["']article-body["'][^>]*>([\s\S]*?)<\/div>\s*<\/article>/i,
  );
  const articleBody = articleBodyMatch?.[1] || String(html || "");

  const tokenRegex =
    /<h4[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>\s*<\/h4>|<tr[^>]*>[\s\S]*?<td[^>]*>[\s\S]*?<h4[^>]*>\s*(\d+)\s*<\/h4>[\s\S]*?<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;

  const verses = [];
  let pendingPericope = null;
  let match = null;
  while ((match = tokenRegex.exec(articleBody)) !== null) {
    if (match[1]) {
      const pericopeText = cleanText(decodeHtmlEntities(stripTags(match[1])));
      pendingPericope = pericopeText || null;
      continue;
    }

    const verseNo = toPositiveInt(match[2] || "");
    if (!verseNo) continue;
    const verseText = cleanText(decodeHtmlEntities(stripTags(match[3] || "")));
    if (!verseText) continue;

    verses.push({
      verse_number: verseNo,
      text: verseText,
      pericope: pendingPericope || null,
    });
    pendingPericope = null;
  }

  const byVerse = new Map();
  for (const row of verses) {
    byVerse.set(Number(row.verse_number), row);
  }

  return {
    title,
    chapter_number: chapterNumber,
    verses: Array.from(byVerse.values()).sort((a, b) => a.verse_number - b.verse_number),
  };
}

async function fetchKatakombeBookRows(startPath, options) {
  const startUrl = toKatakombeUrl(startPath);
  if (!startUrl) {
    throw new Error("startPath Katakombe kosong.");
  }

  const startPathname = new URL(startUrl).pathname;
  const scopePrefix = startPathname.replace(/[^/]+$/, "");
  const visited = new Set();
  const byChapter = new Map();
  const chapterOffset = Number(options?.chapterOffset || 0);

  let cursor = startUrl;
  let guard = 0;

  while (cursor && guard < 500) {
    guard += 1;
    if (visited.has(cursor)) break;
    visited.add(cursor);

    const html = await fetchTextWithRetry(cursor, options);
    const parsed = parseKatakombeChapterHtml(html);
    const chapterNumber = Number(parsed.chapter_number || 0) + chapterOffset;
    if (parsed.verses.length > 0) {
      byChapter.set(chapterNumber, parsed.verses);
    }

    const nextPath = extractKatakombeNextPath(html);
    if (!nextPath) break;
    const nextUrl = toKatakombeUrl(nextPath);
    const nextPathname = new URL(nextUrl).pathname;
    if (!nextPathname.startsWith(scopePrefix)) break;
    cursor = nextUrl;
    await sleep(options?.requestDelayMs || 0);
  }

  return byChapter;
}

function loadDeuteroRows(csvPath) {
  if (!fs.existsSync(csvPath)) {
    return new Map();
  }

  const workbook = XLSX.readFile(csvPath, { raw: false, cellDates: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

  const dataByBook = new Map();

  for (const rowRaw of rows) {
    const row = rowRaw || {};
    const bookName = cleanText(row.book_name || row.book || row.kitab || "");
    const chapter = toPositiveInt(row.chapter || row.chapter_number || row.pasal);
    const verse = toPositiveInt(row.verse || row.verse_number || row.ayat);
    const text = cleanText(row.text || row.content || row.ayat_text || "");
    const pericope = cleanText(row.pericope || row.perikop || "") || null;

    if (!bookName || !chapter || !verse || !text) continue;

    const key = normalizeText(bookName);
    if (!dataByBook.has(key)) dataByBook.set(key, new Map());
    const byChapter = dataByBook.get(key);
    if (!byChapter.has(chapter)) byChapter.set(chapter, new Map());

    byChapter.get(chapter).set(verse, {
      verse_number: verse,
      text,
      pericope,
    });
  }

  return dataByBook;
}

function getDeuteroChapterRows(dataByBook, bookName, chapterNumber) {
  const key = normalizeText(bookName);
  const byChapter = dataByBook.get(key);
  if (!byChapter) return [];
  const byVerse = byChapter.get(chapterNumber);
  if (!byVerse) return [];
  return Array.from(byVerse.values()).sort((a, b) => a.verse_number - b.verse_number);
}

function getDeuteroChapterNumbers(dataByBook, bookName) {
  const key = normalizeText(bookName);
  const byChapter = dataByBook.get(key);
  if (!byChapter) return [];
  return Array.from(byChapter.keys()).sort((a, b) => a - b);
}

function mergeChapterRows(baseRows, overlayRows) {
  const byVerse = new Map();
  for (const row of baseRows || []) {
    byVerse.set(Number(row.verse_number), {
      verse_number: Number(row.verse_number),
      text: cleanText(row.text),
      pericope: cleanText(row.pericope || "") || null,
    });
  }

  for (const row of overlayRows || []) {
    const verseNo = Number(row.verse_number);
    const prev = byVerse.get(verseNo);
    const next = {
      verse_number: verseNo,
      text: cleanText(row.text) || cleanText(prev?.text) || "",
      pericope: cleanText(row.pericope || "") || cleanText(prev?.pericope || "") || null,
    };
    if (next.text) byVerse.set(verseNo, next);
  }

  return Array.from(byVerse.values())
    .filter((item) => item.verse_number > 0 && cleanText(item.text))
    .sort((a, b) => a.verse_number - b.verse_number);
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function readResumeState(filePath, reset) {
  if (reset || !fs.existsSync(filePath)) {
    return {
      version: 1,
      updated_at: new Date().toISOString(),
      workspace: "",
      books: {},
      stats: {
        chapters_synced: 0,
        verses_upserted: 0,
      },
    };
  }
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid JSON");
    if (!parsed.books || typeof parsed.books !== "object") parsed.books = {};
    if (!parsed.stats || typeof parsed.stats !== "object") {
      parsed.stats = { chapters_synced: 0, verses_upserted: 0 };
    }
    return parsed;
  } catch {
    return {
      version: 1,
      updated_at: new Date().toISOString(),
      workspace: "",
      books: {},
      stats: {
        chapters_synced: 0,
        verses_upserted: 0,
      },
    };
  }
}

function writeResumeState(filePath, state) {
  state.updated_at = new Date().toISOString();
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

function isChapterCompleted(resume, bookName, chapterNumber) {
  const key = normalizeText(bookName);
  const book = resume.books[key];
  if (!book || !Array.isArray(book.completed_chapters)) return false;
  return book.completed_chapters.includes(chapterNumber);
}

function markChapterCompleted(resume, bookName, chapterNumber, totalChapters) {
  const key = normalizeText(bookName);
  if (!resume.books[key]) {
    resume.books[key] = {
      name: bookName,
      completed_chapters: [],
      total_chapters: totalChapters || 0,
    };
  }

  const completed = new Set(resume.books[key].completed_chapters || []);
  completed.add(chapterNumber);
  resume.books[key].completed_chapters = Array.from(completed).sort((a, b) => a - b);
  resume.books[key].total_chapters = totalChapters || resume.books[key].total_chapters || 0;
}

async function fetchWorkspaceBooks(client, lang, version) {
  const { data, error } = await client
    .from("bible_books")
    .select("id,name,abbreviation,grouping,order_index,legacy_book_id,total_chapters")
    .eq("language_code", lang)
    .eq("version_code", version)
    .order("order_index", { ascending: true });
  if (error) throw new Error(`Gagal memuat bible_books: ${error.message}`);
  return data || [];
}

function parseLegacyBookId(value) {
  const n = toPositiveInt(value);
  return n || null;
}

async function ensureLegacyBookId(client, bookId, usedSet, startFrom = 1) {
  let candidate = Math.max(startFrom, 1);
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    while (usedSet.has(candidate)) candidate += 1;

    const { data, error } = await client
      .from("bible_books")
      .update({ legacy_book_id: String(candidate) })
      .eq("id", bookId)
      .is("legacy_book_id", null)
      .select("legacy_book_id")
      .maybeSingle();

    if (!error) {
      const assigned = parseLegacyBookId(data?.legacy_book_id);
      if (assigned) {
        usedSet.add(assigned);
        return assigned;
      }

      const reread = await client
        .from("bible_books")
        .select("legacy_book_id")
        .eq("id", bookId)
        .maybeSingle();
      const existing = parseLegacyBookId(reread.data?.legacy_book_id);
      if (existing) {
        usedSet.add(existing);
        return existing;
      }
    }

    candidate += 1;
  }

  throw new Error(`Gagal assign legacy_book_id untuk book_id=${bookId}`);
}

async function ensureBooksAndLegacyIds(client, lang, version, plan) {
  let books = await fetchWorkspaceBooks(client, lang, version);
  const byOrder = new Map();
  const byName = new Map();
  for (const row of books) {
    byOrder.set(Number(row.order_index || 0), row);
    byName.set(normalizeText(row.name), row);
  }

  for (const target of plan) {
    const existing = byOrder.get(target.order_index) || byName.get(normalizeText(target.name));

    if (!existing) {
      const { data, error } = await client
        .from("bible_books")
        .insert({
          language_code: lang,
          version_code: version,
          name: target.name,
          abbreviation: target.abbreviation,
          grouping: target.grouping,
          order_index: target.order_index,
          total_chapters: 0,
        })
        .select("id,name,abbreviation,grouping,order_index,legacy_book_id,total_chapters")
        .maybeSingle();

      if (error || !data?.id) {
        throw new Error(`Gagal membuat kitab ${target.name}: ${error?.message || "Unknown error"}`);
      }
    } else {
      const patch = {};
      if (String(existing.name || "") !== target.name) patch.name = target.name;
      if (String(existing.abbreviation || "") !== target.abbreviation) patch.abbreviation = target.abbreviation;
      if (String(existing.grouping || "") !== target.grouping) patch.grouping = target.grouping;
      if (Number(existing.order_index || 0) !== Number(target.order_index)) {
        patch.order_index = target.order_index;
      }

      if (Object.keys(patch).length > 0) {
        const { error } = await client.from("bible_books").update(patch).eq("id", existing.id);
        if (error) throw new Error(`Gagal update kitab ${target.name}: ${error.message}`);
      }
    }
  }

  books = await fetchWorkspaceBooks(client, lang, version);

  const usedLegacy = new Set();
  let maxLegacy = 0;
  for (const book of books) {
    const parsed = parseLegacyBookId(book.legacy_book_id);
    if (parsed) {
      usedLegacy.add(parsed);
      if (parsed > maxLegacy) maxLegacy = parsed;
    }
  }

  for (const target of plan) {
    const book = books.find((row) => Number(row.order_index || 0) === target.order_index);
    if (!book) continue;

    if (!parseLegacyBookId(book.legacy_book_id)) {
      const assigned = await ensureLegacyBookId(client, String(book.id), usedLegacy, maxLegacy + 1);
      if (assigned > maxLegacy) maxLegacy = assigned;
      book.legacy_book_id = String(assigned);
    }
  }

  return books;
}

async function fetchChapterId(client, bookId, chapterNumber, cache) {
  const key = `${bookId}::${chapterNumber}`;
  if (cache.has(key)) return cache.get(key);

  let chapterId = null;

  const upsertResult = await client
    .from("bible_chapters")
    .upsert(
      {
        book_id: bookId,
        chapter_number: chapterNumber,
      },
      { onConflict: "book_id,chapter_number" },
    )
    .select("id")
    .maybeSingle();

  if (!upsertResult.error && upsertResult.data?.id) {
    chapterId = String(upsertResult.data.id);
  } else {
    const selectResult = await client
      .from("bible_chapters")
      .select("id")
      .eq("book_id", bookId)
      .eq("chapter_number", chapterNumber)
      .maybeSingle();

    if (selectResult.error || !selectResult.data?.id) {
      throw new Error(
        `Gagal resolve chapter_id untuk book_id=${bookId} chapter=${chapterNumber}: ${
          selectResult.error?.message || upsertResult.error?.message || "Unknown error"
        }`,
      );
    }
    chapterId = String(selectResult.data.id);
  }

  cache.set(key, chapterId);
  return chapterId;
}

async function upsertChapterVerses({
  client,
  chapterId,
  legacyBookId,
  chapterNumber,
  verses,
  chunkSize,
  dryRun,
}) {
  const cleaned = (verses || [])
    .map((row) => ({
      verse_number: Number(row.verse_number),
      text: cleanText(row.text),
      pericope: cleanText(row.pericope || "") || null,
    }))
    .filter((row) => row.verse_number > 0 && row.text);

  if (cleaned.length === 0) return { upserted: 0, deleted_extra: 0 };

  if (!dryRun) {
    for (const chunk of chunkArray(cleaned, chunkSize)) {
      const payload = chunk.map((row) => ({
        chapter_id: chapterId,
        verse_number: row.verse_number,
        text: row.text,
        pericope: row.pericope,
        chapter: chapterNumber,
        content: row.text,
        type: "text",
        ...(legacyBookId ? { book_id: legacyBookId } : {}),
      }));

      let upsertResult = await client
        .from("bible_verses")
        .upsert(payload, { onConflict: "chapter_id,verse_number" });

      if (upsertResult.error && String(upsertResult.error.message || "").toLowerCase().includes("column")) {
        upsertResult = await client.from("bible_verses").upsert(
          chunk.map((row) => ({
            chapter_id: chapterId,
            verse_number: row.verse_number,
            text: row.text,
            pericope: row.pericope,
          })),
          { onConflict: "chapter_id,verse_number" },
        );
      }

      if (upsertResult.error) {
        throw new Error(`Gagal upsert bible_verses chapter_id=${chapterId}: ${upsertResult.error.message}`);
      }
    }

    const verseNumbers = cleaned.map((row) => row.verse_number);
    const filter = `(${verseNumbers.join(",")})`;
    const deleteResult = await client
      .from("bible_verses")
      .delete()
      .eq("chapter_id", chapterId)
      .not("verse_number", "in", filter);

    if (deleteResult.error) {
      throw new Error(`Gagal hapus verse ekstra chapter_id=${chapterId}: ${deleteResult.error.message}`);
    }
  }

  return { upserted: cleaned.length, deleted_extra: 0 };
}

async function runAudit(client, lang, version, plan) {
  const booksResult = await client
    .from("bible_books")
    .select("id,name,grouping,order_index,total_chapters")
    .eq("language_code", lang)
    .eq("version_code", version)
    .order("order_index", { ascending: true });

  if (booksResult.error) throw new Error(`Gagal audit baca books: ${booksResult.error.message}`);

  const books = booksResult.data || [];
  const bookIds = books.map((row) => String(row.id));

  const chapterRows = [];
  for (const chunk of chunkArray(bookIds, 200)) {
    if (chunk.length === 0) continue;

    let from = 0;
    while (true) {
      const to = from + 999;
      const chaptersResult = await client
        .from("bible_chapters")
        .select("id,book_id,chapter_number")
        .in("book_id", chunk)
        .order("book_id", { ascending: true })
        .order("chapter_number", { ascending: true })
        .range(from, to);

      if (chaptersResult.error) {
        throw new Error(`Gagal audit baca chapters: ${chaptersResult.error.message}`);
      }

      const rows = chaptersResult.data || [];
      chapterRows.push(...rows);
      if (rows.length < 1000) break;
      from += 1000;
    }
  }

  let verseCount = 0;
  let pericopeCount = 0;
  const chapterIds = chapterRows.map((row) => String(row.id));
  for (const chapterIdChunk of chunkArray(chapterIds, 40)) {
    if (chapterIdChunk.length === 0) continue;
    let from = 0;
    while (true) {
      const to = from + 999;
      const versesResult = await client
        .from("bible_verses")
        .select("chapter_id,pericope")
        .in("chapter_id", chapterIdChunk)
        .order("chapter_id", { ascending: true })
        .order("verse_number", { ascending: true })
        .range(from, to);

      if (versesResult.error) {
        throw new Error(`Gagal audit baca verses: ${versesResult.error.message}`);
      }

      const rows = versesResult.data || [];
      verseCount += rows.length;
      for (const verse of rows) {
        if (cleanText(verse.pericope || "")) pericopeCount += 1;
      }
      if (rows.length < 1000) break;
      from += 1000;
    }
  }

  const planByOrder = new Map(plan.map((item) => [item.order_index, item]));
  const chapterCountByBook = new Map();
  for (const chapter of chapterRows) {
    const bookId = String(chapter.book_id);
    chapterCountByBook.set(bookId, (chapterCountByBook.get(bookId) || 0) + 1);
  }

  const missingBookCoverage = [];
  for (const row of books) {
    const expected = planByOrder.get(Number(row.order_index || 0));
    if (!expected) continue;
    const chapterCount = chapterCountByBook.get(String(row.id)) || 0;
    if (chapterCount === 0) {
      missingBookCoverage.push({
        order_index: row.order_index,
        name: row.name,
        issue: "Tidak ada chapter",
      });
    }
  }

  return {
    generated_at: new Date().toISOString(),
    workspace: `${lang}/${version}`,
    totals: {
      books: books.length,
      chapters: chapterRows.length,
      verses: verseCount,
      verses_with_pericope: pericopeCount,
    },
    missing_book_coverage: missingBookCoverage,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.lang || !args.version) {
    throw new Error("Argumen --lang dan --version wajib diisi.");
  }

  if (!Number.isInteger(args.fromOrder) || args.fromOrder < 1) {
    throw new Error("--from-order harus angka bulat >= 1.");
  }

  const envFile = path.resolve(".env.local");
  const fileEnv = loadEnv(envFile);

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    fileEnv.NEXT_PUBLIC_SUPABASE_URL ||
    "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
    "";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE env tidak lengkap. Butuh NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY.");
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const resumePath = path.resolve(args.resumeFile);
  const reportPath = path.resolve(args.reportFile);
  const deuteroCsvPath = path.resolve(args.deuteroCsv);

  const plan = BOOK_PLAN.filter((item) => {
    if (item.order_index < args.fromOrder) return false;
    if (!args.onlyBook) return true;
    return normalizeText(item.name) === normalizeText(args.onlyBook);
  });

  if (plan.length === 0) {
    throw new Error("Tidak ada kitab yang match dengan filter saat ini.");
  }

  const resume = readResumeState(resumePath, args.resetResume);
  resume.workspace = `${args.lang}/${args.version}`;

  const deuteroDataByBook = loadDeuteroRows(deuteroCsvPath);

  const workspaceBooks = await ensureBooksAndLegacyIds(client, args.lang, args.version, BOOK_PLAN);
  const workspaceBookByOrder = new Map(
    workspaceBooks.map((item) => [Number(item.order_index || 0), item]),
  );

  const chapterIdCache = new Map();
  const runStats = {
    books_targeted: plan.length,
    books_processed: 0,
    chapters_processed: 0,
    verses_upserted: 0,
    warnings: [],
    started_at: new Date().toISOString(),
  };

  if (deuteroDataByBook.size === 0) {
    runStats.warnings.push(
      `Fallback CSV deuterokanonika tidak ditemukan atau kosong: ${deuteroCsvPath}`,
    );
  }

  console.log(`[START] Workspace ${args.lang}/${args.version} | books=${plan.length} | dryRun=${args.dryRun}`);

  for (const bookPlan of plan) {
    const workspaceBook = workspaceBookByOrder.get(bookPlan.order_index);
    if (!workspaceBook) {
      runStats.warnings.push(`Kitab order=${bookPlan.order_index} tidak ditemukan di workspace.`);
      continue;
    }

    const bookId = String(workspaceBook.id);
    const legacyBookId = parseLegacyBookId(workspaceBook.legacy_book_id);
    let katakombeByChapter = new Map();
    let tbChapterNumbers = [];

    if (bookPlan.source.type === "katakombe" || bookPlan.source.type === "tb_with_katakombe_overlay") {
      try {
        katakombeByChapter = await fetchKatakombeBookRows(bookPlan.source.startPath, {
          timeoutMs: args.timeoutMs,
          retries: args.retries,
          retryBaseMs: args.retryBaseMs,
          requestDelayMs: args.requestDelayMs,
          chapterOffset: Number(bookPlan.source.chapterOffset || 0),
        });
      } catch (error) {
        runStats.warnings.push(
          `Katakombe gagal untuk ${bookPlan.name}, pakai fallback CSV jika ada: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    let chapterNumbers = [];
    if (bookPlan.source.type === "tb" || bookPlan.source.type === "tb_with_katakombe_overlay") {
      const bookUrl = `https://alkitab.mobi/tb/${bookPlan.source.code}/`;
      const bookHtml = await fetchTextWithRetry(bookUrl, {
        timeoutMs: args.timeoutMs,
        retries: args.retries,
        retryBaseMs: args.retryBaseMs,
      });
      tbChapterNumbers = extractChapterNumbersFromBookHtml(bookHtml, bookPlan.source.code);
      chapterNumbers = [...tbChapterNumbers];
      if (tbChapterNumbers.length === 0) {
        throw new Error(`Tidak dapat menemukan daftar pasal untuk ${bookPlan.name} (${bookPlan.source.code}).`);
      }
      await sleep(args.requestDelayMs);
    }

    if (bookPlan.source.type === "katakombe") {
      chapterNumbers = Array.from(katakombeByChapter.keys()).sort((a, b) => a - b);
      if (chapterNumbers.length === 0) {
        chapterNumbers = getDeuteroChapterNumbers(deuteroDataByBook, bookPlan.name);
      }
      if (chapterNumbers.length === 0) {
        runStats.warnings.push(`Tidak ada data sumber untuk kitab ${bookPlan.name}.`);
        continue;
      }
    }

    if (bookPlan.source.type === "csv") {
      chapterNumbers = getDeuteroChapterNumbers(deuteroDataByBook, bookPlan.name);
      if (chapterNumbers.length === 0) {
        runStats.warnings.push(`CSV deuterokanonika tidak memiliki data untuk kitab ${bookPlan.name}.`);
        continue;
      }
    }

    if (bookPlan.source.type === "tb_with_katakombe_overlay") {
      const overlayChapters = Array.from(katakombeByChapter.keys()).sort((a, b) => a - b);
      const fallbackChapters = getDeuteroChapterNumbers(deuteroDataByBook, bookPlan.name);
      for (const chapter of fallbackChapters) {
        if (!overlayChapters.includes(chapter)) overlayChapters.push(chapter);
      }
      for (const chapter of overlayChapters) {
        if (!chapterNumbers.includes(chapter)) chapterNumbers.push(chapter);
      }
      chapterNumbers.sort((a, b) => a - b);
    }

    const totalChapters = chapterNumbers.length;
    const tbChapterSet = new Set(tbChapterNumbers);
    console.log(`[BOOK] ${bookPlan.order_index}. ${bookPlan.name} | chapters=${totalChapters}`);

    for (const chapterNumber of chapterNumbers) {
      if (isChapterCompleted(resume, bookPlan.name, chapterNumber)) {
        continue;
      }

      let chapterRows = [];
      const shouldFetchTbChapter =
        bookPlan.source.type === "tb" ||
        (bookPlan.source.type === "tb_with_katakombe_overlay" && tbChapterSet.has(chapterNumber));

      if (shouldFetchTbChapter) {
        const chapterUrl = `https://alkitab.mobi/tb/${bookPlan.source.code}/${chapterNumber}/`;
        const chapterHtml = await fetchTextWithRetry(chapterUrl, {
          timeoutMs: args.timeoutMs,
          retries: args.retries,
          retryBaseMs: args.retryBaseMs,
        });

        chapterRows = parsePassageChapterHtml(chapterHtml);
        await sleep(args.requestDelayMs);
      }

      if (bookPlan.source.type === "csv") {
        chapterRows = getDeuteroChapterRows(deuteroDataByBook, bookPlan.name, chapterNumber);
      }

      if (bookPlan.source.type === "katakombe") {
        chapterRows =
          katakombeByChapter.get(chapterNumber) ||
          getDeuteroChapterRows(deuteroDataByBook, bookPlan.name, chapterNumber);
      }

      if (bookPlan.source.type === "tb_with_katakombe_overlay") {
        const overlayRows =
          katakombeByChapter.get(chapterNumber) ||
          getDeuteroChapterRows(deuteroDataByBook, bookPlan.name, chapterNumber);
        chapterRows = mergeChapterRows(chapterRows, overlayRows);
      }

      if (chapterRows.length === 0) {
        runStats.warnings.push(
          `Tidak ada ayat untuk ${bookPlan.name} pasal ${chapterNumber} (source=${bookPlan.source.type}).`,
        );
        markChapterCompleted(resume, bookPlan.name, chapterNumber, totalChapters);
        writeResumeState(resumePath, resume);
        continue;
      }

      const chapterId = await fetchChapterId(client, bookId, chapterNumber, chapterIdCache);
      const upsertResult = await upsertChapterVerses({
        client,
        chapterId,
        legacyBookId,
        chapterNumber,
        verses: chapterRows,
        chunkSize: args.chunkSize,
        dryRun: args.dryRun,
      });

      runStats.chapters_processed += 1;
      runStats.verses_upserted += upsertResult.upserted;

      resume.stats.chapters_synced = Number(resume.stats.chapters_synced || 0) + 1;
      resume.stats.verses_upserted = Number(resume.stats.verses_upserted || 0) + upsertResult.upserted;

      markChapterCompleted(resume, bookPlan.name, chapterNumber, totalChapters);
      writeResumeState(resumePath, resume);

      if (runStats.chapters_processed % 20 === 0) {
        console.log(
          `[PROGRESS] chapters=${runStats.chapters_processed}, verses=${runStats.verses_upserted}, last=${bookPlan.name} ${chapterNumber}`,
        );
      }
    }

    const maxChapter = chapterNumbers.length ? Math.max(...chapterNumbers) : 0;
    if (!args.dryRun && maxChapter > 0) {
      const { error } = await client
        .from("bible_books")
        .update({ total_chapters: maxChapter })
        .eq("id", bookId);
      if (error) {
        runStats.warnings.push(`Gagal update total_chapters ${bookPlan.name}: ${error.message}`);
      }
    }

    runStats.books_processed += 1;
  }

  const audit = args.skipAudit
    ? {
        generated_at: new Date().toISOString(),
        workspace: `${args.lang}/${args.version}`,
        skipped: true,
      }
    : await runAudit(client, args.lang, args.version, BOOK_PLAN);

  const report = {
    generated_at: new Date().toISOString(),
    workspace: `${args.lang}/${args.version}`,
    args,
    run_stats: {
      ...runStats,
      finished_at: new Date().toISOString(),
    },
    audit,
  };

  ensureDirForFile(reportPath);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log("[DONE] Sinkronisasi selesai.");
  console.log(
    `[SUMMARY] books=${runStats.books_processed}/${runStats.books_targeted}, chapters=${runStats.chapters_processed}, verses_upserted=${runStats.verses_upserted}`,
  );
  console.log(`[FILES] resume=${resumePath}`);
  console.log(`[FILES] report=${reportPath}`);
}

main().catch((error) => {
  console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
