import { NextRequest, NextResponse } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";

type RemoteCountryRow = {
  cca2?: unknown;
  flag?: unknown;
  name?: {
    common?: unknown;
  };
};

type WorldCountry = {
  name: string;
  iso_code: string;
  flag_emoji: string;
};

type ExistingCountry = {
  id: string;
  name: string | null;
  iso_code: string | null;
  flag_emoji: string | null;
};

function normalizeName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

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
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
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

function isoToFlagEmoji(isoCode: string): string {
  if (!/^[A-Z]{2}$/.test(isoCode)) return "";
  const codePoints = [...isoCode].map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

async function fetchWorldCountries(): Promise<WorldCountry[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(
      "https://restcountries.com/v3.1/all?fields=cca2,name,flag",
      {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(`Remote API error ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      throw new Error("Invalid payload format from remote API.");
    }

    const mapByIso = new Map<string, WorldCountry>();
    for (const rowRaw of payload) {
      if (!rowRaw || typeof rowRaw !== "object") continue;
      const row = rowRaw as RemoteCountryRow;
      const isoCode = sanitizeText(row.cca2).toUpperCase();
      if (!/^[A-Z]{2}$/.test(isoCode)) continue;

      const name = sanitizeText(row.name?.common || isoCode);
      if (!name) continue;

      const flagFromApi = sanitizeText(row.flag);
      const country: WorldCountry = {
        name,
        iso_code: isoCode,
        flag_emoji: flagFromApi || isoToFlagEmoji(isoCode),
      };
      mapByIso.set(country.iso_code, country);
    }

    return Array.from(mapByIso.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
    );
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

  let worldCountries: WorldCountry[];
  try {
    worldCountries = await fetchWorldCountries();
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return NextResponse.json(
      {
        error: "RemoteFetchFailed",
        message: `Gagal mengambil referensi negara dunia: ${message}`,
      },
      { status: 502 },
    );
  }

  if (worldCountries.length === 0) {
    return NextResponse.json(
      {
        error: "RemoteDataEmpty",
        message: "Data referensi negara dari sumber eksternal kosong.",
      },
      { status: 502 },
    );
  }

  const { data: existingRows, error: existingError } = await adminClient
    .from("countries")
    .select("id, name, iso_code, flag_emoji");

  if (existingError) {
    if (isPermissionDenied(existingError)) {
      return NextResponse.json(
        {
          error: "PermissionDenied",
          message:
            "Service role belum punya izin baca tabel countries. Jalankan SQL GRANT terlebih dahulu.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      {
        error: "DatabaseError",
        message: getErrorMessage(existingError) || "Gagal membaca data negara eksisting.",
      },
      { status: 500 },
    );
  }

  const existingCountries = (existingRows || []) as ExistingCountry[];
  const existingByIso = new Map<string, ExistingCountry[]>();
  const existingByName = new Map<string, ExistingCountry[]>();

  for (const row of existingCountries) {
    const isoKey = sanitizeText(row.iso_code).toUpperCase();
    if (isoKey) {
      const current = existingByIso.get(isoKey) || [];
      current.push(row);
      existingByIso.set(isoKey, current);
    }
    const nameKey = normalizeName(row.name);
    if (nameKey) {
      const current = existingByName.get(nameKey) || [];
      current.push(row);
      existingByName.set(nameKey, current);
    }
  }

  let insertedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  const usedIds = new Set<string>();

  for (const country of worldCountries) {
    let matched: ExistingCountry | null = null;

    const isoMatches = (existingByIso.get(country.iso_code) || []).filter(
      (item) => !usedIds.has(item.id),
    );
    if (isoMatches.length > 0) {
      matched = isoMatches[0];
    } else {
      const normalizedName = normalizeName(country.name);
      const nameMatches = (existingByName.get(normalizedName) || []).filter(
        (item) => !usedIds.has(item.id),
      );
      if (nameMatches.length === 1) {
        matched = nameMatches[0];
      }
    }

    const payload = {
      name: country.name,
      iso_code: country.iso_code,
      flag_emoji: country.flag_emoji || null,
    };

    if (matched) {
      usedIds.add(matched.id);

      const existingName = sanitizeText(matched.name);
      const existingIso = sanitizeText(matched.iso_code).toUpperCase();
      const existingFlag = sanitizeText(matched.flag_emoji);
      const shouldUpdate =
        existingName !== payload.name ||
        existingIso !== payload.iso_code ||
        existingFlag !== sanitizeText(payload.flag_emoji);

      if (!shouldUpdate) {
        unchangedCount += 1;
        continue;
      }

      const { error: updateError } = await adminClient
        .from("countries")
        .update(payload)
        .eq("id", matched.id);
      if (updateError) {
        if (isPermissionDenied(updateError)) {
          return NextResponse.json(
            {
              error: "PermissionDenied",
              message:
                "Service role belum punya izin update tabel countries. Jalankan SQL GRANT terlebih dahulu.",
            },
            { status: 500 },
          );
        }
        return NextResponse.json(
          {
            error: "DatabaseError",
            message: `Gagal update negara ${country.name}: ${getErrorMessage(updateError)}`,
          },
          { status: 500 },
        );
      }

      updatedCount += 1;
      continue;
    }

    const { error: insertError } = await adminClient.from("countries").insert(payload);
    if (insertError) {
      if (isPermissionDenied(insertError)) {
        return NextResponse.json(
          {
            error: "PermissionDenied",
            message:
              "Service role belum punya izin insert tabel countries. Jalankan SQL GRANT terlebih dahulu.",
          },
          { status: 500 },
        );
      }
      return NextResponse.json(
        {
          error: "DatabaseError",
          message: `Gagal menambah negara ${country.name}: ${getErrorMessage(insertError)}`,
        },
        { status: 500 },
      );
    }

    insertedCount += 1;
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "SYNC_WORLD_COUNTRIES",
    tableName: "countries",
    recordId: null,
    oldData: null,
    newData: {
      total_reference: worldCountries.length,
      existing_before: existingCountries.length,
      inserted_count: insertedCount,
      updated_count: updatedCount,
      unchanged_count: unchangedCount,
    },
    request: req,
  });

  const message = `Sinkronisasi selesai. Insert: ${insertedCount}, Update: ${updatedCount}, Tidak berubah: ${unchangedCount}.`;
  const res = NextResponse.json({
    success: true,
    message,
    totalReference: worldCountries.length,
    insertedCount,
    updatedCount,
    unchangedCount,
  });
  setCookiesToResponse(res);
  return res;
}
