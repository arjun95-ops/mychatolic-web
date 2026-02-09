import { NextRequest, NextResponse } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";
import { SupabaseClient } from "@supabase/supabase-js";

type CleanupSpec = {
  table: string;
  column: string;
  mode: "set_null" | "delete";
  label: string;
};

type ReferenceSummary = {
  label: string;
  table: string;
  count: number;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

function getPostgresErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function getPostgresErrorText(error: unknown): string {
  if (!error || typeof error !== "object") return "";
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
  try {
    const serialized = JSON.stringify(error);
    return serialized === "{}" ? "" : serialized;
  } catch {
    return "";
  }
}

function isPermissionDenied(error: unknown): boolean {
  const code = getPostgresErrorCode(error);
  const text = getPostgresErrorText(error).toLowerCase();
  return code === "42501" || text.includes("permission denied");
}

function canIgnoreReferenceCheckError(error: unknown): boolean {
  const code = getPostgresErrorCode(error);
  const text = getPostgresErrorText(error).toLowerCase();
  return (
    (!code && !text) ||
    code === "42P01" ||
    code === "42703" ||
    code === "22P02" ||
    code.startsWith("PGRST") ||
    text.includes("does not exist") ||
    text.includes("schema cache") ||
    text.includes("could not find")
  );
}

async function countReferences(
  adminClient: SupabaseClient,
  sessionClient: SupabaseClient,
  spec: CleanupSpec,
  id: string,
): Promise<number | null> {
  const runCount = async (client: SupabaseClient) =>
    client.from(spec.table).select(spec.column, { head: true, count: "exact" }).eq(spec.column, id);

  const adminResult = await runCount(adminClient);
  if (!adminResult.error) return Number(adminResult.count || 0);

  if (isPermissionDenied(adminResult.error)) {
    const sessionResult = await runCount(sessionClient);
    if (!sessionResult.error) return Number(sessionResult.count || 0);
    if (canIgnoreReferenceCheckError(sessionResult.error)) return null;
    return null;
  }

  if (canIgnoreReferenceCheckError(adminResult.error)) return null;
  return null;
}

async function collectReferences(
  adminClient: SupabaseClient,
  sessionClient: SupabaseClient,
  specs: CleanupSpec[],
  id: string,
): Promise<ReferenceSummary[]> {
  const rows: ReferenceSummary[] = [];
  for (const spec of specs) {
    const count = await countReferences(adminClient, sessionClient, spec, id);
    if (count == null || count <= 0) continue;
    rows.push({
      label: spec.label,
      table: spec.table,
      count,
    });
  }
  return rows;
}

export async function POST(req: NextRequest) {
  const ctx = await requireApprovedAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const {
    user,
    supabaseAdminClient: adminClient,
    supabase: sessionClient,
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

  const id = String((body as { id?: unknown })?.id || "").trim();
  if (!id || !isUuid(id)) {
    return NextResponse.json(
      { error: "ValidationError", message: "id negara wajib diisi dan harus UUID valid." },
      { status: 400 },
    );
  }

  const { data: existing, error: findError } = await adminClient
    .from("countries")
    .select("id, name, iso_code")
    .eq("id", id)
    .maybeSingle();

  if (findError) {
    const message = getPostgresErrorText(findError);
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

  const cleanupSpecs: CleanupSpec[] = [
    { table: "profiles", column: "country_id", mode: "set_null", label: "Profil User" },
    { table: "posts", column: "country_id", mode: "set_null", label: "Postingan (posts)" },
    { table: "user_posts", column: "country_id", mode: "set_null", label: "Postingan User" },
  ];

  for (const spec of cleanupSpecs) {
    const runCleanup = async (client: SupabaseClient) => {
      const query =
        spec.mode === "set_null"
          ? client.from(spec.table).update({ [spec.column]: null }).eq(spec.column, id)
          : client.from(spec.table).delete().eq(spec.column, id);
      return query;
    };

    const { error: adminCleanupError } = await runCleanup(adminClient);
    let error = adminCleanupError;

    if (error && isPermissionDenied(error)) {
      const { error: sessionCleanupError } = await runCleanup(sessionClient);
      if (!sessionCleanupError) continue;
      error = sessionCleanupError;
    }

    if (error) {
      if (canIgnoreReferenceCheckError(error)) continue;
      if (process.env.NODE_ENV !== "production") {
        console.warn(`Skip cleanup ${spec.table}.${spec.column}:`, getPostgresErrorText(error) || error);
      }
      continue;
    }
  }

  const referenceSpecs = [
    ...cleanupSpecs,
    { table: "dioceses", column: "country_id", mode: "delete", label: "Keuskupan" } satisfies CleanupSpec,
  ];

  const { error: deleteError } = await adminClient.from("countries").delete().eq("id", id);
  if (deleteError) {
    const code = getPostgresErrorCode(deleteError);
    const message = getPostgresErrorText(deleteError);

    if (code === "23503") {
      const references = await collectReferences(adminClient, sessionClient, referenceSpecs, id);
      return NextResponse.json(
        {
          error: "ForeignKeyViolation",
          message:
            "Tidak bisa menghapus negara karena data ini masih dipakai oleh tabel relasi lain.",
          references,
        },
        { status: 409 },
      );
    }

    if (isPermissionDenied(deleteError)) {
      return NextResponse.json(
        {
          error: "PermissionDenied",
          message:
            "Service role belum punya izin hapus di tabel countries. Jalankan SQL GRANT terlebih dahulu.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: "DatabaseError", message: message || "Gagal menghapus negara." },
      { status: 500 },
    );
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "DELETE_COUNTRY",
    tableName: "countries",
    recordId: id,
    oldData: existing as Record<string, unknown>,
    newData: { deleted: true },
    request: req,
  });

  const res = NextResponse.json({
    success: true,
    message: "Negara berhasil dihapus.",
    data: existing,
  });
  setCookiesToResponse(res);
  return res;
}
