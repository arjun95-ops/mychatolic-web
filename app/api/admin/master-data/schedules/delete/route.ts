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

const SCHEDULE_FK_COLUMNS = [
  "mass_schedule_id",
  "schedule_id",
  "mass_schedule",
  "schedule",
  "mass_schedule_uuid",
  "schedule_uuid",
] as const;

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

function extractForeignKeyTableFromError(error: unknown): string | null {
  const text = getPostgresErrorText(error);
  if (!text) return null;
  const precise = text.match(/foreign key constraint "[^"]+" on table "([^"]+)"/i);
  if (precise) {
    const table = String(precise[1] || "").trim();
    return table || null;
  }

  const allMatches = Array.from(text.matchAll(/on table "([^"]+)"/gi));
  if (allMatches.length === 0) return null;
  const table = String(allMatches[allMatches.length - 1]?.[1] || "").trim();
  return table || null;
}

function extractForeignKeyConstraintFromError(error: unknown): string | null {
  const text = getPostgresErrorText(error);
  if (!text) return null;
  const match = text.match(/constraint "([^"]+)"/i);
  if (!match) return null;
  const constraint = String(match[1] || "").trim();
  return constraint || null;
}

function buildForeignKeyColumnCandidates(table: string, constraint: string | null): string[] {
  const candidates = new Set<string>(SCHEDULE_FK_COLUMNS);
  if (!table || !constraint) return Array.from(candidates);

  const normalizedTable = table.trim();
  const normalizedConstraint = constraint.trim();
  const prefixes = [`fk_${normalizedTable}_`, `${normalizedTable}_`];
  let suffix = "";
  for (const prefix of prefixes) {
    if (normalizedConstraint.startsWith(prefix)) {
      suffix = normalizedConstraint.slice(prefix.length).replace(/_fkey$/i, "").trim();
      break;
    }
  }
  if (!suffix) return Array.from(candidates);

  candidates.add(suffix);
  if (!suffix.endsWith("_id")) {
    candidates.add(`${suffix}_id`);
  }
  return Array.from(candidates);
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
      { error: "ValidationError", message: "id jadwal wajib diisi dan harus UUID valid." },
      { status: 400 },
    );
  }

  const { data: existing, error: findError } = await adminClient
    .from("mass_schedules")
    .select("id, church_id, day_number, start_time, title, language")
    .eq("id", id)
    .maybeSingle();

  if (findError) {
    const message = getPostgresErrorText(findError);
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

  const cleanupSpecs: CleanupSpec[] = [
    {
      table: "mass_checkins",
      column: "schedule_id",
      mode: "set_null",
      label: "Mass Check-ins",
    },
    {
      table: "mass_checkins_v2",
      column: "mass_schedule_id",
      mode: "set_null",
      label: "Mass Check-ins V2",
    },
    {
      table: "mass_radars",
      column: "schedule_id",
      mode: "set_null",
      label: "Mass Radar",
    },
    {
      table: "radar_events_v2",
      column: "mass_schedule_id",
      mode: "delete",
      label: "Radar Events V2",
    },
    {
      table: "radar_events",
      column: "mass_schedule_id",
      mode: "delete",
      label: "Radar Events (legacy)",
    },
    {
      table: "radar_events_v2",
      column: "schedule_id",
      mode: "delete",
      label: "Radar Events V2 (legacy)",
    },
    {
      table: "radar_events",
      column: "schedule_id",
      mode: "delete",
      label: "Radar Events (legacy schedule_id)",
    },
    {
      table: "radar_invites_v2",
      column: "mass_schedule_id",
      mode: "delete",
      label: "Radar Invites V2",
    },
    {
      table: "radar_invites",
      column: "mass_schedule_id",
      mode: "delete",
      label: "Radar Invites (legacy)",
    },
    {
      table: "radar_invites_v2",
      column: "schedule_id",
      mode: "delete",
      label: "Radar Invites V2 (legacy)",
    },
    {
      table: "radar_invites",
      column: "schedule_id",
      mode: "delete",
      label: "Radar Invites (legacy schedule_id)",
    },
  ];
  const skippedPermissionTables: string[] = [];

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
      if (isPermissionDenied(error)) {
        skippedPermissionTables.push(spec.table);
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `Skip cleanup permission ${spec.table}.${spec.column}:`,
            getPostgresErrorText(error) || error,
          );
        }
        continue;
      }
      if (process.env.NODE_ENV !== "production") {
        console.warn(`Skip cleanup ${spec.table}.${spec.column}:`, getPostgresErrorText(error) || error);
      }
      continue;
    }
  }

  const cleanupDynamicForeignTable = async (table: string, constraint: string | null) => {
    if (!table || table === "mass_schedules") return;

    const columns = buildForeignKeyColumnCandidates(table, constraint);
    for (const column of columns) {
      const runCleanup = async (client: SupabaseClient) => client.from(table).delete().eq(column, id);

      const { error: adminCleanupError } = await runCleanup(adminClient);
      let error = adminCleanupError;

      if (error && isPermissionDenied(error)) {
        const { error: sessionCleanupError } = await runCleanup(sessionClient);
        if (!sessionCleanupError) {
          continue;
        }
        error = sessionCleanupError;
      }

      if (error) {
        if (canIgnoreReferenceCheckError(error)) continue;
        if (isPermissionDenied(error)) {
          skippedPermissionTables.push(table);
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              `Skip dynamic cleanup permission ${table}.${column}:`,
              getPostgresErrorText(error) || error,
            );
          }
          continue;
        }
        if (process.env.NODE_ENV !== "production") {
          console.warn(`Skip dynamic cleanup ${table}.${column}:`, getPostgresErrorText(error) || error);
        }
        continue;
      }
    }
  };

  let deleteError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { error: adminDeleteError } = await adminClient.from("mass_schedules").delete().eq("id", id);
    deleteError = adminDeleteError;

    if (deleteError && isPermissionDenied(deleteError)) {
      const { error: sessionDeleteError } = await sessionClient.from("mass_schedules").delete().eq("id", id);
      if (!sessionDeleteError) {
        deleteError = null;
      } else {
        deleteError = sessionDeleteError;
      }
    }

    if (!deleteError) break;

    const code = getPostgresErrorCode(deleteError);
    if (code !== "23503") break;

    const dynamicTable = extractForeignKeyTableFromError(deleteError);
    const dynamicConstraint = extractForeignKeyConstraintFromError(deleteError);
    if (!dynamicTable) break;

    await cleanupDynamicForeignTable(dynamicTable, dynamicConstraint);
  }

  if (deleteError) {
    const code = getPostgresErrorCode(deleteError);
    const message = getPostgresErrorText(deleteError);

    if (code === "23503") {
      const references = await collectReferences(adminClient, sessionClient, cleanupSpecs, id);
      const fkTable = extractForeignKeyTableFromError(deleteError);
      const fkConstraint = extractForeignKeyConstraintFromError(deleteError);
      const relationHint =
        skippedPermissionTables.length > 0
          ? ` Tidak bisa membersihkan relasi di tabel: ${Array.from(
              new Set(skippedPermissionTables),
            ).join(", ")}.`
          : "";
      const fkHint =
        fkTable || fkConstraint
          ? ` Detail FK: ${fkConstraint || "unknown_constraint"} pada tabel ${fkTable || "unknown_table"}.`
          : "";
      return NextResponse.json(
        {
          error: "ForeignKeyViolation",
          message:
            `Tidak bisa menghapus jadwal karena data ini masih dipakai oleh tabel relasi lain.${relationHint}${fkHint}`,
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
            "Service role belum punya izin hapus di tabel mass_schedules. Jalankan SQL GRANT terlebih dahulu.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: "DatabaseError", message: message || "Gagal menghapus jadwal." },
      { status: 500 },
    );
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "DELETE_MASS_SCHEDULE",
    tableName: "mass_schedules",
    recordId: id,
    oldData: existing as Record<string, unknown>,
    newData: { deleted: true },
    request: req,
  });

  const res = NextResponse.json({
    success: true,
    message: "Jadwal berhasil dihapus.",
    data: existing,
  });
  setCookiesToResponse(res);
  return res;
}
