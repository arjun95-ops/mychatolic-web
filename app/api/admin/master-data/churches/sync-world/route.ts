import { NextRequest, NextResponse } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";

type SparqlBindingValue = {
  type?: string;
  value?: string;
};

type SparqlBinding = {
  church?: SparqlBindingValue;
  churchLabel?: SparqlBindingValue;
  dioceseLabel?: SparqlBindingValue;
  countryIso2?: SparqlBindingValue;
  coord?: SparqlBindingValue;
};

type SourceChurch = {
  sourceId: string;
  name: string;
  dioceseName: string;
  countryIsoCode: string;
  latitude: number | null;
  longitude: number | null;
};

type ExistingCountry = {
  id: string;
  name: string | null;
  iso_code: string | null;
};

type ExistingDiocese = {
  id: string;
  name: string | null;
  country_id: string | null;
};

type ExistingChurch = {
  id: string;
  name: string | null;
  diocese_id: string | null;
};

type TargetChurch = {
  name: string;
  dioceseId: string;
};

const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql";
const WIKIDATA_SOURCE_LABEL = "https://query.wikidata.org/";
const DIOCESE_TYPE_VALUES =
  "wd:Q3146899 wd:Q105390172 wd:Q2072238 wd:Q1531518 wd:Q620225 wd:Q384003";
const DEFAULT_LIMIT = 5000;
const MAX_LIMIT = 5000;
const MIN_LIMIT = 500;
const INSERT_CHUNK_SIZE = 200;
const DIOCESE_FETCH_CHUNK_SIZE = 200;
const DB_FETCH_PAGE_SIZE = 1000;

function sanitizeText(value: unknown): string {
  return String(value ?? "").trim();
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

function parseInteger(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number"
      ? Math.trunc(value)
      : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  if (value < MIN_LIMIT) return MIN_LIMIT;
  if (value > MAX_LIMIT) return MAX_LIMIT;
  return Math.trunc(value);
}

function normalizeText(value: unknown): string {
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
  let normalized = normalizeText(value);
  normalized = normalized.replace(/^the\s+/, "");

  normalized = normalized.replace(
    /^roman catholic metropolitan archdiocese of\s+/,
    "",
  );
  normalized = normalized.replace(/^metropolitan archdiocese of\s+/, "");
  normalized = normalized.replace(/^roman catholic archdiocese of\s+/, "");
  normalized = normalized.replace(/^archdiocese of\s+/, "");
  normalized = normalized.replace(/^roman catholic diocese of\s+/, "");
  normalized = normalized.replace(/^diocese of\s+/, "");
  normalized = normalized.replace(/^apostolic vicariate of\s+/, "");
  normalized = normalized.replace(/^apostolic prefecture of\s+/, "");
  normalized = normalized.replace(/^military ordinariate of\s+/, "");
  normalized = normalized.replace(/^military ordinariate in\s+/, "");
  normalized = normalized.replace(/^ordinariate for\s+/, "");
  normalized = normalized.replace(/^ordinariat militer\s+/, "");
  normalized = normalized.replace(/^keuskupan agung\s+/, "");
  normalized = normalized.replace(/^keuskupan sufragan\s+/, "");
  normalized = normalized.replace(/^keuskupan\s+/, "");

  if (normalized === "agats-asmat") normalized = "agats";
  if (normalized === "sorong-manokwari") normalized = "manokwari-sorong";
  if (normalized === "manokwari sorong") normalized = "manokwari-sorong";

  return normalized.replace(/\s*-\s*/g, "-").trim();
}

function canonicalizeChurchName(value: unknown): string {
  let normalized = normalizeText(value);
  normalized = normalized.replace(/^gereja\s+/, "");
  normalized = normalized.replace(/^paroki\s+/, "");
  normalized = normalized.replace(/^church of\s+/, "");
  normalized = normalized.replace(/^cathedral of\s+/, "");
  normalized = normalized.replace(/^basilica of\s+/, "");
  normalized = normalized.replace(/^ko-katedral\s+/, "konkatedral ");
  normalized = normalized.replace(/^kon-katedral\s+/, "konkatedral ");
  return normalized;
}

function scoreChurchName(value: string): number {
  const text = value.toLowerCase();
  let score = value.length / 100;
  if (text.includes("cathedral") || text.includes("katedral")) score += 3;
  if (text.includes("church") || text.includes("gereja")) score += 2;
  if (text.includes("parish") || text.includes("paroki")) score += 1;
  return score;
}

function parseWktPoint(value: string): { latitude: number | null; longitude: number | null } {
  const text = sanitizeText(value);
  if (!text) return { latitude: null, longitude: null };
  const match = text.match(/^Point\(([-\d.]+)\s+([-\d.]+)\)$/i);
  if (!match) return { latitude: null, longitude: null };
  const lng = Number.parseFloat(match[1]);
  const lat = Number.parseFloat(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { latitude: null, longitude: null };
  }
  return { latitude: lat, longitude: lng };
}

function splitIntoChunks<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchWorldChurchesPage(limit: number, offset: number): Promise<SourceChurch[]> {
  const query = `
    SELECT DISTINCT ?church ?churchLabel ?dioceseLabel ?countryIso2 ?coord WHERE {
      VALUES ?dioceseType { ${DIOCESE_TYPE_VALUES} }

      ?diocese wdt:P31 ?dioceseType;
               wdt:P17 ?country.
      OPTIONAL {
        ?diocese rdfs:label ?dioceseLabelId.
        FILTER(LANG(?dioceseLabelId) = 'id')
      }
      OPTIONAL {
        ?diocese rdfs:label ?dioceseLabelEn.
        FILTER(LANG(?dioceseLabelEn) = 'en')
      }
      BIND(COALESCE(?dioceseLabelId, ?dioceseLabelEn) AS ?dioceseLabel)
      FILTER(BOUND(?dioceseLabel))

      OPTIONAL {
        ?country wdt:P297 ?isoValue.
        FILTER(STRLEN(?isoValue) = 2)
        BIND(UCASE(?isoValue) AS ?countryIso2)
      }

      ?church wdt:P708 ?diocese;
              wdt:P31 wd:Q16970;
              rdfs:label ?churchLabel.
      FILTER(LANG(?churchLabel) = 'en')
      FILTER NOT EXISTS { ?church wdt:P576 ?endDate. }

      OPTIONAL { ?church wdt:P625 ?coord. }
    }
    ORDER BY ?church
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const url = `${WIKIDATA_SPARQL_URL}?${new URLSearchParams({
    format: "json",
    query,
  }).toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 70000);
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

    const bySourceId = new Map<string, SourceChurch>();
    for (const row of bindings) {
      const sourceId = sanitizeText(row.church?.value).split("/").pop() || "";
      const name = sanitizeText(row.churchLabel?.value).replace(/\s+/g, " ");
      const dioceseName = sanitizeText(row.dioceseLabel?.value).replace(/\s+/g, " ");
      const countryIsoCode = sanitizeText(row.countryIso2?.value).toUpperCase();
      if (!sourceId || !name || !dioceseName) continue;

      const { latitude, longitude } = parseWktPoint(sanitizeText(row.coord?.value));
      const sourceRow: SourceChurch = {
        sourceId,
        name,
        dioceseName,
        countryIsoCode,
        latitude,
        longitude,
      };

      const existing = bySourceId.get(sourceId);
      if (!existing) {
        bySourceId.set(sourceId, sourceRow);
        continue;
      }
      if (scoreChurchName(sourceRow.name) > scoreChurchName(existing.name)) {
        bySourceId.set(sourceId, sourceRow);
      }
    }

    return Array.from(bySourceId.values());
  } finally {
    clearTimeout(timeout);
  }
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

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const requestedOffset = parseInteger((body as { offset?: unknown })?.offset, 0);
  const requestedLimit = parseInteger((body as { limit?: unknown })?.limit, DEFAULT_LIMIT);
  const offset = Math.max(0, requestedOffset);
  const limit = clampLimit(requestedLimit);

  let sourceRows: SourceChurch[];
  try {
    sourceRows = await fetchWorldChurchesPage(limit, offset);
  } catch (error: unknown) {
    return json(
      {
        error: "RemoteFetchFailed",
        message: `Gagal mengambil referensi gereja/paroki dunia: ${getErrorMessage(error)}`,
      },
      { status: 502 },
    );
  }

  const hasMore = sourceRows.length >= limit;
  const nextOffset = offset + sourceRows.length;

  if (sourceRows.length === 0) {
    await logAdminAudit({
      supabaseAdminClient: adminClient,
      actorAuthUserId: user.id,
      action: "SYNC_WORLD_CHURCHES_PAGE",
      tableName: "churches",
      recordId: null,
      oldData: null,
      newData: {
        source: WIKIDATA_SOURCE_LABEL,
        offset,
        limit,
        source_page_count: 0,
        has_more: false,
      },
      request: req,
    });

    return json({
      success: true,
      message: "Tidak ada data sumber lagi untuk halaman ini.",
      source: WIKIDATA_SOURCE_LABEL,
      offset,
      limit,
      sourcePageCount: 0,
      nextOffset,
      hasMore: false,
      matchedTargetTotal: 0,
      unresolvedCountryCount: 0,
      unresolvedCountrySamples: [],
      skippedNoCountryIsoCount: 0,
      unresolvedDioceseCount: 0,
      unresolvedDioceseSamples: [],
      insertedCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
    });
  }

  const countryRows: ExistingCountry[] = [];
  for (let from = 0; ; from += DB_FETCH_PAGE_SIZE) {
    const to = from + DB_FETCH_PAGE_SIZE - 1;
    const { data, error } = await adminClient
      .from("countries")
      .select("id, name, iso_code")
      .order("id")
      .range(from, to);
    if (error) {
      if (isPermissionDenied(error)) {
        return json(
          {
            error: "PermissionDenied",
            message:
              "Service role belum punya izin akses tabel countries. Jalankan SQL GRANT terlebih dahulu.",
          },
          { status: 500 },
        );
      }
      return json(
        {
          error: "DatabaseError",
          message: getErrorMessage(error) || "Gagal membaca data negara.",
        },
        { status: 500 },
      );
    }

    const rows = (data || []) as ExistingCountry[];
    countryRows.push(...rows);
    if (rows.length < DB_FETCH_PAGE_SIZE) break;
  }

  const countryByIso = new Map<string, ExistingCountry[]>();
  for (const row of countryRows) {
    const iso = sanitizeText(row.iso_code).toUpperCase();
    if (!iso) continue;
    const list = countryByIso.get(iso) || [];
    list.push(row);
    countryByIso.set(iso, list);
  }

  const dioceseRows: ExistingDiocese[] = [];
  for (let from = 0; ; from += DB_FETCH_PAGE_SIZE) {
    const to = from + DB_FETCH_PAGE_SIZE - 1;
    const { data, error } = await adminClient
      .from("dioceses")
      .select("id, name, country_id")
      .order("id")
      .range(from, to);
    if (error) {
      if (isPermissionDenied(error)) {
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
          message: getErrorMessage(error) || "Gagal membaca data keuskupan.",
        },
        { status: 500 },
      );
    }

    const rows = (data || []) as ExistingDiocese[];
    dioceseRows.push(...rows);
    if (rows.length < DB_FETCH_PAGE_SIZE) break;
  }

  const dioceseByKey = new Map<string, ExistingDiocese[]>();
  for (const row of dioceseRows) {
    const countryId = sanitizeText(row.country_id);
    if (!countryId) continue;
    const key = canonicalizeDioceseName(row.name);
    if (!key) continue;
    const mapKey = `${countryId}::${key}`;
    const list = dioceseByKey.get(mapKey) || [];
    list.push(row);
    dioceseByKey.set(mapKey, list);
  }

  const unresolvedCountrySamples = new Set<string>();
  const unresolvedDioceseSamples = new Set<string>();
  let unresolvedCountryCount = 0;
  let skippedNoCountryIsoCount = 0;
  let unresolvedDioceseCount = 0;

  const targetByKey = new Map<string, TargetChurch>();
  for (const source of sourceRows) {
    if (!source.countryIsoCode) {
      skippedNoCountryIsoCount += 1;
      continue;
    }

    const countryCandidates = countryByIso.get(source.countryIsoCode) || [];
    if (countryCandidates.length !== 1) {
      unresolvedCountryCount += 1;
      if (unresolvedCountrySamples.size < 10) unresolvedCountrySamples.add(source.countryIsoCode);
      continue;
    }

    const dioceseKey = canonicalizeDioceseName(source.dioceseName);
    const dioceseCandidates = dioceseByKey.get(
      `${sanitizeText(countryCandidates[0].id)}::${dioceseKey}`,
    ) || [];
    if (dioceseCandidates.length === 0) {
      unresolvedDioceseCount += 1;
      if (unresolvedDioceseSamples.size < 10) {
        unresolvedDioceseSamples.add(`${source.dioceseName} (${source.countryIsoCode})`);
      }
      continue;
    }

    const dioceseId = sanitizeText(dioceseCandidates[0].id);
    if (!dioceseId) continue;

    const canonicalChurchName = canonicalizeChurchName(source.name);
    if (!canonicalChurchName) continue;

    const churchKey = `${dioceseId}::${canonicalChurchName}`;
    const existing = targetByKey.get(churchKey);
    if (!existing) {
      targetByKey.set(churchKey, {
        name: source.name,
        dioceseId,
      });
    } else if (scoreChurchName(source.name) > scoreChurchName(existing.name)) {
      targetByKey.set(churchKey, {
        name: source.name,
        dioceseId,
      });
    }
  }

  const targetRows = Array.from(targetByKey.values());
  const targetDioceseIds = Array.from(new Set(targetRows.map((row) => row.dioceseId)));

  let existingChurches: ExistingChurch[] = [];
  for (const chunk of splitIntoChunks(targetDioceseIds, DIOCESE_FETCH_CHUNK_SIZE)) {
    if (chunk.length === 0) continue;
    for (let from = 0; ; from += DB_FETCH_PAGE_SIZE) {
      const to = from + DB_FETCH_PAGE_SIZE - 1;
      const { data: rows, error } = await adminClient
        .from("churches")
        .select("id, name, diocese_id")
        .in("diocese_id", chunk)
        .order("id")
        .range(from, to);
      if (error) {
        if (isPermissionDenied(error)) {
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
            message: getErrorMessage(error) || "Gagal membaca data gereja eksisting.",
          },
          { status: 500 },
        );
      }

      const currentRows = (rows || []) as ExistingChurch[];
      existingChurches = existingChurches.concat(currentRows);
      if (currentRows.length < DB_FETCH_PAGE_SIZE) break;
    }
  }

  const existingByKey = new Map<string, ExistingChurch[]>();
  for (const row of existingChurches) {
    const dioceseId = sanitizeText(row.diocese_id);
    if (!dioceseId) continue;
    const key = `${dioceseId}::${canonicalizeChurchName(row.name)}`;
    const list = existingByKey.get(key) || [];
    list.push(row);
    existingByKey.set(key, list);
  }

  const usedExistingIds = new Set<string>();
  const updatePayloads: Array<{ id: string; name: string }> = [];
  const insertPayloads: Array<Record<string, unknown>> = [];
  let unchangedCount = 0;

  for (const row of targetRows) {
    const key = `${row.dioceseId}::${canonicalizeChurchName(row.name)}`;
    const candidates = (existingByKey.get(key) || []).filter(
      (item) => !usedExistingIds.has(item.id),
    );
    const matched = candidates.length > 0 ? candidates[0] : null;

    if (matched) {
      usedExistingIds.add(matched.id);
      if (sanitizeText(matched.name) === row.name) {
        unchangedCount += 1;
      } else {
        updatePayloads.push({ id: matched.id, name: row.name });
      }
      continue;
    }

    insertPayloads.push({
      name: row.name,
      diocese_id: row.dioceseId,
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
          message: `Gagal update gereja/paroki: ${getErrorMessage(updateError)}`,
        },
        { status: 500 },
      );
    }
  }

  for (const chunk of splitIntoChunks(insertPayloads, INSERT_CHUNK_SIZE)) {
    if (chunk.length === 0) continue;
    const { error: insertError } = await adminClient.from("churches").insert(chunk);
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
          message: `Gagal insert gereja/paroki: ${getErrorMessage(insertError)}`,
        },
        { status: 500 },
      );
    }
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "SYNC_WORLD_CHURCHES_PAGE",
    tableName: "churches",
    recordId: null,
    oldData: null,
    newData: {
      source: WIKIDATA_SOURCE_LABEL,
      offset,
      limit,
      source_page_count: sourceRows.length,
      matched_target_total: targetRows.length,
      unresolved_country_count: unresolvedCountryCount,
      unresolved_country_samples: Array.from(unresolvedCountrySamples.values()),
      skipped_no_country_iso_count: skippedNoCountryIsoCount,
      unresolved_diocese_count: unresolvedDioceseCount,
      unresolved_diocese_samples: Array.from(unresolvedDioceseSamples.values()),
      inserted_count: insertPayloads.length,
      updated_count: updatePayloads.length,
      unchanged_count: unchangedCount,
      has_more: hasMore,
      next_offset: nextOffset,
    },
    request: req,
  });

  return json({
    success: true,
    message: `Halaman sinkron dunia selesai. Insert: ${insertPayloads.length}, Update: ${updatePayloads.length}, Tidak berubah: ${unchangedCount}.`,
    source: WIKIDATA_SOURCE_LABEL,
    offset,
    limit,
    sourcePageCount: sourceRows.length,
    nextOffset,
    hasMore,
    matchedTargetTotal: targetRows.length,
    unresolvedCountryCount,
    unresolvedCountrySamples: Array.from(unresolvedCountrySamples.values()),
    skippedNoCountryIsoCount,
    unresolvedDioceseCount,
    unresolvedDioceseSamples: Array.from(unresolvedDioceseSamples.values()),
    insertedCount: insertPayloads.length,
    updatedCount: updatePayloads.length,
    unchangedCount,
  });
}
