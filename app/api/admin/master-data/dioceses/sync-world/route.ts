import { NextRequest, NextResponse } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";

type SparqlBindingValue = {
  type?: string;
  value?: string;
};

type SparqlBinding = {
  diocese?: SparqlBindingValue;
  dioceseLabel?: SparqlBindingValue;
  country?: SparqlBindingValue;
  countryLabel?: SparqlBindingValue;
  countryIso2?: SparqlBindingValue;
};

type SourceDiocese = {
  sourceId: string;
  name: string;
  countryIsoCode: string;
  countryName: string;
};

type ExistingDioceseRow = {
  id: string;
  name: string | null;
  country_id: string | null;
};

type ExistingCountryRow = {
  id: string;
  name: string | null;
  iso_code: string | null;
};

type ResolvedSourceDiocese = {
  sourceId: string;
  name: string;
  countryId: string;
  countryIsoCode: string;
  countryName: string;
};

const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql";
const WIKIDATA_SOURCE_LABEL = "https://query.wikidata.org/";
const MIN_EXPECTED_DIOCESES = 1500;
const DB_FETCH_PAGE_SIZE = 1000;

function sanitizeText(value: unknown): string {
  return String(value ?? "").trim();
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

function normalizeCountryName(value: unknown): string {
  return normalizeText(value).replace(/\s*-\s*/g, "-");
}

function canonicalizeDioceseName(value: unknown): string {
  return normalizeText(value).replace(/\s*-\s*/g, "-");
}

function scoreDioceseName(value: string): number {
  const text = value.toLowerCase();
  let score = value.length / 100;
  if (text.includes("agung") || text.includes("archdiocese")) score += 1;
  if (text.includes("ordinariat") || text.includes("ordinariate")) score += 0.5;
  if (text.includes("apostolic")) score += 0.2;
  return score;
}

function splitIntoChunks<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
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

async function fetchWorldDiocesesFromWikidata(): Promise<SourceDiocese[]> {
  const query = `
    SELECT DISTINCT ?diocese ?dioceseLabel ?country ?countryLabel ?countryIso2 WHERE {
      VALUES ?instance {
        wd:Q3146899
        wd:Q105390172
        wd:Q2072238
        wd:Q1531518
        wd:Q620225
        wd:Q384003
      }

      ?diocese wdt:P31 ?instance;
               wdt:P17 ?country.

      FILTER NOT EXISTS { ?diocese wdt:P576 ?endDate. }

      OPTIONAL {
        ?country wdt:P297 ?isoValue.
        FILTER(STRLEN(?isoValue) = 2)
        BIND(UCASE(?isoValue) AS ?countryIso2)
      }

      SERVICE wikibase:label { bd:serviceParam wikibase:language "id,en". }
    }
    ORDER BY ?countryLabel ?dioceseLabel
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

    const bySourceId = new Map<string, SourceDiocese>();
    for (const row of bindings) {
      const name = sanitizeText(row.dioceseLabel?.value).replace(/\s+/g, " ");
      const countryIsoCode = sanitizeText(row.countryIso2?.value).toUpperCase();
      const countryName = sanitizeText(row.countryLabel?.value).replace(/\s+/g, " ");
      const sourceId = sanitizeText(row.diocese?.value).split("/").pop() || "";

      if (!name || !countryName) continue;
      const finalSourceId = sourceId || `${countryIsoCode || "NOISO"}::${countryName}::${name}`;

      const sourceRow: SourceDiocese = {
        sourceId: finalSourceId,
        name,
        countryIsoCode,
        countryName,
      };

      const existing = bySourceId.get(finalSourceId);
      if (!existing) {
        bySourceId.set(finalSourceId, sourceRow);
        continue;
      }

      if (scoreDioceseName(sourceRow.name) > scoreDioceseName(existing.name)) {
        bySourceId.set(finalSourceId, sourceRow);
      }
    }

    const rows = Array.from(bySourceId.values());
    if (rows.length < MIN_EXPECTED_DIOCESES) {
      throw new Error(`Data keuskupan dunia terlalu sedikit (${rows.length}).`);
    }

    return rows.sort((a, b) => {
      const byCountry = a.countryIsoCode.localeCompare(b.countryIsoCode, "en", {
        sensitivity: "base",
      });
      if (byCountry !== 0) return byCountry;
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    });
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

  let sourceRows: SourceDiocese[];
  try {
    sourceRows = await fetchWorldDiocesesFromWikidata();
  } catch (error: unknown) {
    return json(
      {
        error: "RemoteFetchFailed",
        message: `Gagal mengambil referensi keuskupan dunia: ${getErrorMessage(error)}`,
      },
      { status: 502 },
    );
  }

  const countries: ExistingCountryRow[] = [];
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

    const rows = (data || []) as ExistingCountryRow[];
    countries.push(...rows);
    if (rows.length < DB_FETCH_PAGE_SIZE) break;
  }

  const countryByIso = new Map<string, ExistingCountryRow[]>();
  const countryByName = new Map<string, ExistingCountryRow[]>();
  for (const country of countries) {
    const isoKey = sanitizeText(country.iso_code).toUpperCase();
    if (isoKey) {
      const list = countryByIso.get(isoKey) || [];
      list.push(country);
      countryByIso.set(isoKey, list);
    }

    const nameKey = normalizeCountryName(country.name);
    if (nameKey) {
      const list = countryByName.get(nameKey) || [];
      list.push(country);
      countryByName.set(nameKey, list);
    }
  }

  const resolvedRows: ResolvedSourceDiocese[] = [];
  const unresolvedCountrySamples = new Set<string>();
  let unresolvedCountryCount = 0;

  for (const source of sourceRows) {
    let resolvedCountry: ExistingCountryRow | null = null;

    if (source.countryIsoCode) {
      const isoMatches = countryByIso.get(source.countryIsoCode) || [];
      if (isoMatches.length === 1) {
        resolvedCountry = isoMatches[0];
      }
    }

    if (!resolvedCountry) {
      const nameKey = normalizeCountryName(source.countryName);
      const nameMatches = countryByName.get(nameKey) || [];
      if (nameMatches.length === 1) {
        resolvedCountry = nameMatches[0];
      }
    }

    if (!resolvedCountry) {
      unresolvedCountryCount += 1;
      if (unresolvedCountrySamples.size < 10) {
        unresolvedCountrySamples.add(
          `${source.countryName}${source.countryIsoCode ? ` (${source.countryIsoCode})` : ""}`,
        );
      }
      continue;
    }

    resolvedRows.push({
      sourceId: source.sourceId,
      name: source.name,
      countryId: resolvedCountry.id,
      countryIsoCode: source.countryIsoCode,
      countryName: source.countryName,
    });
  }

  if (resolvedRows.length === 0) {
    return json(
      {
        error: "NoMappedCountry",
        message:
          "Tidak ada keuskupan yang bisa dipetakan ke negara di master data. Sinkronkan negara dunia terlebih dahulu.",
      },
      { status: 400 },
    );
  }

  const dedupedByCountryAndName = new Map<string, ResolvedSourceDiocese>();
  for (const row of resolvedRows) {
    const key = `${row.countryId}::${canonicalizeDioceseName(row.name)}`;
    const existing = dedupedByCountryAndName.get(key);
    if (!existing) {
      dedupedByCountryAndName.set(key, row);
      continue;
    }
    if (scoreDioceseName(row.name) > scoreDioceseName(existing.name)) {
      dedupedByCountryAndName.set(key, row);
    }
  }

  const sourceResolvedRows = Array.from(dedupedByCountryAndName.values());

  const existingDioceses: ExistingDioceseRow[] = [];
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
          message: getErrorMessage(error) || "Gagal membaca data keuskupan eksisting.",
        },
        { status: 500 },
      );
    }
    const rows = (data || []) as ExistingDioceseRow[];
    existingDioceses.push(...rows);
    if (rows.length < DB_FETCH_PAGE_SIZE) break;
  }
  const existingByCountryAndName = new Map<string, ExistingDioceseRow[]>();
  for (const row of existingDioceses) {
    const countryId = sanitizeText(row.country_id);
    if (!countryId) continue;
    const keyName = canonicalizeDioceseName(row.name);
    if (!keyName) continue;
    const key = `${countryId}::${keyName}`;
    const list = existingByCountryAndName.get(key) || [];
    list.push(row);
    existingByCountryAndName.set(key, list);
  }

  const usedIds = new Set<string>();
  const updatePayloads: Array<{ id: string; name: string }> = [];
  const insertPayloads: Array<{ name: string; country_id: string }> = [];
  let unchangedCount = 0;

  for (const source of sourceResolvedRows) {
    const key = `${source.countryId}::${canonicalizeDioceseName(source.name)}`;
    const candidates = (existingByCountryAndName.get(key) || []).filter(
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
      country_id: source.countryId,
    });
  }

  for (const payload of updatePayloads) {
    const { error: updateError } = await adminClient
      .from("dioceses")
      .update({ name: payload.name })
      .eq("id", payload.id);
    if (updateError) {
      if (isPermissionDenied(updateError)) {
        return json(
          {
            error: "PermissionDenied",
            message:
              "Service role belum punya izin update tabel dioceses. Jalankan SQL GRANT terlebih dahulu.",
          },
          { status: 500 },
        );
      }
      return json(
        {
          error: "DatabaseError",
          message: `Gagal update keuskupan: ${getErrorMessage(updateError)}`,
        },
        { status: 500 },
      );
    }
  }

  for (const chunk of splitIntoChunks(insertPayloads, 200)) {
    if (chunk.length === 0) continue;
    const { error: insertError } = await adminClient.from("dioceses").insert(chunk);
    if (insertError) {
      if (isPermissionDenied(insertError)) {
        return json(
          {
            error: "PermissionDenied",
            message:
              "Service role belum punya izin insert tabel dioceses. Jalankan SQL GRANT terlebih dahulu.",
          },
          { status: 500 },
        );
      }
      return json(
        {
          error: "DatabaseError",
          message: `Gagal menambah keuskupan: ${getErrorMessage(insertError)}`,
        },
        { status: 500 },
      );
    }
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "SYNC_WORLD_DIOCESES",
    tableName: "dioceses",
    recordId: null,
    oldData: null,
    newData: {
      source: WIKIDATA_SOURCE_LABEL,
      source_total: sourceRows.length,
      resolved_total: sourceResolvedRows.length,
      unresolved_country_count: unresolvedCountryCount,
      unresolved_country_samples: Array.from(unresolvedCountrySamples.values()),
      existing_before: existingDioceses.length,
      inserted_count: insertPayloads.length,
      updated_count: updatePayloads.length,
      unchanged_count: unchangedCount,
    },
    request: req,
  });

  return json({
    success: true,
    message: `Sinkronisasi keuskupan dunia selesai. Insert: ${insertPayloads.length}, Update: ${updatePayloads.length}, Tidak berubah: ${unchangedCount}, Dilewati (negara belum terpetakan): ${unresolvedCountryCount}.`,
    source: WIKIDATA_SOURCE_LABEL,
    sourceTotal: sourceRows.length,
    resolvedTotal: sourceResolvedRows.length,
    unresolvedCountryCount,
    unresolvedCountrySamples: Array.from(unresolvedCountrySamples.values()),
    insertedCount: insertPayloads.length,
    updatedCount: updatePayloads.length,
    unchangedCount,
  });
}
