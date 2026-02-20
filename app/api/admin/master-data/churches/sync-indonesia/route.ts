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
  diocese?: SparqlBindingValue;
  dioceseLabel?: SparqlBindingValue;
  coord?: SparqlBindingValue;
};

type SourceChurch = {
  sourceId: string;
  name: string;
  dioceseName: string;
  latitude: number | null;
  longitude: number | null;
};

type ExistingChurch = {
  id: string;
  name: string | null;
  diocese_id: string | null;
};

type ExistingDiocese = {
  id: string;
  name: string | null;
  country_id: string | null;
};

const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql";
const MIN_EXPECTED_CHURCHES = 120;
const INSERT_CHUNK_SIZE = 100;

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

function normalizeDioceseName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeDioceseName(value: unknown): string {
  let normalized = normalizeDioceseName(value);
  normalized = normalized.replace(/^keuskupan sufragan\s+/, "keuskupan ");
  normalized = normalized.replace(/^roman catholic archdiocese of\s+/, "keuskupan agung ");
  normalized = normalized.replace(/^archdiocese of\s+/, "keuskupan agung ");
  normalized = normalized.replace(/^roman catholic diocese of\s+/, "keuskupan ");
  normalized = normalized.replace(/^diocese of\s+/, "keuskupan ");

  if (normalized === "keuskupan agats-asmat") normalized = "keuskupan agats";
  if (normalized === "keuskupan sorong-manokwari") normalized = "keuskupan manokwari-sorong";
  if (normalized === "keuskupan manokwari sorong") normalized = "keuskupan manokwari-sorong";

  return normalized;
}

function normalizeChurchName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeChurchName(value: unknown): string {
  let normalized = normalizeChurchName(value);
  normalized = normalized.replace(/^gereja\s+/, "");
  normalized = normalized.replace(/^paroki\s+/, "");
  normalized = normalized.replace(/^ko-katedral\s+/, "konkatedral ");
  normalized = normalized.replace(/^kon-katedral\s+/, "konkatedral ");
  return normalized;
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

function scoreChurchName(value: string): number {
  const text = value.toLowerCase();
  let score = value.length / 100;
  if (text.includes("katedral")) score += 3;
  if (text.startsWith("gereja")) score += 2;
  if (text.startsWith("paroki")) score += 1;
  return score;
}

async function fetchIndonesiaChurchesFromWikidata(): Promise<SourceChurch[]> {
  const query = `
    SELECT DISTINCT ?church ?churchLabel ?diocese ?dioceseLabel ?coord WHERE {
      ?diocese wdt:P17 wd:Q252;
               rdfs:label ?dioLbl.
      FILTER(LANG(?dioLbl)='id')
      FILTER(STRSTARTS(?dioLbl, 'Keuskupan') || ?dioLbl='Ordinariat Militer Indonesia')

      ?church wdt:P708 ?diocese;
              wdt:P31 ?instance.
      ?instance wdt:P279* wd:Q16970.

      OPTIONAL { ?church wdt:P625 ?coord. }

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

    const rows: SourceChurch[] = [];
    for (const row of bindings) {
      const rawName = sanitizeText(row.churchLabel?.value);
      const rawDiocese = sanitizeText(row.dioceseLabel?.value);
      if (!rawName || !rawDiocese) continue;
      if (!isChurchLikeName(rawName)) continue;

      const sourceId = sanitizeText(row.church?.value).split("/").pop() || "";
      const { latitude, longitude } = parseWktPoint(sanitizeText(row.coord?.value));

      rows.push({
        sourceId: sourceId || `${rawDiocese}::${rawName}`,
        name: rawName.replace(/\s+/g, " ").trim(),
        dioceseName: rawDiocese.replace(/\s+/g, " ").trim(),
        latitude,
        longitude,
      });
    }

    // 1) Dedup by source id
    const bySourceId = new Map<string, SourceChurch>();
    for (const row of rows) {
      const existing = bySourceId.get(row.sourceId);
      if (!existing) {
        bySourceId.set(row.sourceId, row);
        continue;
      }
      // prefer label with higher score
      if (scoreChurchName(row.name) > scoreChurchName(existing.name)) {
        bySourceId.set(row.sourceId, row);
      }
    }

    const deduped = Array.from(bySourceId.values());
    if (deduped.length < MIN_EXPECTED_CHURCHES) {
      throw new Error(
        `Data gereja/paroki yang diparsing terlalu sedikit (${deduped.length}).`,
      );
    }

    return deduped.sort((a, b) => {
      const byDiocese = a.dioceseName.localeCompare(b.dioceseName, "id", {
        sensitivity: "base",
      });
      if (byDiocese !== 0) return byDiocese;
      return a.name.localeCompare(b.name, "id", { sensitivity: "base" });
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

  let sourceRows: SourceChurch[];
  try {
    sourceRows = await fetchIndonesiaChurchesFromWikidata();
  } catch (error: unknown) {
    return json(
      {
        error: "RemoteFetchFailed",
        message: `Gagal mengambil referensi gereja/paroki Indonesia: ${getErrorMessage(error)}`,
      },
      { status: 502 },
    );
  }

  const { data: indonesiaByIso, error: countryIsoError } = await adminClient
    .from("countries")
    .select("id, name, iso_code")
    .eq("iso_code", "ID")
    .maybeSingle();
  if (countryIsoError) {
    if (isPermissionDenied(countryIsoError)) {
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
        message: getErrorMessage(countryIsoError) || "Gagal membaca tabel countries.",
      },
      { status: 500 },
    );
  }

  const indonesiaCountryId = sanitizeText((indonesiaByIso as { id?: unknown } | null)?.id);
  if (!indonesiaCountryId) {
    return json(
      {
        error: "CountryMissing",
        message:
          "Negara Indonesia belum ada di master data. Sinkronkan negara dunia terlebih dahulu.",
      },
      { status: 400 },
    );
  }

  const { data: dioceseRows, error: dioceseError } = await adminClient
    .from("dioceses")
    .select("id, name, country_id")
    .eq("country_id", indonesiaCountryId);
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

  const dioceses = (dioceseRows || []) as ExistingDiocese[];
  const dioceseByCanonical = new Map<string, ExistingDiocese[]>();
  for (const row of dioceses) {
    const key = canonicalizeDioceseName(row.name);
    if (!key) continue;
    const list = dioceseByCanonical.get(key) || [];
    list.push(row);
    dioceseByCanonical.set(key, list);
  }

  const unresolvedDioceseNames = new Set<string>();
  const targetByKey = new Map<
    string,
    {
      name: string;
      dioceseId: string;
      latitude: number | null;
      longitude: number | null;
    }
  >();

  for (const source of sourceRows) {
    const dioceseKey = canonicalizeDioceseName(source.dioceseName);
    const dioceseCandidates = dioceseByCanonical.get(dioceseKey) || [];
    if (dioceseCandidates.length === 0) {
      unresolvedDioceseNames.add(source.dioceseName);
      continue;
    }
    const dioceseId = sanitizeText(dioceseCandidates[0].id);
    if (!dioceseId) continue;

    const churchKey = `${dioceseId}::${canonicalizeChurchName(source.name)}`;
    const existing = targetByKey.get(churchKey);
    if (!existing) {
      targetByKey.set(churchKey, {
        name: source.name,
        dioceseId,
        latitude: source.latitude,
        longitude: source.longitude,
      });
      continue;
    }

    if (scoreChurchName(source.name) > scoreChurchName(existing.name)) {
      targetByKey.set(churchKey, {
        name: source.name,
        dioceseId,
        latitude: source.latitude,
        longitude: source.longitude,
      });
    }
  }

  const targetRows = Array.from(targetByKey.values());
  if (targetRows.length === 0) {
    return json(
      {
        error: "NoTargetRows",
        message:
          "Tidak ada gereja/paroki yang bisa dipetakan ke keuskupan Indonesia di database.",
        unresolvedDioceses: Array.from(unresolvedDioceseNames).sort(),
      },
      { status: 400 },
    );
  }

  const targetDioceseIds = Array.from(new Set(targetRows.map((row) => row.dioceseId)));
  const { data: existingChurchRows, error: existingChurchError } = await adminClient
    .from("churches")
    .select("id, name, diocese_id")
    .in("diocese_id", targetDioceseIds);

  if (existingChurchError) {
    if (isPermissionDenied(existingChurchError)) {
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
        message: getErrorMessage(existingChurchError) || "Gagal membaca data gereja eksisting.",
      },
      { status: 500 },
    );
  }

  const existingChurches = (existingChurchRows || []) as ExistingChurch[];
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

  const chunks = splitIntoChunks(insertPayloads, INSERT_CHUNK_SIZE);
  for (const chunk of chunks) {
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
    action: "SYNC_INDONESIA_CHURCHES",
    tableName: "churches",
    recordId: null,
    oldData: null,
    newData: {
      source: "Wikidata SPARQL P708 diocese mapping",
      source_total: sourceRows.length,
      matched_target_total: targetRows.length,
      unresolved_diocese_count: unresolvedDioceseNames.size,
      inserted_count: insertPayloads.length,
      updated_count: updatePayloads.length,
      unchanged_count: unchangedCount,
    },
    request: req,
  });

  return json({
    success: true,
    message: `Sinkronisasi selesai. Insert: ${insertPayloads.length}, Update: ${updatePayloads.length}, Tidak berubah: ${unchangedCount}, Keuskupan tidak cocok: ${unresolvedDioceseNames.size}.`,
    source: "https://query.wikidata.org/",
    sourceTotal: sourceRows.length,
    matchedTargetTotal: targetRows.length,
    unresolvedDioceseCount: unresolvedDioceseNames.size,
    unresolvedDioceses: Array.from(unresolvedDioceseNames).sort(),
    insertedCount: insertPayloads.length,
    updatedCount: updatePayloads.length,
    unchangedCount,
  });
}
