import { NextRequest, NextResponse } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

function sanitizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function sanitizeNullableText(value: unknown): string | null {
  const text = sanitizeText(value);
  return text || null;
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
  const countryId = sanitizeText((body as { country_id?: unknown })?.country_id);

  if (id && !isUuid(id)) {
    return NextResponse.json(
      { error: "ValidationError", message: "id keuskupan tidak valid." },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json(
      { error: "ValidationError", message: "Nama keuskupan wajib diisi." },
      { status: 400 },
    );
  }
  if (!countryId || !isUuid(countryId)) {
    return NextResponse.json(
      { error: "ValidationError", message: "country_id wajib diisi dan harus UUID valid." },
      { status: 400 },
    );
  }

  const { data: country, error: countryError } = await adminClient
    .from("countries")
    .select("id, name")
    .eq("id", countryId)
    .maybeSingle();

  if (countryError) {
    const message = getErrorMessage(countryError);
    if (isPermissionDenied(countryError)) {
      return NextResponse.json(
        {
          error: "PermissionDenied",
          message:
            "Service role belum punya izin akses tabel countries. Jalankan SQL GRANT terlebih dahulu.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "DatabaseError", message: message || "Gagal validasi country_id." },
      { status: 500 },
    );
  }
  if (!country) {
    return NextResponse.json(
      { error: "ValidationError", message: "Negara tidak ditemukan." },
      { status: 400 },
    );
  }

  const payload = {
    name,
    country_id: countryId,
    address: sanitizeNullableText((body as { address?: unknown })?.address),
    google_maps_url: sanitizeNullableText((body as { google_maps_url?: unknown })?.google_maps_url),
    bishop_name: sanitizeNullableText((body as { bishop_name?: unknown })?.bishop_name),
    bishop_image_url: sanitizeNullableText((body as { bishop_image_url?: unknown })?.bishop_image_url),
  };

  if (id) {
    const { data: existing, error: findError } = await adminClient
      .from("dioceses")
      .select("id, name, country_id, address, google_maps_url, bishop_name, bishop_image_url")
      .eq("id", id)
      .maybeSingle();

    if (findError) {
      const message = getErrorMessage(findError);
      if (isPermissionDenied(findError)) {
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
        { error: "DatabaseError", message: message || "Gagal membaca data keuskupan." },
        { status: 500 },
      );
    }
    if (!existing) {
      return NextResponse.json(
        { error: "NotFound", message: "Keuskupan tidak ditemukan." },
        { status: 404 },
      );
    }

    const { data: updated, error: updateError } = await adminClient
      .from("dioceses")
      .update(payload)
      .eq("id", id)
      .select("id, name, country_id, address, google_maps_url, bishop_name, bishop_image_url")
      .maybeSingle();

    if (updateError) {
      const message = getErrorMessage(updateError);
      if (isPermissionDenied(updateError)) {
        return NextResponse.json(
          {
            error: "PermissionDenied",
            message:
              "Service role belum punya izin update tabel dioceses. Jalankan SQL GRANT terlebih dahulu.",
          },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { error: "DatabaseError", message: message || "Gagal memperbarui keuskupan." },
        { status: 500 },
      );
    }

    await logAdminAudit({
      supabaseAdminClient: adminClient,
      actorAuthUserId: user.id,
      action: "UPDATE_DIOCESE",
      tableName: "dioceses",
      recordId: id,
      oldData: existing as Record<string, unknown>,
      newData: (updated || payload) as Record<string, unknown>,
      request: req,
    });

    const res = NextResponse.json({
      success: true,
      message: "Keuskupan berhasil diperbarui.",
      data: updated,
    });
    setCookiesToResponse(res);
    return res;
  }

  const { data: inserted, error: insertError } = await adminClient
    .from("dioceses")
    .insert(payload)
    .select("id, name, country_id, address, google_maps_url, bishop_name, bishop_image_url")
    .maybeSingle();

  if (insertError) {
    const message = getErrorMessage(insertError);
    if (isPermissionDenied(insertError)) {
      return NextResponse.json(
        {
          error: "PermissionDenied",
          message:
            "Service role belum punya izin insert tabel dioceses. Jalankan SQL GRANT terlebih dahulu.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "DatabaseError", message: message || "Gagal menambah keuskupan." },
      { status: 500 },
    );
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "CREATE_DIOCESE",
    tableName: "dioceses",
    recordId: String((inserted as { id?: unknown })?.id || ""),
    oldData: null,
    newData: (inserted || payload) as Record<string, unknown>,
    request: req,
  });

  const res = NextResponse.json({
    success: true,
    message: "Keuskupan berhasil ditambahkan.",
    data: inserted,
  });
  setCookiesToResponse(res);
  return res;
}
