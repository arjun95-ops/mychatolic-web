import { NextRequest, NextResponse } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";

type ExistingChurch = {
  id: string;
  name: string | null;
  diocese_id: string | null;
};

type DioceseRow = {
  id: string;
  name: string | null;
};

type SourceChurch = {
  name: string;
  location?: string;
};

type SparqlBindingValue = {
  type?: string;
  value?: string;
};

type SparqlBinding = {
  church?: SparqlBindingValue;
  churchLabel?: SparqlBindingValue;
  dioceseLabel?: SparqlBindingValue;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AGATS_SOURCE_URL = "https://keuskupanagats.or.id/paroki-keuskupan-agats/";
const WIKIPEDIA_API_URL = "https://id.wikipedia.org/w/api.php";
const WIKIPEDIA_SOURCE_BASE = "https://id.wikipedia.org/wiki/";
const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql";
const WIKIDATA_SOURCE_LABEL = "https://query.wikidata.org/";

function sanitizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

function getErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const shaped = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      error?: unknown;
      error_description?: unknown;
    };
    const candidates = [
      shaped.message,
      shaped.details,
      shaped.hint,
      shaped.error,
      shaped.error_description,
    ];
    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  try {
    const serialized = JSON.stringify(error);
    return serialized === "{}" ? "Unknown error" : serialized;
  } catch {
    return "Unknown error";
  }
}

function isPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  const message = getErrorMessage(error).toLowerCase();
  return code === "42501" || message.includes("permission denied");
}

function normalizeName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[^\p{L}\p{N}\s.-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeDioceseName(value: unknown): string {
  let normalized = normalizeName(value);
  normalized = normalized.replace(/^keuskupan sufragan\s+/, "keuskupan ");
  normalized = normalized.replace(
    /^roman catholic metropolitan archdiocese of\s+/,
    "keuskupan agung ",
  );
  normalized = normalized.replace(/^metropolitan archdiocese of\s+/, "keuskupan agung ");
  normalized = normalized.replace(/^roman catholic archdiocese of\s+/, "keuskupan agung ");
  normalized = normalized.replace(/^archdiocese of\s+/, "keuskupan agung ");
  normalized = normalized.replace(/^roman catholic diocese of\s+/, "keuskupan ");
  normalized = normalized.replace(/^diocese of\s+/, "keuskupan ");
  normalized = normalized.replace(/^ordinariatus castrensis indonesia$/, "ordinariat militer indonesia");

  if (normalized === "keuskupan agats-asmat") normalized = "keuskupan agats";
  if (normalized === "keuskupan sorong-manokwari") normalized = "keuskupan manokwari-sorong";
  if (normalized === "keuskupan manokwari sorong") normalized = "keuskupan manokwari-sorong";

  return normalized;
}

function canonicalizeChurchName(value: unknown): string {
  let normalized = normalizeName(value);
  normalized = normalized.replace(/^gereja\s+/, "");
  normalized = normalized.replace(/^paroki\s+/, "");
  normalized = normalized.replace(/^katedral\s+/, "");
  normalized = normalized.replace(/^cathedral of\s+/, "");
  normalized = normalized.replace(/^ko-katedral\s+/, "konkatedral ");
  normalized = normalized.replace(/^kon-katedral\s+/, "konkatedral ");
  return normalized;
}

function scoreChurchName(value: string): number {
  const text = value.toLowerCase();
  let score = value.length / 100;
  if (text.includes("katedral") || text.includes("cathedral")) score += 3;
  if (text.startsWith("gereja")) score += 2;
  if (text.startsWith("paroki")) score += 1;
  if (text.includes("(")) score += 0.2;
  return score;
}

function isChurchLikeName(value: string): boolean {
  const text = value.toLowerCase();
  return (
    text.includes("gereja") ||
    text.includes("paroki") ||
    text.includes("katedral") ||
    text.includes("konkatedral") ||
    text.includes("ko-katedral") ||
    text.includes("kon-katedral") ||
    text.includes("cathedral") ||
    text.includes("kapel") ||
    text.includes("chapel")
  );
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\p{L}/gu, (char) => char.toUpperCase())
    .replace(/\bSta\.?(?=\s|$)/gi, "Sta.")
    .replace(/\bSt\.?(?=\s|$)/gi, "St.")
    .replace(/St\.\.+/g, "St.")
    .replace(/Sta\.\.+/g, "Sta.")
    .trim();
}

function parseAgatsParishesFromHtml(html: string): SourceChurch[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\r/g, "");

  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const startIndex = lines.findIndex((line) =>
    line.toUpperCase().includes("PAROKI KEUSKUPAN AGATS"),
  );
  const scope = startIndex >= 0 ? lines.slice(startIndex, startIndex + 500) : lines;

  const rawEntries: SourceChurch[] = [];
  const lineRegex = /^([A-ZÀ-ÿ\s'.-]+)\s-\s(KATEDRAL|PAROKI|KUASI PAROKI)\s(.+)$/i;

  for (const line of scope) {
    const match = line.match(lineRegex);
    if (!match) continue;
    const locationRaw = sanitizeText(match[1]);
    const churchTypeRaw = sanitizeText(match[2]);
    const churchRaw = sanitizeText(match[3]).replace(/^"+|"+$/g, "").replace(/"+/g, "");
    if (!locationRaw || !churchRaw) continue;

    const location = toTitleCase(locationRaw);
    const churchType = toTitleCase(churchTypeRaw);
    const churchName = toTitleCase(churchRaw);
    const finalName = `${churchType} ${churchName} (${location})`;
    rawEntries.push({ name: finalName, location });
  }

  const deduped = new Map<string, SourceChurch>();
  for (const row of rawEntries) {
    const key = canonicalizeChurchName(row.name);
    if (!key || deduped.has(key)) continue;
    deduped.set(key, row);
  }
  return Array.from(deduped.values());
}

async function fetchAgatsParishes(): Promise<SourceChurch[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(AGATS_SOURCE_URL, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Source error ${response.status}`);
    }

    const html = await response.text();
    const rows = parseAgatsParishesFromHtml(html);
    if (rows.length < 10) {
      throw new Error(`Data paroki Agats terlalu sedikit (${rows.length}).`);
    }
    return rows;
  } finally {
    clearTimeout(timeout);
  }
}

function parseWikipediaPayloadToWikitext(payload: unknown): {
  missing: boolean;
  title: string;
  wikitext: string;
} {
  if (!payload || typeof payload !== "object") {
    return { missing: true, title: "", wikitext: "" };
  }

  const query = (payload as { query?: unknown }).query;
  if (!query || typeof query !== "object") {
    return { missing: true, title: "", wikitext: "" };
  }

  const pages = (query as { pages?: unknown }).pages;
  if (!pages || typeof pages !== "object") {
    return { missing: true, title: "", wikitext: "" };
  }

  const pageKey = Object.keys(pages as Record<string, unknown>)[0];
  if (!pageKey) return { missing: true, title: "", wikitext: "" };

  const page = (pages as Record<string, unknown>)[pageKey];
  if (!page || typeof page !== "object") {
    return { missing: true, title: "", wikitext: "" };
  }

  const typedPage = page as {
    title?: unknown;
    missing?: unknown;
    revisions?: unknown;
  };
  const title = sanitizeText(typedPage.title);
  const missing = typedPage.missing !== undefined;
  const revisions = Array.isArray(typedPage.revisions) ? typedPage.revisions : [];
  const firstRevision = (revisions[0] || {}) as {
    slots?: unknown;
  };
  const slots =
    firstRevision.slots && typeof firstRevision.slots === "object"
      ? (firstRevision.slots as Record<string, unknown>)
      : {};
  const mainSlot =
    slots.main && typeof slots.main === "object" ? (slots.main as Record<string, unknown>) : {};
  const wikitext = sanitizeText(mainSlot["*"]);

  return { missing, title, wikitext };
}

function splitSectionByHeading(wikitext: string, heading: string): string {
  const match = wikitext.match(new RegExp(`==\\s*${heading}\\s*==`, "i"));
  if (!match || typeof match.index !== "number") return wikitext;

  const start = match.index + match[0].length;
  const nextHeadingMatch = wikitext.slice(start).match(/\n==\s*[^=\n]+\s*==/);
  if (!nextHeadingMatch || typeof nextHeadingMatch.index !== "number") {
    return wikitext.slice(start);
  }
  return wikitext.slice(start, start + nextHeadingMatch.index);
}

function cleanWikiFragment(value: string): string {
  return value
    .replace(/'''?/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, " ")
    .replace(/<ref[^/>]*\/>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{\{[^{}]*\}\}/g, " ")
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[-:;,\s]+|[-:;,\s]+$/g, "")
    .trim();
}

function isParishLikeName(value: string): boolean {
  const text = value.toLowerCase();
  return (
    text.includes("paroki") ||
    text.includes("kuasi paroki") ||
    text.includes("katedral") ||
    text.includes("konkatedral") ||
    text.includes("ko-katedral") ||
    text.includes("kon-katedral") ||
    text.includes("cathedral")
  );
}

function isGenericParishLabel(value: string): boolean {
  const normalized = normalizeName(value);
  if (!normalized || normalized.length < 7) return true;
  return (
    normalized === "paroki" ||
    normalized === "katedral" ||
    normalized === "kuasi paroki" ||
    normalized === "konkatedral" ||
    normalized === "ko-katedral" ||
    normalized === "kon-katedral" ||
    normalized === "paroki katedral"
  );
}

function isBlockedWikipediaNamespace(title: string): boolean {
  return (
    /^berkas\s*:/i.test(title) ||
    /^file\s*:/i.test(title) ||
    /^image\s*:/i.test(title) ||
    /^kategori\s*:/i.test(title) ||
    /^category\s*:/i.test(title) ||
    /^template\s*:/i.test(title) ||
    /^templat\s*:/i.test(title) ||
    /^portal\s*:/i.test(title) ||
    /^wikt\s*:/i.test(title) ||
    /^wiktionary\s*:/i.test(title)
  );
}

function sanitizeWikipediaTitle(title: string): string {
  return sanitizeText(title).replace(/\s+/g, " ");
}

function buildWikipediaPageUrl(title: string): string {
  return `${WIKIPEDIA_SOURCE_BASE}${encodeURIComponent(sanitizeWikipediaTitle(title).replace(/\s+/g, "_"))}`;
}

function parseParishesFromWikipediaWikitext(wikitext: string): SourceChurch[] {
  const section = splitSectionByHeading(wikitext, "Daftar")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, " ")
    .replace(/<ref[^/>]*\/>/gi, " ");

  const picked = new Map<string, SourceChurch>();

  const addCandidate = (rawValue: string) => {
    const cleaned = cleanWikiFragment(rawValue);
    if (!cleaned) return;
    if (!isParishLikeName(cleaned)) return;
    if (isGenericParishLabel(cleaned)) return;

    const key = canonicalizeChurchName(cleaned);
    if (!key) return;

    const existing = picked.get(key);
    if (!existing) {
      picked.set(key, { name: cleaned });
      return;
    }
    if (scoreChurchName(cleaned) > scoreChurchName(existing.name)) {
      picked.set(key, { name: cleaned });
    }
  };

  const linkRegex = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;
  for (const match of section.matchAll(linkRegex)) {
    const targetRaw = sanitizeText(match[1]);
    const labelRaw = sanitizeText(match[2]);
    if (!targetRaw || isBlockedWikipediaNamespace(targetRaw)) continue;

    const target = cleanWikiFragment(targetRaw);
    const label = cleanWikiFragment(labelRaw || targetRaw);
    if (isParishLikeName(label)) {
      addCandidate(label);
      continue;
    }
    if (isParishLikeName(target)) {
      addCandidate(target);
    }
  }

  const linePatterns = [
    /(?:^|\n)\*\s*(Paroki[^\n<|]{3,}|Kuasi\s+Paroki[^\n<|]{3,}|Katedral[^\n<|]{3,}|Konkatedral[^\n<|]{3,}|Ko-Katedral[^\n<|]{3,}|Kon-Katedral[^\n<|]{3,})/gi,
    /(?:^|\n)\|\s*(Paroki[^\n|]{3,}|Kuasi\s+Paroki[^\n|]{3,}|Katedral[^\n|]{3,}|Konkatedral[^\n|]{3,}|Ko-Katedral[^\n|]{3,}|Kon-Katedral[^\n|]{3,})/gi,
  ];
  for (const pattern of linePatterns) {
    for (const match of section.matchAll(pattern)) {
      addCandidate(sanitizeText(match[1]));
    }
  }

  return Array.from(picked.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "id", { sensitivity: "base" }),
  );
}

function extractParishListTitleFromDioceseWikitext(wikitext: string): string {
  const match = wikitext.match(/\{\{\s*:?\s*(Daftar paroki di [^}|]+)(?:\|[^}]*)?\}\}/i);
  if (!match) return "";
  return sanitizeWikipediaTitle(match[1]);
}

async function fetchWikipediaWikitextByTitle(title: string): Promise<{
  title: string;
  missing: boolean;
  wikitext: string;
}> {
  const queryString = new URLSearchParams({
    action: "query",
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    titles: title,
    format: "json",
    origin: "*",
  });
  const url = `${WIKIPEDIA_API_URL}?${queryString.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent": "mychatolic-web/1.0 (contact: admin@local)",
      },
    });
    if (!response.ok) {
      throw new Error(`Wikipedia API error ${response.status}`);
    }
    const payload = (await response.json()) as unknown;
    return parseWikipediaPayloadToWikitext(payload);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWikipediaChurchesForDiocese(dioceseName: string): Promise<{
  rows: SourceChurch[];
  sourceTitle: string;
}> {
  const candidates = new Set<string>();
  const canonicalName = sanitizeWikipediaTitle(dioceseName);
  if (canonicalName) {
    candidates.add(`Daftar paroki di ${canonicalName}`);
    candidates.add(`Daftar paroki di ${canonicalName.replace(/-/g, "–")}`);
    candidates.add(`Daftar paroki di ${canonicalName.replace(/–/g, "-")}`);
  }

  for (const candidate of candidates) {
    const page = await fetchWikipediaWikitextByTitle(candidate);
    if (page.missing || !page.wikitext) continue;

    const rows = parseParishesFromWikipediaWikitext(page.wikitext);
    if (rows.length > 0) {
      return {
        rows,
        sourceTitle: sanitizeWikipediaTitle(page.title || candidate),
      };
    }
  }

  if (canonicalName) {
    const diocesePage = await fetchWikipediaWikitextByTitle(canonicalName);
    if (!diocesePage.missing && diocesePage.wikitext) {
      const transcludedTitle = extractParishListTitleFromDioceseWikitext(diocesePage.wikitext);
      if (transcludedTitle) {
        const listPage = await fetchWikipediaWikitextByTitle(transcludedTitle);
        if (!listPage.missing && listPage.wikitext) {
          const rows = parseParishesFromWikipediaWikitext(listPage.wikitext);
          if (rows.length > 0) {
            return {
              rows,
              sourceTitle: sanitizeWikipediaTitle(listPage.title || transcludedTitle),
            };
          }
        }
      }
    }
  }

  return { rows: [], sourceTitle: "" };
}

function mergeSourceRows(sourceRows: SourceChurch[][]): SourceChurch[] {
  const picked = new Map<string, SourceChurch>();

  for (const rows of sourceRows) {
    for (const row of rows) {
      const key = canonicalizeChurchName(row.name);
      if (!key) continue;

      const existing = picked.get(key);
      if (!existing) {
        picked.set(key, row);
        continue;
      }
      if (scoreChurchName(row.name) > scoreChurchName(existing.name)) {
        picked.set(key, row);
      }
    }
  }

  return Array.from(picked.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "id", { sensitivity: "base" }),
  );
}

async function fetchWikidataChurchesForDiocese(canonicalDioceseName: string): Promise<SourceChurch[]> {
  const query = `
    SELECT DISTINCT ?church ?churchLabel ?dioceseLabel WHERE {
      ?diocese wdt:P17 wd:Q252;
               rdfs:label ?dioLbl.
      FILTER(LANG(?dioLbl)='id')
      FILTER(STRSTARTS(?dioLbl, 'Keuskupan') || ?dioLbl='Ordinariat Militer Indonesia')

      ?church wdt:P708 ?diocese;
              wdt:P31 ?instance.
      ?instance wdt:P279* wd:Q16970.

      SERVICE wikibase:label { bd:serviceParam wikibase:language "id,en". }
    }
    ORDER BY ?dioceseLabel ?churchLabel
  `;

  const url = `${WIKIDATA_SPARQL_URL}?${new URLSearchParams({
    format: "json",
    query,
  }).toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/sparql-results+json",
        "user-agent": "mychatolic-web/1.0 (contact: admin@local)",
      },
    });

    if (!response.ok) {
      throw new Error(`Wikidata SPARQL error ${response.status}`);
    }

    const payload = (await response.json()) as {
      results?: { bindings?: SparqlBinding[] };
    };
    const bindings = Array.isArray(payload.results?.bindings)
      ? payload.results?.bindings || []
      : [];

    const picked = new Map<string, SourceChurch>();
    for (const row of bindings) {
      const rawName = sanitizeText(row.churchLabel?.value);
      const rawDiocese = sanitizeText(row.dioceseLabel?.value);
      if (!rawName || !rawDiocese) continue;
      if (!isChurchLikeName(rawName)) continue;

      const canonicalRowDiocese = canonicalizeDioceseName(rawDiocese);
      if (canonicalRowDiocese !== canonicalDioceseName) continue;

      const key = canonicalizeChurchName(rawName);
      if (!key) continue;

      const existing = picked.get(key);
      if (!existing) {
        picked.set(key, { name: rawName });
        continue;
      }

      if (scoreChurchName(rawName) > scoreChurchName(existing.name)) {
        picked.set(key, { name: rawName });
      }
    }

    return Array.from(picked.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "id", { sensitivity: "base" }),
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveSourceRows(
  canonicalDioceseName: string,
  dioceseName: string,
): Promise<{ rows: SourceChurch[]; source: string }> {
  const sources: string[] = [];
  const mergedSourceRows: SourceChurch[][] = [];
  const errors: string[] = [];

  if (canonicalDioceseName === "keuskupan agats") {
    try {
      const agatsRows = await fetchAgatsParishes();
      if (agatsRows.length > 0) {
        sources.push(AGATS_SOURCE_URL);
        mergedSourceRows.push(agatsRows);
      }
    } catch (error: unknown) {
      errors.push(`Agats source: ${getErrorMessage(error)}`);
    }
  }

  try {
    const wikipedia = await fetchWikipediaChurchesForDiocese(dioceseName);
    if (wikipedia.rows.length > 0) {
      sources.push(buildWikipediaPageUrl(wikipedia.sourceTitle || `Daftar paroki di ${dioceseName}`));
      mergedSourceRows.push(wikipedia.rows);
    }
  } catch (error: unknown) {
    errors.push(`Wikipedia source: ${getErrorMessage(error)}`);
  }

  try {
    const wikidataRows = await fetchWikidataChurchesForDiocese(canonicalDioceseName);
    if (wikidataRows.length > 0) {
      sources.push(WIKIDATA_SOURCE_LABEL);
      mergedSourceRows.push(wikidataRows);
    }
  } catch (error: unknown) {
    errors.push(`Wikidata source: ${getErrorMessage(error)}`);
  }

  const rows = mergeSourceRows(mergedSourceRows);
  if (rows.length === 0) {
    const errorMessage =
      errors.length > 0
        ? errors.join(" | ")
        : "Sumber publik belum menyediakan data paroki/gereja untuk keuskupan ini.";
    throw new Error(errorMessage);
  }

  return {
    rows,
    source: sources.join(" + "),
  };
}

export async function POST(req: NextRequest) {
  const ctx = await requireApprovedAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const {
    user,
    supabaseAdminClient: adminClient,
    setCookiesToResponse,
  } = ctx;

  const json = (payload: unknown, init?: { status?: number }) => {
    const res = NextResponse.json(payload, init);
    setCookiesToResponse(res);
    return res;
  };

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(
      { error: "BadRequest", message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const dioceseId = sanitizeText((body as { diocese_id?: unknown })?.diocese_id);
  if (!dioceseId || !isUuid(dioceseId)) {
    return json(
      {
        error: "ValidationError",
        message: "diocese_id wajib diisi dan harus UUID valid.",
      },
      { status: 400 },
    );
  }

  const { data: diocese, error: dioceseError } = await adminClient
    .from("dioceses")
    .select("id, name")
    .eq("id", dioceseId)
    .maybeSingle();

  if (dioceseError) {
    if (isPermissionDenied(dioceseError)) {
      return json(
        {
          error: "PermissionDenied",
          message:
            "Service role belum punya izin akses tabel dioceses. Jalankan SQL GRANT terlebih dahulu.",
        },
        { status: 500 },
      );
    }

    return json(
      {
        error: "DatabaseError",
        message: getErrorMessage(dioceseError) || "Gagal membaca data keuskupan.",
      },
      { status: 500 },
    );
  }

  if (!diocese) {
    return json(
      { error: "NotFound", message: "Keuskupan tidak ditemukan." },
      { status: 404 },
    );
  }

  const dioceseRow = diocese as DioceseRow;
  const canonicalDioceseName = canonicalizeDioceseName(dioceseRow.name);

  let sourceRows: SourceChurch[];
  let sourceUsed = "";
  try {
    const source = await resolveSourceRows(canonicalDioceseName, sanitizeText(dioceseRow.name));
    sourceRows = source.rows;
    sourceUsed = source.source;
  } catch (error: unknown) {
    return json(
      {
        error: "RemoteFetchFailed",
        message: `Gagal mengambil referensi paroki/gereja: ${getErrorMessage(error)}`,
      },
      { status: 502 },
    );
  }

  if (sourceRows.length === 0) {
    return json(
      {
        error: "NoSourceData",
        message:
          "Sumber publik belum menyediakan data paroki/gereja untuk keuskupan ini.",
      },
      { status: 404 },
    );
  }

  const { data: existingRows, error: existingError } = await adminClient
    .from("churches")
    .select("id, name, diocese_id")
    .eq("diocese_id", dioceseId);

  if (existingError) {
    if (isPermissionDenied(existingError)) {
      return json(
        {
          error: "PermissionDenied",
          message:
            "Service role belum punya izin akses tabel churches. Jalankan SQL GRANT terlebih dahulu.",
        },
        { status: 500 },
      );
    }

    return json(
      {
        error: "DatabaseError",
        message: getErrorMessage(existingError) || "Gagal membaca data paroki eksisting.",
      },
      { status: 500 },
    );
  }

  const existing = (existingRows || []) as ExistingChurch[];
  const existingByCanonical = new Map<string, ExistingChurch[]>();
  for (const row of existing) {
    const key = canonicalizeChurchName(row.name);
    if (!key) continue;
    const list = existingByCanonical.get(key) || [];
    list.push(row);
    existingByCanonical.set(key, list);
  }

  const usedIds = new Set<string>();
  const updatePayloads: Array<{ id: string; name: string }> = [];
  const insertPayloads: Array<Record<string, unknown>> = [];
  let unchangedCount = 0;

  for (const source of sourceRows) {
    const key = canonicalizeChurchName(source.name);
    const candidates = (existingByCanonical.get(key) || []).filter(
      (item) => !usedIds.has(item.id),
    );
    const matched = candidates.length > 0 ? candidates[0] : null;

    if (matched) {
      usedIds.add(matched.id);
      if (sanitizeText(matched.name) === source.name) {
        unchangedCount += 1;
      } else {
        updatePayloads.push({ id: matched.id, name: source.name });
      }
      continue;
    }

    insertPayloads.push({
      name: source.name,
      diocese_id: dioceseId,
      address: null,
      image_url: null,
    });
  }

  for (const payload of updatePayloads) {
    const { error: updateError } = await adminClient
      .from("churches")
      .update({ name: payload.name })
      .eq("id", payload.id);

    if (updateError) {
      if (isPermissionDenied(updateError)) {
        return json(
          {
            error: "PermissionDenied",
            message:
              "Service role belum punya izin update tabel churches. Jalankan SQL GRANT terlebih dahulu.",
          },
          { status: 500 },
        );
      }

      return json(
        {
          error: "DatabaseError",
          message: `Gagal update paroki: ${getErrorMessage(updateError)}`,
        },
        { status: 500 },
      );
    }
  }

  if (insertPayloads.length > 0) {
    const { error: insertError } = await adminClient.from("churches").insert(insertPayloads);

    if (insertError) {
      if (isPermissionDenied(insertError)) {
        return json(
          {
            error: "PermissionDenied",
            message:
              "Service role belum punya izin insert tabel churches. Jalankan SQL GRANT terlebih dahulu.",
          },
          { status: 500 },
        );
      }

      return json(
        {
          error: "DatabaseError",
          message: `Gagal insert paroki: ${getErrorMessage(insertError)}`,
        },
        { status: 500 },
      );
    }
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "SYNC_DIOCESE_CHURCHES",
    tableName: "churches",
    recordId: dioceseId,
    oldData: null,
    newData: {
      diocese_id: dioceseId,
      diocese_name: dioceseRow.name,
      source: sourceUsed,
      source_total: sourceRows.length,
      inserted_count: insertPayloads.length,
      updated_count: updatePayloads.length,
      unchanged_count: unchangedCount,
    },
    request: req,
  });

  return json({
    success: true,
    message: `Sinkronisasi ${dioceseRow.name} selesai. Insert: ${insertPayloads.length}, Update: ${updatePayloads.length}, Tidak berubah: ${unchangedCount}.`,
    source: sourceUsed,
    sourceTotal: sourceRows.length,
    insertedCount: insertPayloads.length,
    updatedCount: updatePayloads.length,
    unchangedCount,
  });
}
