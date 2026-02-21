#!/usr/bin/env node

import fs from "fs";
import path from "path";
import process from "process";
import { createClient } from "@supabase/supabase-js";

const SOURCE_LANG = "id";
const SOURCE_VERSION = "TB1";
const TARGET_LANG = "id";
const TARGET_VERSION = "TB2";
const PLACEHOLDER_TEXT =
  "[MISSING_VERSE][AUTO][TB2] Teks ayat TB2 belum tersedia dari referensi resmi. Mohon lengkapi manual.";
const DEFAULT_REPORT = "docs/import/tb2_reference_scaffold_report.json";
let dryRunIdCounter = 1;

function parseArgs(argv) {
  const args = {
    dryRun: false,
    report: DEFAULT_REPORT,
    keepExtraBooks: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") args.dryRun = true;
    else if (token === "--report") args.report = String(argv[i + 1] || "");
    else if (token === "--keep-extra-books") args.keepExtraBooks = true;

    if (token === "--report") i += 1;
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

function nextDryRunUuid() {
  const suffix = dryRunIdCounter.toString(16).padStart(12, "0");
  dryRunIdCounter += 1;
  return `00000000-0000-4000-8000-${suffix}`;
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
    // Stable tie-breaker is required so range pagination does not skip/duplicate rows.
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

async function getNextLegacyBookId(client) {
  const rows = await fetchAll(client, "bible_books", "legacy_book_id", 1000, null);
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

  const sourceBooks = await fetchAll(
    client,
    "bible_books",
    "id,name,abbreviation,grouping,order_index,legacy_book_id",
    1000,
    (query) =>
      query
        .eq("language_code", SOURCE_LANG)
        .eq("version_code", SOURCE_VERSION)
        .order("order_index", { ascending: true })
        .order("name", { ascending: true }),
  );

  const targetBooks = await fetchAll(
    client,
    "bible_books",
    "id,name,abbreviation,grouping,order_index,legacy_book_id",
    1000,
    (query) =>
      query
        .eq("language_code", TARGET_LANG)
        .eq("version_code", TARGET_VERSION)
        .order("order_index", { ascending: true })
        .order("name", { ascending: true }),
  );

  const targetByKey = new Map();
  for (const row of targetBooks) {
    targetByKey.set(normalizeBookKey(row.name), row);
  }

  const sourceByKey = new Map();
  for (const row of sourceBooks) {
    sourceByKey.set(normalizeBookKey(row.name), row);
  }

  const bookPairs = [];
  const bookCreates = [];
  const bookUpdates = [];
  let nextLegacyId = await getNextLegacyBookId(client);

  for (const source of sourceBooks) {
    const key = normalizeBookKey(source.name);
    const target = targetByKey.get(key) || null;
    if (target) {
      bookPairs.push({
        key,
        source,
        target,
      });

      const needsUpdate =
        normalizeText(target.name) !== normalizeText(source.name) ||
        normalizeText(target.abbreviation) !== normalizeText(source.abbreviation) ||
        normalizeText(target.grouping) !== normalizeText(source.grouping) ||
        Number(target.order_index || 0) !== Number(source.order_index || 0);

      if (needsUpdate) {
        bookUpdates.push({
          target_id: String(target.id),
          payload: {
            name: normalizeText(source.name),
            abbreviation: normalizeText(source.abbreviation) || null,
            grouping: normalizeText(source.grouping) || "old",
            order_index: Number(source.order_index || 0),
          },
        });
      }
      continue;
    }

    const legacyBookId = String(nextLegacyId);
    nextLegacyId += 1;
    bookCreates.push({
      key,
      payload: {
        language_code: TARGET_LANG,
        version_code: TARGET_VERSION,
        name: normalizeText(source.name),
        abbreviation: normalizeText(source.abbreviation) || null,
        grouping: normalizeText(source.grouping) || "old",
        order_index: Number(source.order_index || 0),
        legacy_book_id: legacyBookId,
      },
    });
  }

  if (!args.dryRun) {
    for (const item of bookUpdates) {
      const { error } = await client.from("bible_books").update(item.payload).eq("id", item.target_id);
      if (error) throw new Error(`Gagal update target book ${item.target_id}: ${error.message}`);
    }

    for (const item of bookCreates) {
      const { data, error } = await client
        .from("bible_books")
        .insert(item.payload)
        .select("id,name,abbreviation,grouping,order_index,legacy_book_id")
        .maybeSingle();
      if (error) throw new Error(`Gagal create target book ${item.payload.name}: ${error.message}`);
      if (!data?.id) throw new Error(`Create target book ${item.payload.name} tidak mengembalikan id.`);
      bookPairs.push({
        key: item.key,
        source: sourceByKey.get(item.key),
        target: data,
      });
    }
  }

  if (args.dryRun) {
    for (const item of bookCreates) {
      bookPairs.push({
        key: item.key,
        source: sourceByKey.get(item.key),
        target: {
          id: nextDryRunUuid(),
          name: item.payload.name,
          abbreviation: item.payload.abbreviation,
          grouping: item.payload.grouping,
          order_index: item.payload.order_index,
          legacy_book_id: item.payload.legacy_book_id,
        },
      });
    }
  }

  const targetBooksAfter = args.dryRun
    ? bookPairs.map((item) => item.target)
    : await fetchAll(
        client,
        "bible_books",
        "id,name,abbreviation,grouping,order_index,legacy_book_id",
        1000,
        (query) =>
          query
            .eq("language_code", TARGET_LANG)
            .eq("version_code", TARGET_VERSION)
            .order("order_index", { ascending: true })
            .order("name", { ascending: true }),
      );
  const targetAfterByKey = new Map(targetBooksAfter.map((row) => [normalizeBookKey(row.name), row]));

  const mapping = [];
  for (const source of sourceBooks) {
    const key = normalizeBookKey(source.name);
    const target = targetAfterByKey.get(key);
    if (!target) continue;
    mapping.push({
      key,
      source_book_id: String(source.id),
      source_book_name: source.name,
      target_book_id: String(target.id),
      target_book_name: target.name,
      target_legacy_book_id: normalizeText(target.legacy_book_id),
    });
  }

  const sourceBookIds = mapping.map((item) => item.source_book_id);
  const targetBookIds = mapping.map((item) => item.target_book_id);

  const sourceChapters = sourceBookIds.length
    ? await fetchByInChunks(
        client,
        "bible_chapters",
        "id,book_id,chapter_number",
        "book_id",
        sourceBookIds,
        1000,
      )
    : [];
  const targetChapters = targetBookIds.length
    ? await fetchByInChunks(
        client,
        "bible_chapters",
        "id,book_id,chapter_number",
        "book_id",
        targetBookIds,
        1000,
      )
    : [];

  const sourceChaptersByBookId = new Map();
  for (const chapter of sourceChapters) {
    const key = String(chapter.book_id);
    if (!sourceChaptersByBookId.has(key)) sourceChaptersByBookId.set(key, []);
    sourceChaptersByBookId.get(key).push(chapter);
  }

  const targetChapterByTargetKey = new Map(
    targetChapters.map((item) => [`${item.book_id}::${item.chapter_number}`, item]),
  );

  const chapterCreates = [];
  for (const pair of mapping) {
    const sourceForBook = sourceChaptersByBookId.get(pair.source_book_id) || [];
    for (const sourceChapter of sourceForBook) {
      const targetKey = `${pair.target_book_id}::${sourceChapter.chapter_number}`;
      const targetChapter = targetChapterByTargetKey.get(targetKey);
      if (!targetChapter) {
        chapterCreates.push({
          target_book_id: pair.target_book_id,
          chapter_number: Number(sourceChapter.chapter_number),
        });
      }
    }
  }

  if (!args.dryRun && chapterCreates.length > 0) {
    const payload = chapterCreates.map((item) => ({
      book_id: item.target_book_id,
      chapter_number: item.chapter_number,
    }));
    const { error } = await client
      .from("bible_chapters")
      .upsert(payload, { onConflict: "book_id,chapter_number", ignoreDuplicates: false });
    if (error) throw new Error(`Gagal create chapters target TB2: ${error.message}`);
  }

  const targetChaptersAfterBase = targetBookIds.length
    ? await fetchByInChunks(
        client,
        "bible_chapters",
        "id,book_id,chapter_number",
        "book_id",
        targetBookIds,
        1000,
      )
    : [];
  const syntheticDryRunChapters = args.dryRun
    ? chapterCreates.map((item) => ({
        id: nextDryRunUuid(),
        book_id: item.target_book_id,
        chapter_number: item.chapter_number,
      }))
    : [];
  const targetChaptersAfter = [...targetChaptersAfterBase, ...syntheticDryRunChapters];
  const targetAfterChapterByKey = new Map(
    targetChaptersAfter.map((item) => [`${item.book_id}::${item.chapter_number}`, item]),
  );

  const targetMappingByBookId = new Map(
    mapping.map((item) => [item.target_book_id, Number(item.target_legacy_book_id)]),
  );
  const chapterMapBySourceChapterId = new Map();
  for (const pair of mapping) {
    const sourceForBook = sourceChaptersByBookId.get(pair.source_book_id) || [];
    for (const sourceChapter of sourceForBook) {
      const target = targetAfterChapterByKey.get(`${pair.target_book_id}::${sourceChapter.chapter_number}`);
      if (!target) continue;
      chapterMapBySourceChapterId.set(String(sourceChapter.id), {
        source_chapter_id: String(sourceChapter.id),
        source_book_id: pair.source_book_id,
        target_chapter_id: String(target.id),
        target_book_id: pair.target_book_id,
        target_legacy_book_id: targetMappingByBookId.get(pair.target_book_id) || null,
        chapter_number: Number(sourceChapter.chapter_number),
      });
    }
  }

  const sourceChapterIds = Array.from(chapterMapBySourceChapterId.keys());
  const sourceVerses = sourceChapterIds.length
    ? await fetchByInChunks(
        client,
        "bible_verses",
        "id,chapter_id,verse_number,text,pericope,book_id,chapter,content,type",
        "chapter_id",
        sourceChapterIds,
        1000,
      )
    : [];

  sourceVerses.sort((a, b) => {
    const chapterCompare = String(a.chapter_id).localeCompare(String(b.chapter_id));
    if (chapterCompare !== 0) return chapterCompare;
    return Number(a.verse_number || 0) - Number(b.verse_number || 0);
  });

  const versePayloadByKey = new Map();
  const expectedTargetVerseKey = new Set();
  let headingRowsFromReference = 0;
  let pericopeRowsFromReference = 0;
  let duplicateSourceVerseKeysRemoved = 0;

  for (const verse of sourceVerses) {
    const chapterMap = chapterMapBySourceChapterId.get(String(verse.chapter_id));
    if (!chapterMap) continue;
    const verseNumber = Number(verse.verse_number);
    if (!Number.isInteger(verseNumber) || verseNumber < 0) continue;

    const pericope = normalizeText(verse.pericope);
    if (pericope) pericopeRowsFromReference += 1;

    const isHeading = verseNumber === 0;
    let text = PLACEHOLDER_TEXT;
    let normalizedPericope = pericope || null;

    if (isHeading) {
      const headingText = normalizeText(verse.text) || pericope || "[MISSING_VERSE][AUTO][TB2] Judul perikop belum tersedia.";
      text = headingText;
      normalizedPericope = null;
      headingRowsFromReference += 1;
    }

    const targetVerseKey = `${chapterMap.target_chapter_id}::${verseNumber}`;
    expectedTargetVerseKey.add(targetVerseKey);

    const payload = {
      chapter_id: chapterMap.target_chapter_id,
      verse_number: verseNumber,
      text,
      pericope: normalizedPericope,
      book_id: Number.isFinite(chapterMap.target_legacy_book_id) ? chapterMap.target_legacy_book_id : null,
      chapter: chapterMap.chapter_number,
      content: text,
      type: isHeading ? "heading" : "text",
    };

    if (versePayloadByKey.has(targetVerseKey)) {
      duplicateSourceVerseKeysRemoved += 1;
      continue;
    }
    versePayloadByKey.set(targetVerseKey, payload);
  }

  const verseUpsertPayload = Array.from(versePayloadByKey.values());

  if (!args.dryRun && verseUpsertPayload.length > 0) {
    for (const chunk of chunkArray(verseUpsertPayload, 500)) {
      const { error } = await client
        .from("bible_verses")
        .upsert(chunk, { onConflict: "chapter_id,verse_number", ignoreDuplicates: false });
      if (error) throw new Error(`Gagal upsert verses target TB2: ${error.message}`);
    }
  }

  const targetChapterIds = Array.from(
    new Set(Array.from(chapterMapBySourceChapterId.values()).map((item) => item.target_chapter_id)),
  );
  const targetVersesCurrent = targetChapterIds.length
    ? await fetchByInChunks(client, "bible_verses", "id,chapter_id,verse_number", "chapter_id", targetChapterIds, 1000)
    : [];

  const versesToDelete = targetVersesCurrent.filter(
    (item) => !expectedTargetVerseKey.has(`${item.chapter_id}::${Number(item.verse_number)}`),
  );

  if (!args.dryRun && versesToDelete.length > 0) {
    for (const chunk of chunkArray(versesToDelete.map((item) => String(item.id)), 500)) {
      const { error } = await client.from("bible_verses").delete().in("id", chunk);
      if (error) throw new Error(`Gagal hapus stale target verses: ${error.message}`);
    }
  }

  const expectedTargetChapterKey = new Set(
    Array.from(chapterMapBySourceChapterId.values()).map(
      (item) => `${item.target_book_id}::${item.chapter_number}`,
    ),
  );
  const staleTargetChapters = targetChaptersAfter.filter(
    (item) => !expectedTargetChapterKey.has(`${item.book_id}::${item.chapter_number}`),
  );

  if (!args.dryRun && staleTargetChapters.length > 0) {
    for (const chunk of chunkArray(staleTargetChapters.map((item) => String(item.id)), 500)) {
      const { error } = await client.from("bible_chapters").delete().in("id", chunk);
      if (error) throw new Error(`Gagal hapus stale target chapters: ${error.message}`);
    }
  }

  const expectedTargetBookKey = new Set(sourceBooks.map((item) => normalizeBookKey(item.name)));
  const staleTargetBooks = targetBooksAfter.filter(
    (item) => !expectedTargetBookKey.has(normalizeBookKey(item.name)),
  );

  if (!args.dryRun && !args.keepExtraBooks && staleTargetBooks.length > 0) {
    for (const chunk of chunkArray(staleTargetBooks.map((item) => String(item.id)), 200)) {
      const { error } = await client
        .from("bible_books")
        .delete()
        .eq("language_code", TARGET_LANG)
        .eq("version_code", TARGET_VERSION)
        .in("id", chunk);
      if (error) throw new Error(`Gagal hapus stale target books: ${error.message}`);
    }
  }

  const finalBooks = await fetchAll(
    client,
    "bible_books",
    "id,name,grouping,order_index",
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

  let finalPlaceholderVerses = 0;
  for (const verse of finalVerses) {
    if (String(verse.text || "").startsWith("[MISSING_VERSE][AUTO]")) {
      finalPlaceholderVerses += 1;
    }
  }

  const report = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    dry_run: args.dryRun,
    source_workspace: `${SOURCE_LANG}/${SOURCE_VERSION}`,
    target_workspace: `${TARGET_LANG}/${TARGET_VERSION}`,
    keep_extra_books: args.keepExtraBooks,
    placeholder_text: PLACEHOLDER_TEXT,
    summary: {
      source_books: sourceBooks.length,
      target_books_before: targetBooks.length,
      target_books_created: bookCreates.length,
      target_books_updated: bookUpdates.length,
      target_books_stale: staleTargetBooks.length,
      source_chapters: sourceChapters.length,
      target_chapters_before: targetChapters.length,
      target_chapters_created: chapterCreates.length,
      target_chapters_stale: staleTargetChapters.length,
      source_verses: sourceVerses.length,
      target_verses_upserted: verseUpsertPayload.length,
      duplicate_source_verse_keys_removed: duplicateSourceVerseKeysRemoved,
      target_verses_stale: versesToDelete.length,
      heading_rows_from_reference: headingRowsFromReference,
      pericope_rows_from_reference: pericopeRowsFromReference,
      final_target_books: finalBooks.length,
      final_target_chapters: finalChapters.length,
      final_target_verses: finalVerses.length,
      final_target_placeholders: finalPlaceholderVerses,
    },
    samples: {
      mapping_books: mapping.slice(0, 30),
      stale_books: staleTargetBooks.slice(0, 30),
      stale_chapters: staleTargetChapters.slice(0, 30),
      stale_verses: versesToDelete.slice(0, 30),
    },
  };

  safeJsonWrite(args.report || DEFAULT_REPORT, report);

  console.log("TB2 reference scaffold sync report summary:");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report saved to: ${args.report || DEFAULT_REPORT}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
