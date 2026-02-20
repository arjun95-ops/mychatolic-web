import { NextRequest, NextResponse } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";

type ExistingDioceseRow = {
  id: string;
  name: string | null;
  country_id: string | null;
};

const WIKIPEDIA_API_URL =
  "https://id.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&titles=Daftar_keuskupan_di_Indonesia&format=json&origin=*";
const MIN_EXPECTED_DIOCESES = 35;

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
  normalized = normalized.replace(/^ordinariatus castrensis indonesia$/, "ordinariat militer indonesia");

  // Normalisasi nama lama/alternatif
  if (normalized === "keuskupan agats-asmat") normalized = "keuskupan agats";
  if (normalized === "keuskupan sorong-manokwari") normalized = "keuskupan manokwari-sorong";
  if (normalized === "keuskupan manokwari sorong") normalized = "keuskupan manokwari-sorong";

  return normalized;
}

function extractDiocesesFromWikitext(wikitext: string): string[] {
  if (!wikitext) return [];

  const daftarStart = wikitext.indexOf("== Daftar ==");
  const timelineStart = wikitext.indexOf("== Garis waktu ==", daftarStart + 1);
  const section =
    daftarStart >= 0
      ? wikitext.slice(daftarStart, timelineStart > daftarStart ? timelineStart : undefined)
      : wikitext;

  // Ambil nama dari link wiki resmi di bagian daftar.
  const regex =
    /\[\[((?:Keuskupan(?:\s+Agung)?\s+[^\]|]+)|Ordinariat Militer Indonesia)(?:\|[^\]]*)?\]\]/g;
  const names: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(section))) {
    const name = sanitizeText(match[1]).replace(/\s+/g, " ");
    if (name) names.push(name);
  }

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const key = canonicalizeDioceseName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(name);
  }

  return deduped;
}

async function fetchIndonesiaDiocesesFromWikipedia(): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(WIKIPEDIA_API_URL, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Wikipedia API error ${response.status}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const query = (payload.query as Record<string, unknown>) || {};
    const pages = (query.pages as Record<string, unknown>) || {};
    const pageKey = Object.keys(pages)[0];
    const page = pageKey ? (pages[pageKey] as Record<string, unknown>) : null;
    const revisions = Array.isArray(page?.revisions) ? page.revisions : [];
    const firstRevision = revisions[0] as Record<string, unknown> | undefined;
    const slots = (firstRevision?.slots as Record<string, unknown>) || {};
    const mainSlot = (slots.main as Record<string, unknown>) || {};
    const wikitext = sanitizeText(mainSlot["*"]);

    const dioceseNames = extractDiocesesFromWikitext(wikitext);
    if (dioceseNames.length < MIN_EXPECTED_DIOCESES) {
      throw new Error(
        `Data keuskupan yang diparsing terlalu sedikit (${dioceseNames.length}).`,
      );
    }
    return dioceseNames;
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

  let sourceDioceses: string[];
  try {
    sourceDioceses = await fetchIndonesiaDiocesesFromWikipedia();
  } catch (error: unknown) {
    return json(
      {
        error: "RemoteFetchFailed",
        message: `Gagal mengambil referensi keuskupan Indonesia: ${getErrorMessage(error)}`,
      },
      { status: 502 },
    );
  }

  const { data: indonesiaByIso, error: countryIsoError } = await adminClient
    .from("countries")
    .select("id, name, iso_code")
    .eq("iso_code", "ID")
    .maybeSingle();
  if (countryIsoError && !isPermissionDenied(countryIsoError)) {
    return json(
      {
        error: "DatabaseError",
        message: getErrorMessage(countryIsoError) || "Gagal membaca tabel countries.",
      },
      { status: 500 },
    );
  }
  if (countryIsoError && isPermissionDenied(countryIsoError)) {
    return json(
      {
        error: "PermissionDenied",
        message:
          "Service role belum punya izin akses tabel countries. Jalankan SQL GRANT terlebih dahulu.",
      },
      { status: 500 },
    );
  }

  let indonesiaCountryId = sanitizeText((indonesiaByIso as { id?: unknown } | null)?.id);
  if (!indonesiaCountryId) {
    const { data: indonesiaByName, error: countryNameError } = await adminClient
      .from("countries")
      .select("id, name, iso_code")
      .ilike("name", "Indonesia")
      .order("name")
      .limit(1)
      .maybeSingle();

    if (countryNameError) {
      if (isPermissionDenied(countryNameError)) {
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
          message: getErrorMessage(countryNameError) || "Gagal membaca tabel countries.",
        },
        { status: 500 },
      );
    }
    indonesiaCountryId = sanitizeText((indonesiaByName as { id?: unknown } | null)?.id);
  }

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

  const { data: existingRows, error: existingError } = await adminClient
    .from("dioceses")
    .select("id, name, country_id")
    .eq("country_id", indonesiaCountryId);

  if (existingError) {
    if (isPermissionDenied(existingError)) {
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
        message: getErrorMessage(existingError) || "Gagal membaca data keuskupan eksisting.",
      },
      { status: 500 },
    );
  }

  const existing = (existingRows || []) as ExistingDioceseRow[];
  const existingByCanonical = new Map<string, ExistingDioceseRow[]>();
  for (const row of existing) {
    const key = canonicalizeDioceseName(row.name);
    if (!key) continue;
    const list = existingByCanonical.get(key) || [];
    list.push(row);
    existingByCanonical.set(key, list);
  }

  let insertedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  const usedExistingIds = new Set<string>();

  for (const sourceName of sourceDioceses) {
    const key = canonicalizeDioceseName(sourceName);
    const candidates = (existingByCanonical.get(key) || []).filter(
      (row) => !usedExistingIds.has(row.id),
    );
    const matched = candidates.length > 0 ? candidates[0] : null;

    if (matched) {
      usedExistingIds.add(matched.id);
      if (sanitizeText(matched.name) === sourceName) {
        unchangedCount += 1;
        continue;
      }

      const { error: updateError } = await adminClient
        .from("dioceses")
        .update({ name: sourceName })
        .eq("id", matched.id);
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
            message: `Gagal update ${sourceName}: ${getErrorMessage(updateError)}`,
          },
          { status: 500 },
        );
      }
      updatedCount += 1;
      continue;
    }

    const { error: insertError } = await adminClient.from("dioceses").insert({
      name: sourceName,
      country_id: indonesiaCountryId,
    });
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
          message: `Gagal menambah ${sourceName}: ${getErrorMessage(insertError)}`,
        },
        { status: 500 },
      );
    }
    insertedCount += 1;
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "SYNC_INDONESIA_DIOCESES",
    tableName: "dioceses",
    recordId: null,
    oldData: null,
    newData: {
      source: "id.wikipedia.org/wiki/Daftar_keuskupan_di_Indonesia",
      source_total: sourceDioceses.length,
      existing_before: existing.length,
      inserted_count: insertedCount,
      updated_count: updatedCount,
      unchanged_count: unchangedCount,
    },
    request: req,
  });

  return json({
    success: true,
    message: `Sinkronisasi selesai. Insert: ${insertedCount}, Update: ${updatedCount}, Tidak berubah: ${unchangedCount}.`,
    source: "https://id.wikipedia.org/wiki/Daftar_keuskupan_di_Indonesia",
    sourceTotal: sourceDioceses.length,
    insertedCount,
    updatedCount,
    unchangedCount,
  });
}
