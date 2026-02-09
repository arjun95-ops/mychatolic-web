import { NextRequest, NextResponse } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

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

function normalizeTime(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!TIME_24H_REGEX.test(trimmed)) return null;
  if (trimmed.length === 5) return `${trimmed}:00`;
  return trimmed;
}

function sanitizeText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
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
  const churchId = sanitizeText((body as { church_id?: unknown })?.church_id);
  const dayRaw = (body as { day_number?: unknown })?.day_number;
  const startTimeRaw = sanitizeText((body as { start_time?: unknown })?.start_time);
  const title = sanitizeText((body as { title?: unknown })?.title, "Misa");
  const language = sanitizeText(
    (body as { language?: unknown })?.language,
    "Bahasa Indonesia",
  );

  if (id && !isUuid(id)) {
    return NextResponse.json(
      { error: "ValidationError", message: "id jadwal tidak valid." },
      { status: 400 },
    );
  }
  if (!churchId || !isUuid(churchId)) {
    return NextResponse.json(
      { error: "ValidationError", message: "church_id wajib diisi dan harus UUID valid." },
      { status: 400 },
    );
  }

  const dayNumber = Number(dayRaw);
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 7) {
    return NextResponse.json(
      { error: "ValidationError", message: "day_number harus angka 1 sampai 7." },
      { status: 400 },
    );
  }

  const normalizedStartTime = normalizeTime(startTimeRaw);
  if (!normalizedStartTime) {
    return NextResponse.json(
      { error: "ValidationError", message: "start_time wajib format HH:MM atau HH:MM:SS (24 jam)." },
      { status: 400 },
    );
  }

  const { data: churchRow, error: churchError } = await adminClient
    .from("churches")
    .select("id, name")
    .eq("id", churchId)
    .maybeSingle();

  if (churchError) {
    const message = getErrorMessage(churchError);
    if (isPermissionDenied(churchError)) {
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
      { error: "DatabaseError", message: message || "Gagal validasi church_id." },
      { status: 500 },
    );
  }
  if (!churchRow) {
    return NextResponse.json(
      { error: "ValidationError", message: "Paroki tidak ditemukan." },
      { status: 400 },
    );
  }

  const payload = {
    church_id: churchId,
    day_number: dayNumber,
    start_time: normalizedStartTime,
    title,
    language,
  };

  if (id) {
    const { data: existing, error: findError } = await adminClient
      .from("mass_schedules")
      .select("id, church_id, day_number, start_time, title, language")
      .eq("id", id)
      .maybeSingle();

    if (findError) {
      const message = getErrorMessage(findError);
      if (isPermissionDenied(findError)) {
        return NextResponse.json(
          {
            error: "PermissionDenied",
            message:
              "Service role belum punya izin akses tabel mass_schedules. Jalankan SQL GRANT terlebih dahulu.",
          },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { error: "DatabaseError", message: message || "Gagal membaca data jadwal." },
        { status: 500 },
      );
    }

    if (!existing) {
      return NextResponse.json(
        { error: "NotFound", message: "Jadwal tidak ditemukan." },
        { status: 404 },
      );
    }

    const { data: updated, error: updateError } = await adminClient
      .from("mass_schedules")
      .update(payload)
      .eq("id", id)
      .select("id, church_id, day_number, start_time, title, language")
      .maybeSingle();

    if (updateError) {
      const message = getErrorMessage(updateError);
      if (isPermissionDenied(updateError)) {
        return NextResponse.json(
          {
            error: "PermissionDenied",
            message:
              "Service role belum punya izin update tabel mass_schedules. Jalankan SQL GRANT terlebih dahulu.",
          },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { error: "DatabaseError", message: message || "Gagal memperbarui jadwal." },
        { status: 500 },
      );
    }

    if (!updated) {
      return NextResponse.json(
        { error: "NotFound", message: "Jadwal tidak ditemukan saat diperbarui." },
        { status: 404 },
      );
    }

    await logAdminAudit({
      supabaseAdminClient: adminClient,
      actorAuthUserId: user.id,
      action: "UPDATE_MASS_SCHEDULE",
      tableName: "mass_schedules",
      recordId: id,
      oldData: existing as Record<string, unknown>,
      newData: updated as Record<string, unknown>,
      request: req,
    });

    const res = NextResponse.json({
      success: true,
      message: "Jadwal berhasil diperbarui.",
      data: updated,
    });
    setCookiesToResponse(res);
    return res;
  }

  const { data: inserted, error: insertError } = await adminClient
    .from("mass_schedules")
    .insert(payload)
    .select("id, church_id, day_number, start_time, title, language")
    .maybeSingle();

  if (insertError) {
    const message = getErrorMessage(insertError);
    if (isPermissionDenied(insertError)) {
      return NextResponse.json(
        {
          error: "PermissionDenied",
          message:
            "Service role belum punya izin insert tabel mass_schedules. Jalankan SQL GRANT terlebih dahulu.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "DatabaseError", message: message || "Gagal menambah jadwal." },
      { status: 500 },
    );
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "CREATE_MASS_SCHEDULE",
    tableName: "mass_schedules",
    recordId: String((inserted as { id?: unknown })?.id || ""),
    oldData: null,
    newData: (inserted || payload) as Record<string, unknown>,
    request: req,
  });

  const res = NextResponse.json({
    success: true,
    message: "Jadwal berhasil ditambahkan.",
    data: inserted,
  });
  setCookiesToResponse(res);
  return res;
}
