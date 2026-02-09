import { NextRequest, NextResponse } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

function normalizeIsoCode(value: unknown): string | null {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text) return null;
  if (!/^[A-Z]{2}$/.test(text)) return null;
  return text;
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
  const flagEmoji = sanitizeText((body as { flag_emoji?: unknown })?.flag_emoji);
  const isoCodeRaw = (body as { iso_code?: unknown })?.iso_code;

  if (id && !isUuid(id)) {
    return NextResponse.json(
      { error: "ValidationError", message: "id negara tidak valid." },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json(
      { error: "ValidationError", message: "Nama negara wajib diisi." },
      { status: 400 },
    );
  }

  const isoCode = normalizeIsoCode(isoCodeRaw);
  if (isoCodeRaw != null && String(isoCodeRaw).trim() && !isoCode) {
    return NextResponse.json(
      { error: "ValidationError", message: "ISO code harus 2 huruf (contoh: ID)." },
      { status: 400 },
    );
  }

  const payload = {
    name,
    iso_code: isoCode,
    flag_emoji: flagEmoji || null,
  };

  if (id) {
    const { data: existing, error: findError } = await adminClient
      .from("countries")
      .select("id, name, iso_code, flag_emoji")
      .eq("id", id)
      .maybeSingle();

    if (findError) {
      const message = getErrorMessage(findError);
      if (isPermissionDenied(findError)) {
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
        { error: "DatabaseError", message: message || "Gagal membaca data negara." },
        { status: 500 },
      );
    }
    if (!existing) {
      return NextResponse.json(
        { error: "NotFound", message: "Negara tidak ditemukan." },
        { status: 404 },
      );
    }

    const { data: updated, error: updateError } = await adminClient
      .from("countries")
      .update(payload)
      .eq("id", id)
      .select("id, name, iso_code, flag_emoji")
      .maybeSingle();

    if (updateError) {
      const message = getErrorMessage(updateError);
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
        { error: "DatabaseError", message: message || "Gagal memperbarui negara." },
        { status: 500 },
      );
    }

    await logAdminAudit({
      supabaseAdminClient: adminClient,
      actorAuthUserId: user.id,
      action: "UPDATE_COUNTRY",
      tableName: "countries",
      recordId: id,
      oldData: existing as Record<string, unknown>,
      newData: (updated || payload) as Record<string, unknown>,
      request: req,
    });

    const res = NextResponse.json({
      success: true,
      message: "Negara berhasil diperbarui.",
      data: updated,
    });
    setCookiesToResponse(res);
    return res;
  }

  const { data: inserted, error: insertError } = await adminClient
    .from("countries")
    .insert(payload)
    .select("id, name, iso_code, flag_emoji")
    .maybeSingle();

  if (insertError) {
    const message = getErrorMessage(insertError);
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
      { error: "DatabaseError", message: message || "Gagal menambah negara." },
      { status: 500 },
    );
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "CREATE_COUNTRY",
    tableName: "countries",
    recordId: String((inserted as { id?: unknown })?.id || ""),
    oldData: null,
    newData: (inserted || payload) as Record<string, unknown>,
    request: req,
  });

  const res = NextResponse.json({
    success: true,
    message: "Negara berhasil ditambahkan.",
    data: inserted,
  });
  setCookiesToResponse(res);
  return res;
}
