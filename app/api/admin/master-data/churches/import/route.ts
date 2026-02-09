import { NextRequest, NextResponse } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";

type ImportRow = {
  rowNumber: number;
  data: Record<string, unknown>;
};

function getErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function isMissingColumnError(error: unknown, column: string): boolean {
  const raw = getErrorMessage(error).toLowerCase();
  return raw.includes(column.toLowerCase()) && raw.includes("does not exist");
}

function isPermissionDeniedChurches(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  const message = getErrorMessage(error).toLowerCase();
  return code === "42501" && message.includes("permission denied for table churches");
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  const message = getErrorMessage(error).toLowerCase();
  return code === "23505" || message.includes("duplicate key");
}

function normalizeChurchName(value: unknown): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildChurchKey(dioceseId: string, name: unknown): string {
  return `${dioceseId}::${normalizeChurchName(name)}`;
}

function sanitizeRowData(input: Record<string, unknown>): Record<string, unknown> | null {
  const name = String(input.name || "").trim();
  const dioceseId = String(input.diocese_id || "").trim();
  if (!name || !dioceseId) return null;

  const payload: Record<string, unknown> = {
    name,
    diocese_id: dioceseId,
    address: String(input.address || "").trim() || null,
    image_url: String(input.image_url || "").trim() || null,
  };

  if ("google_maps_url" in input) {
    payload.google_maps_url = String(input.google_maps_url || "").trim() || null;
  }
  if ("latitude" in input) {
    const lat = input.latitude;
    payload.latitude = lat === "" || lat == null ? null : lat;
  }
  if ("longitude" in input) {
    const lng = input.longitude;
    payload.longitude = lng === "" || lng == null ? null : lng;
  }
  return payload;
}

function stripMapColumns(row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  delete copy.google_maps_url;
  delete copy.latitude;
  delete copy.longitude;
  return copy;
}

export async function POST(req: NextRequest) {
  const ctx = await requireApprovedAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { user, supabaseAdminClient: adminClient } = ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "BadRequest", message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const rowsInput = Array.isArray((body as { rows?: unknown })?.rows)
    ? ((body as { rows: unknown[] }).rows as unknown[])
    : [];

  if (rowsInput.length === 0) {
    return NextResponse.json(
      { error: "ValidationError", message: "rows wajib diisi minimal 1 item." },
      { status: 400 },
    );
  }

  const rows: ImportRow[] = [];
  for (const item of rowsInput) {
    if (!item || typeof item !== "object") continue;
    const rowNumberRaw = (item as { rowNumber?: unknown }).rowNumber;
    const dataRaw = (item as { data?: unknown }).data;
    if (typeof rowNumberRaw !== "number") continue;
    if (!dataRaw || typeof dataRaw !== "object" || Array.isArray(dataRaw)) continue;
    const sanitized = sanitizeRowData(dataRaw as Record<string, unknown>);
    if (!sanitized) continue;
    rows.push({ rowNumber: rowNumberRaw, data: sanitized });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "ValidationError", message: "Tidak ada baris valid untuk diproses." },
      { status: 400 },
    );
  }

  const failedRows: string[] = [];

  // 1) Detect duplicates within the same uploaded file.
  const seenByKey = new Map<string, number>();
  const dedupedRows: ImportRow[] = [];
  for (const row of rows) {
    const name = String(row.data.name || "").trim();
    const dioceseId = String(row.data.diocese_id || "").trim();
    const key = buildChurchKey(dioceseId, name);
    if (seenByKey.has(key)) {
      failedRows.push(
        `Baris ${row.rowNumber}: nama paroki duplikat di file (sama dengan baris ${seenByKey.get(
          key,
        )}).`,
      );
      continue;
    }
    seenByKey.set(key, row.rowNumber);
    dedupedRows.push(row);
  }

  // 2) Detect duplicates against existing data in DB.
  let rowsToInsert = dedupedRows;
  const dioceseIds = Array.from(
    new Set(dedupedRows.map((row) => String(row.data.diocese_id || "").trim()).filter(Boolean)),
  );

  if (dioceseIds.length > 0) {
    const { data: existingRows, error: existingError } = await adminClient
      .from("churches")
      .select("name, diocese_id")
      .in("diocese_id", dioceseIds);

    if (existingError) {
      if (isPermissionDeniedChurches(existingError)) {
        return NextResponse.json(
          {
            error: "PermissionDenied",
            message:
              "Service role belum punya izin akses tabel churches. Jalankan SQL GRANT terlebih dahulu.",
            sql_fix: [
              "grant usage on schema public to service_role;",
              "grant select, insert, update, delete on table public.churches to service_role;",
            ],
          },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { error: "DatabaseError", message: getErrorMessage(existingError) },
        { status: 500 },
      );
    }

    const existingKeySet = new Set(
      (existingRows || []).map((row) =>
        buildChurchKey(String((row as { diocese_id?: unknown }).diocese_id || ""), (row as { name?: unknown }).name),
      ),
    );

    rowsToInsert = dedupedRows.filter((row) => {
      const name = String(row.data.name || "").trim();
      const dioceseId = String(row.data.diocese_id || "").trim();
      const key = buildChurchKey(dioceseId, name);
      if (existingKeySet.has(key)) {
        failedRows.push(
          `Baris ${row.rowNumber}: nama paroki "${name}" sudah ada di keuskupan ini.`,
        );
        return false;
      }
      return true;
    });
  }

  if (failedRows.length > 0) {
    return NextResponse.json(
      {
        error: "ImportValidationFailed",
        message: "Import dibatalkan karena ditemukan data duplikat/invalid. Tidak ada data disimpan.",
        successCount: 0,
        failedRows,
      },
      { status: 400 },
    );
  }

  const tryInsert = async (payloadRows: Record<string, unknown>[]) => {
    const { error } = await adminClient.from("churches").insert(payloadRows);
    if (!error) return { ok: true as const, error: null as unknown };
    if (
      !isMissingColumnError(error, "google_maps_url") &&
      !isMissingColumnError(error, "latitude") &&
      !isMissingColumnError(error, "longitude")
    ) {
      return { ok: false as const, error };
    }
    const fallback = payloadRows.map(stripMapColumns);
    const { error: fallbackError } = await adminClient.from("churches").insert(fallback);
    if (!fallbackError) return { ok: true as const, error: null as unknown };
    return { ok: false as const, error: fallbackError };
  };

  const payloadToInsert = rowsToInsert.map((item) => item.data);
  const insertResult = await tryInsert(payloadToInsert);

  if (!insertResult.ok && isPermissionDeniedChurches(insertResult.error)) {
    return NextResponse.json(
      {
        error: "PermissionDenied",
        message:
          "Service role belum punya izin tulis ke tabel churches. Jalankan SQL GRANT terlebih dahulu.",
        sql_fix: [
          "grant usage on schema public to service_role;",
          "grant select, insert, update, delete on table public.churches to service_role;",
        ],
        successCount: 0,
        failedRows,
      },
      { status: 500 },
    );
  }

  if (!insertResult.ok) {
    const message = isDuplicateKeyError(insertResult.error)
      ? "Import dibatalkan: ada nama paroki duplikat di database."
      : `Import dibatalkan: ${getErrorMessage(insertResult.error)}`;
    return NextResponse.json(
      {
        error: "ImportFailed",
        message,
        successCount: 0,
        failedRows,
      },
      { status: 400 },
    );
  }

  const successCount = payloadToInsert.length;

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "IMPORT_CHURCHES_BULK",
    tableName: "churches",
    recordId: null,
    oldData: null,
    newData: {
      total_rows: rows.length,
      valid_rows: rowsToInsert.length,
      success_count: successCount,
      failed_count: failedRows.length,
    },
    request: req,
  });

  return NextResponse.json({
    success: true,
    successCount,
    failedRows: [],
  });
}
