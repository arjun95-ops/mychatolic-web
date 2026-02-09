import { NextRequest, NextResponse } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";
import { SupabaseClient } from "@supabase/supabase-js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BASE_SELECT =
  "id, name, address, diocese_id, image_url, google_maps_url, latitude, longitude";
const FALLBACK_SELECT = "id, name, address, diocese_id, image_url";

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

function sanitizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeLookupText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function getErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function isPermissionDenied(error: unknown): boolean {
  const code = getErrorCode(error);
  const text = getErrorMessage(error).toLowerCase();
  return code === "42501" || text.includes("permission denied");
}

function isMissingMapColumnError(error: unknown): boolean {
  const text = getErrorMessage(error).toLowerCase();
  return (
    text.includes("google_maps_url") ||
    text.includes("latitude") ||
    text.includes("longitude")
  ) && text.includes("does not exist");
}

function parseOptionalHttpUrl(label: string, value: unknown): { ok: true; value: string | null } | { ok: false; message: string } {
  const text = sanitizeText(value);
  if (!text) return { ok: true, value: null };

  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, message: `${label} harus URL http/https.` };
    }
    return { ok: true, value: text };
  } catch {
    return { ok: false, message: `${label} tidak valid.` };
  }
}

function parseOptionalNumber(
  label: string,
  value: unknown,
  min: number,
  max: number,
): { ok: true; value: number | null } | { ok: false; message: string } {
  const text = sanitizeText(value);
  if (!text) return { ok: true, value: null };

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    return { ok: false, message: `${label} harus berupa angka.` };
  }
  if (parsed < min || parsed > max) {
    return { ok: false, message: `${label} harus antara ${min} sampai ${max}.` };
  }

  return { ok: true, value: parsed };
}

function stripMapFields(payload: Record<string, unknown>): Record<string, unknown> {
  const next = { ...payload };
  delete next.google_maps_url;
  delete next.latitude;
  delete next.longitude;
  return next;
}

type ChurchRow = Record<string, unknown> | null;

async function findExistingChurch(
  adminClient: SupabaseClient,
  id: string,
): Promise<{ data: ChurchRow; error: unknown; mapColumnsAvailable: boolean }> {
  const baseRes = await adminClient.from("churches").select(BASE_SELECT).eq("id", id).maybeSingle();
  if (!baseRes.error) {
    return {
      data: (baseRes.data || null) as ChurchRow,
      error: null,
      mapColumnsAvailable: true,
    };
  }

  if (!isMissingMapColumnError(baseRes.error)) {
    return { data: null, error: baseRes.error, mapColumnsAvailable: true };
  }

  const fallbackRes = await adminClient
    .from("churches")
    .select(FALLBACK_SELECT)
    .eq("id", id)
    .maybeSingle();

  return {
    data: (fallbackRes.data || null) as ChurchRow,
    error: fallbackRes.error,
    mapColumnsAvailable: false,
  };
}

async function writeChurch(
  adminClient: SupabaseClient,
  payload: Record<string, unknown>,
  id?: string,
): Promise<{
  data: ChurchRow;
  error: unknown;
  mapColumnsAvailable: boolean;
}> {
  const runBase = async () => {
    if (id) {
      return adminClient
        .from("churches")
        .update(payload)
        .eq("id", id)
        .select(BASE_SELECT)
        .maybeSingle();
    }
    return adminClient
      .from("churches")
      .insert(payload)
      .select(BASE_SELECT)
      .maybeSingle();
  };

  const baseRes = await runBase();
  if (!baseRes.error) {
    return {
      data: (baseRes.data || null) as ChurchRow,
      error: null,
      mapColumnsAvailable: true,
    };
  }

  if (!isMissingMapColumnError(baseRes.error)) {
    return {
      data: null,
      error: baseRes.error,
      mapColumnsAvailable: true,
    };
  }

  const fallbackPayload = stripMapFields(payload);
  const runFallback = async () => {
    if (id) {
      return adminClient
        .from("churches")
        .update(fallbackPayload)
        .eq("id", id)
        .select(FALLBACK_SELECT)
        .maybeSingle();
    }
    return adminClient
      .from("churches")
      .insert(fallbackPayload)
      .select(FALLBACK_SELECT)
      .maybeSingle();
  };

  const fallbackRes = await runFallback();
  return {
    data: (fallbackRes.data || null) as ChurchRow,
    error: fallbackRes.error,
    mapColumnsAvailable: false,
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "BadRequest", message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const id = sanitizeText((body as { id?: unknown })?.id);
  const name = sanitizeText((body as { name?: unknown })?.name);
  const dioceseId = sanitizeText((body as { diocese_id?: unknown })?.diocese_id);
  const address = sanitizeText((body as { address?: unknown })?.address) || null;

  const imageUrlParsed = parseOptionalHttpUrl("image_url", (body as { image_url?: unknown })?.image_url);
  if (!imageUrlParsed.ok) {
    return NextResponse.json(
      { error: "ValidationError", message: imageUrlParsed.message },
      { status: 400 },
    );
  }

  const mapsUrlParsed = parseOptionalHttpUrl(
    "google_maps_url",
    (body as { google_maps_url?: unknown })?.google_maps_url,
  );
  if (!mapsUrlParsed.ok) {
    return NextResponse.json(
      { error: "ValidationError", message: mapsUrlParsed.message },
      { status: 400 },
    );
  }

  const latParsed = parseOptionalNumber(
    "latitude",
    (body as { latitude?: unknown })?.latitude,
    -90,
    90,
  );
  if (!latParsed.ok) {
    return NextResponse.json(
      { error: "ValidationError", message: latParsed.message },
      { status: 400 },
    );
  }

  const lngParsed = parseOptionalNumber(
    "longitude",
    (body as { longitude?: unknown })?.longitude,
    -180,
    180,
  );
  if (!lngParsed.ok) {
    return NextResponse.json(
      { error: "ValidationError", message: lngParsed.message },
      { status: 400 },
    );
  }

  if (id && !isUuid(id)) {
    return NextResponse.json(
      { error: "ValidationError", message: "id paroki tidak valid." },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json(
      { error: "ValidationError", message: "Nama paroki wajib diisi." },
      { status: 400 },
    );
  }
  if (!dioceseId || !isUuid(dioceseId)) {
    return NextResponse.json(
      { error: "ValidationError", message: "diocese_id wajib diisi dan harus UUID valid." },
      { status: 400 },
    );
  }

  const { data: diocese, error: dioceseError } = await adminClient
    .from("dioceses")
    .select("id, name")
    .eq("id", dioceseId)
    .maybeSingle();

  if (dioceseError) {
    const message = getErrorMessage(dioceseError);
    if (isPermissionDenied(dioceseError)) {
      return NextResponse.json(
        {
          error: "PermissionDenied",
          message:
            "Service role belum punya izin akses tabel dioceses. Jalankan SQL GRANT terlebih dahulu.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "DatabaseError", message: message || "Gagal validasi diocese_id." },
      { status: 500 },
    );
  }

  if (!diocese) {
    return NextResponse.json(
      { error: "ValidationError", message: "Keuskupan tidak ditemukan." },
      { status: 400 },
    );
  }

  const normalizedName = normalizeLookupText(name);
  const { data: duplicateRows, error: duplicateError } = await adminClient
    .from("churches")
    .select("id, name")
    .eq("diocese_id", dioceseId);

  if (duplicateError) {
    const message = getErrorMessage(duplicateError);
    if (isPermissionDenied(duplicateError)) {
      return NextResponse.json(
        {
          error: "PermissionDenied",
          message:
            "Service role belum punya izin akses tabel churches. Jalankan SQL GRANT terlebih dahulu.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "DatabaseError", message: message || "Gagal validasi duplikasi paroki." },
      { status: 500 },
    );
  }

  const isDuplicate = (duplicateRows || []).some((row) => {
    const rowId = sanitizeText((row as { id?: unknown }).id);
    if (id && rowId === id) return false;
    const rowName = sanitizeText((row as { name?: unknown }).name);
    return normalizeLookupText(rowName) === normalizedName;
  });

  if (isDuplicate) {
    return NextResponse.json(
      {
        error: "ConflictError",
        message: "Nama paroki sudah ada di keuskupan ini. Gunakan nama lain.",
      },
      { status: 409 },
    );
  }

  const payload: Record<string, unknown> = {
    name,
    address,
    diocese_id: dioceseId,
    image_url: imageUrlParsed.value,
    google_maps_url: mapsUrlParsed.value,
    latitude: latParsed.value,
    longitude: lngParsed.value,
  };

  if (id) {
    const existingRes = await findExistingChurch(adminClient, id);
    if (existingRes.error) {
      const message = getErrorMessage(existingRes.error);
      if (isPermissionDenied(existingRes.error)) {
        return NextResponse.json(
          {
            error: "PermissionDenied",
            message:
              "Service role belum punya izin akses tabel churches. Jalankan SQL GRANT terlebih dahulu.",
          },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { error: "DatabaseError", message: message || "Gagal membaca data paroki." },
        { status: 500 },
      );
    }

    if (!existingRes.data) {
      return NextResponse.json(
        { error: "NotFound", message: "Paroki tidak ditemukan." },
        { status: 404 },
      );
    }

    const updateRes = await writeChurch(adminClient, payload, id);
    if (updateRes.error) {
      const message = getErrorMessage(updateRes.error);
      if (isPermissionDenied(updateRes.error)) {
        return NextResponse.json(
          {
            error: "PermissionDenied",
            message:
              "Service role belum punya izin update tabel churches. Jalankan SQL GRANT terlebih dahulu.",
          },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { error: "DatabaseError", message: message || "Gagal memperbarui paroki." },
        { status: 500 },
      );
    }

    if (!updateRes.data) {
      return NextResponse.json(
        { error: "NotFound", message: "Paroki tidak ditemukan saat diperbarui." },
        { status: 404 },
      );
    }

    await logAdminAudit({
      supabaseAdminClient: adminClient,
      actorAuthUserId: user.id,
      action: "UPDATE_CHURCH",
      tableName: "churches",
      recordId: id,
      oldData: existingRes.data as Record<string, unknown>,
      newData: updateRes.data as Record<string, unknown>,
      request: req,
    });

    const res = NextResponse.json({
      success: true,
      message: "Paroki berhasil diperbarui.",
      map_columns_available: updateRes.mapColumnsAvailable,
      data: updateRes.data,
    });
    setCookiesToResponse(res);
    return res;
  }

  const insertRes = await writeChurch(adminClient, payload);
  if (insertRes.error) {
    const message = getErrorMessage(insertRes.error);
    if (isPermissionDenied(insertRes.error)) {
      return NextResponse.json(
        {
          error: "PermissionDenied",
          message:
            "Service role belum punya izin insert tabel churches. Jalankan SQL GRANT terlebih dahulu.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "DatabaseError", message: message || "Gagal menambah paroki." },
      { status: 500 },
    );
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "CREATE_CHURCH",
    tableName: "churches",
    recordId: String((insertRes.data as { id?: unknown })?.id || ""),
    oldData: null,
    newData: (insertRes.data || payload) as Record<string, unknown>,
    request: req,
  });

  const res = NextResponse.json({
    success: true,
    message: "Paroki berhasil ditambahkan.",
    map_columns_available: insertRes.mapColumnsAvailable,
    data: insertRes.data,
  });
  setCookiesToResponse(res);
  return res;
}
