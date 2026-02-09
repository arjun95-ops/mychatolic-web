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
const CHURCH_FK_COLUMNS = [
  "church_id",
  "church",
  "parish_id",
  "paroki_id",
  "church_uuid",
] as const;
const RADAR_EVENT_FK_COLUMNS = [
  "radar_id",
  "event_id",
  "radar_event_id",
  "radar_event",
  "event_uuid",
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
    (!code && !text) || // empty/legacy PostgREST error object
    code === "42P01" || // relation does not exist
    code === "42703" || // column does not exist
    code === "22P02" || // invalid input syntax for type (legacy schema mismatch)
    code.startsWith("PGRST") || // schema-cache mismatch from PostgREST
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

function buildForeignKeyColumnCandidates(
  table: string,
  constraint: string | null,
  baseColumns: readonly string[],
): string[] {
  const candidates = new Set<string>(baseColumns);
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

async function runDeleteByFilterIn(
  adminClient: SupabaseClient,
  sessionClient: SupabaseClient,
  table: string,
  column: string,
  values: string[],
) {
  const run = async (client: SupabaseClient) => client.from(table).delete().in(column, values);
  const adminResult = await run(adminClient);
  if (!adminResult.error) return { error: null as unknown };

  if (isPermissionDenied(adminResult.error)) {
    const sessionResult = await run(sessionClient);
    if (!sessionResult.error) return { error: null as unknown };
    return { error: sessionResult.error as unknown };
  }
  return { error: adminResult.error as unknown };
}

async function fetchIdsByFilter(
  adminClient: SupabaseClient,
  sessionClient: SupabaseClient,
  table: string,
  column: string,
  value: string,
): Promise<{ ids: string[]; error: unknown }> {
  const run = async (client: SupabaseClient) => client.from(table).select("id").eq(column, value);
  const adminResult = await run(adminClient);
  if (!adminResult.error) {
    const ids = ((adminResult.data || []) as Array<{ id?: unknown }>)
      .map((row) => String(row?.id || "").trim())
      .filter(Boolean);
    return { ids, error: null };
  }

  if (isPermissionDenied(adminResult.error)) {
    const sessionResult = await run(sessionClient);
    if (!sessionResult.error) {
      const ids = ((sessionResult.data || []) as Array<{ id?: unknown }>)
        .map((row) => String(row?.id || "").trim())
        .filter(Boolean);
      return { ids, error: null };
    }
    return { ids: [], error: sessionResult.error as unknown };
  }

  return { ids: [], error: adminResult.error as unknown };
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
      { error: "BadRequest", message: "Invalid JSON." },
      { status: 400 },
    );
  }

  const id = String((body as { id?: unknown })?.id || "").trim();
  if (!id || !isUuid(id)) {
    return NextResponse.json(
      { error: "ValidationError", message: "id paroki wajib diisi dan harus UUID valid." },
      { status: 400 },
    );
  }

  const { data: existing, error: findError } = await adminClient
    .from("churches")
    .select("id, name, diocese_id")
    .eq("id", id)
    .maybeSingle();

  if (findError) {
    const message = getPostgresErrorText(findError);
    if (isPermissionDenied(findError)) {
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

  if (!existing) {
    return NextResponse.json(
      { error: "NotFound", message: "Paroki tidak ditemukan." },
      { status: 404 },
    );
  }

  const cleanupSpecs: CleanupSpec[] = [
    { table: "profiles", column: "church_id", mode: "set_null", label: "Profil User" },
    { table: "mass_checkins", column: "church_id", mode: "delete", label: "Mass Check-ins" },
    { table: "mass_checkins_v2", column: "church_id", mode: "delete", label: "Mass Check-ins V2" },
    { table: "radar_events_v2", column: "church_id", mode: "delete", label: "Radar Events V2" },
    { table: "radar_invites_v2", column: "church_id", mode: "delete", label: "Radar Invites V2" },
    { table: "radar_events", column: "church_id", mode: "delete", label: "Radar Events (legacy)" },
    { table: "radar_invites", column: "church_id", mode: "delete", label: "Radar Invites (legacy)" },
    { table: "posts", column: "church_id", mode: "set_null", label: "Postingan (posts)" },
    { table: "radars", column: "church_id", mode: "set_null", label: "Radar" },
    { table: "user_posts", column: "church_id", mode: "set_null", label: "Postingan User" },
    { table: "wilayah", column: "church_id", mode: "delete", label: "Wilayah (legacy)" },
  ];
  const scheduleCleanupSpecs: CleanupSpec[] = [
    { table: "mass_checkins", column: "schedule_id", mode: "set_null", label: "Mass Check-ins" },
    {
      table: "mass_checkins_v2",
      column: "mass_schedule_id",
      mode: "set_null",
      label: "Mass Check-ins V2",
    },
    { table: "mass_radars", column: "schedule_id", mode: "set_null", label: "Mass Radar" },
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

    // Fallback to session-bound client when service-role does not have grants
    // on a legacy table (e.g. mass_schedules), but admin session policies allow it.
    if (error && isPermissionDenied(error)) {
      const { error: sessionCleanupError } = await runCleanup(sessionClient);
      if (!sessionCleanupError) {
        continue;
      }
      error = sessionCleanupError;
    }

    if (error) {
      if (canIgnoreReferenceCheckError(error)) {
        continue;
      }
      const message = getPostgresErrorText(error);
      if (isPermissionDenied(error)) {
        skippedPermissionTables.push(spec.table);
        if (process.env.NODE_ENV !== "production") {
          console.warn(`Skip cleanup permission ${spec.table}.${spec.column}:`, message || error);
        }
        continue;
      }
      // Non-permission cleanup errors should not block deletion.
      // Final delete will still fail with FK violation if relation is truly blocking.
      if (process.env.NODE_ENV !== "production") {
        console.warn(`Skip cleanup ${spec.table}.${spec.column}:`, message || error);
      }
      continue;
    }
  }

  const cleanupRadarEventsByChurch = async (eventTable: string) => {
    const fetched = await fetchIdsByFilter(adminClient, sessionClient, eventTable, "church_id", id);
    if (fetched.error) {
      if (canIgnoreReferenceCheckError(fetched.error)) return;
      if (isPermissionDenied(fetched.error)) {
        skippedPermissionTables.push(eventTable);
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `Skip loading ${eventTable} ids for cleanup:`,
            getPostgresErrorText(fetched.error) || fetched.error,
          );
        }
        return;
      }
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `Skip loading ${eventTable} ids for cleanup:`,
          getPostgresErrorText(fetched.error) || fetched.error,
        );
      }
      return;
    }

    const eventIds = fetched.ids;
    if (eventIds.length === 0) return;

    const childInviteTables = ["radar_invites_v2", "radar_invites"];
    for (const childTable of childInviteTables) {
      const candidateColumns = ["radar_id", "event_id", "radar_event_id"];
      for (const candidateColumn of candidateColumns) {
        const result = await runDeleteByFilterIn(
          adminClient,
          sessionClient,
          childTable,
          candidateColumn,
          eventIds,
        );
        if (!result.error) continue;
        if (canIgnoreReferenceCheckError(result.error)) continue;
        if (isPermissionDenied(result.error)) {
          skippedPermissionTables.push(childTable);
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              `Skip ${childTable}.${candidateColumn} cleanup (permission):`,
              getPostgresErrorText(result.error) || result.error,
            );
          }
          continue;
        }
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `Skip ${childTable}.${candidateColumn} cleanup:`,
            getPostgresErrorText(result.error) || result.error,
          );
        }
      }
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const deleteEvents = await runDeleteByFilterIn(adminClient, sessionClient, eventTable, "id", eventIds);
      if (!deleteEvents.error) break;

      if (canIgnoreReferenceCheckError(deleteEvents.error)) break;
      if (isPermissionDenied(deleteEvents.error)) {
        skippedPermissionTables.push(eventTable);
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `Skip deleting ${eventTable} by id (permission):`,
            getPostgresErrorText(deleteEvents.error) || deleteEvents.error,
          );
        }
        break;
      }

      const code = getPostgresErrorCode(deleteEvents.error);
      if (code !== "23503") {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `Skip deleting ${eventTable} by id:`,
            getPostgresErrorText(deleteEvents.error) || deleteEvents.error,
          );
        }
        break;
      }

      const dynamicChildTable = extractForeignKeyTableFromError(deleteEvents.error);
      const dynamicConstraint = extractForeignKeyConstraintFromError(deleteEvents.error);
      if (!dynamicChildTable) break;

      const childColumns = buildForeignKeyColumnCandidates(
        dynamicChildTable,
        dynamicConstraint,
        RADAR_EVENT_FK_COLUMNS,
      );
      for (const childColumn of childColumns) {
        const dynamicDelete = await runDeleteByFilterIn(
          adminClient,
          sessionClient,
          dynamicChildTable,
          childColumn,
          eventIds,
        );
        if (!dynamicDelete.error) continue;
        if (canIgnoreReferenceCheckError(dynamicDelete.error)) continue;
        if (isPermissionDenied(dynamicDelete.error)) {
          skippedPermissionTables.push(dynamicChildTable);
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              `Skip dynamic ${dynamicChildTable}.${childColumn} cleanup (permission):`,
              getPostgresErrorText(dynamicDelete.error) || dynamicDelete.error,
            );
          }
          continue;
        }
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `Skip dynamic ${dynamicChildTable}.${childColumn} cleanup:`,
            getPostgresErrorText(dynamicDelete.error) || dynamicDelete.error,
          );
        }
      }
    }
  };

  await cleanupRadarEventsByChurch("radar_events_v2");
  await cleanupRadarEventsByChurch("radar_events");

  let scheduleIds: string[] = [];
  const runFetchSchedules = async (client: SupabaseClient) =>
    client.from("mass_schedules").select("id").eq("church_id", id);

  const scheduleFetchAdmin = await runFetchSchedules(adminClient);
  let scheduleFetchError = scheduleFetchAdmin.error;
  let scheduleRows = (scheduleFetchAdmin.data || []) as Array<{ id?: unknown }>;

  if (scheduleFetchError && isPermissionDenied(scheduleFetchError)) {
    const scheduleFetchSession = await runFetchSchedules(sessionClient);
    if (!scheduleFetchSession.error) {
      scheduleFetchError = null;
      scheduleRows = (scheduleFetchSession.data || []) as Array<{ id?: unknown }>;
    } else {
      scheduleFetchError = scheduleFetchSession.error;
    }
  }

  if (scheduleFetchError) {
    if (isPermissionDenied(scheduleFetchError)) {
      skippedPermissionTables.push("mass_schedules");
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "Skip loading schedules before church delete:",
          getPostgresErrorText(scheduleFetchError) || scheduleFetchError,
        );
      }
    } else if (!canIgnoreReferenceCheckError(scheduleFetchError)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "Skip loading schedules before church delete:",
          getPostgresErrorText(scheduleFetchError) || scheduleFetchError,
        );
      }
    }
  } else {
    scheduleIds = scheduleRows
      .map((row) => String(row?.id || "").trim())
      .filter((value) => Boolean(value));
  }

  if (scheduleIds.length > 0) {
    for (const spec of scheduleCleanupSpecs) {
      const runCleanupByScheduleIds = async (client: SupabaseClient) => {
        const query =
          spec.mode === "set_null"
            ? client.from(spec.table).update({ [spec.column]: null }).in(spec.column, scheduleIds)
            : client.from(spec.table).delete().in(spec.column, scheduleIds);
        return query;
      };

      const { error: adminCleanupError } = await runCleanupByScheduleIds(adminClient);
      let error = adminCleanupError;

      if (error && isPermissionDenied(error)) {
        const { error: sessionCleanupError } = await runCleanupByScheduleIds(sessionClient);
        if (!sessionCleanupError) {
          continue;
        }
        error = sessionCleanupError;
      }

      if (error) {
        if (canIgnoreReferenceCheckError(error)) {
          continue;
        }
        const message = getPostgresErrorText(error);
        if (isPermissionDenied(error)) {
          skippedPermissionTables.push(spec.table);
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              `Skip schedule cleanup permission ${spec.table}.${spec.column}:`,
              message || error,
            );
          }
          continue;
        }
        if (process.env.NODE_ENV !== "production") {
          console.warn(`Skip schedule cleanup ${spec.table}.${spec.column}:`, message || error);
        }
        continue;
      }
    }

    const runDeleteSchedules = async (client: SupabaseClient) =>
      client.from("mass_schedules").delete().in("id", scheduleIds);

    const cleanupDynamicForeignTable = async (table: string, constraint: string | null) => {
      if (!table || table === "mass_schedules") return;

      const columns = buildForeignKeyColumnCandidates(table, constraint, SCHEDULE_FK_COLUMNS);
      for (const column of columns) {
        const runCleanup = async (client: SupabaseClient) =>
          client.from(table).delete().in(column, scheduleIds);

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
          if (canIgnoreReferenceCheckError(error)) {
            continue;
          }
          const message = getPostgresErrorText(error);
          if (isPermissionDenied(error)) {
            skippedPermissionTables.push(table);
            if (process.env.NODE_ENV !== "production") {
              console.warn(`Skip dynamic cleanup permission ${table}.${column}:`, message || error);
            }
            continue;
          }
          if (process.env.NODE_ENV !== "production") {
            console.warn(`Skip dynamic cleanup ${table}.${column}:`, message || error);
          }
          continue;
        }
      }
    };

    let deleteSchedulesError: unknown = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { error: adminDeleteSchedulesError } = await runDeleteSchedules(adminClient);
      deleteSchedulesError = adminDeleteSchedulesError;

      if (deleteSchedulesError && isPermissionDenied(deleteSchedulesError)) {
        const { error: sessionDeleteSchedulesError } = await runDeleteSchedules(sessionClient);
        if (!sessionDeleteSchedulesError) {
          deleteSchedulesError = null;
        } else {
          deleteSchedulesError = sessionDeleteSchedulesError;
        }
      }

      if (!deleteSchedulesError) break;

      const code = getPostgresErrorCode(deleteSchedulesError);
      if (code !== "23503") break;

      const dynamicTable = extractForeignKeyTableFromError(deleteSchedulesError);
      const dynamicConstraint = extractForeignKeyConstraintFromError(deleteSchedulesError);
      if (!dynamicTable) break;

      await cleanupDynamicForeignTable(dynamicTable, dynamicConstraint);
    }

    if (deleteSchedulesError) {
      if (isPermissionDenied(deleteSchedulesError)) {
        skippedPermissionTables.push("mass_schedules");
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "Skip deleting schedules before church delete (permission):",
            getPostgresErrorText(deleteSchedulesError) || deleteSchedulesError,
          );
        }
      } else if (!canIgnoreReferenceCheckError(deleteSchedulesError)) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "Skip deleting schedules before church delete:",
            getPostgresErrorText(deleteSchedulesError) || deleteSchedulesError,
          );
        }
      }
    }
  }

  const cleanupDynamicChurchForeignTable = async (table: string, constraint: string | null) => {
    if (!table || table === "churches") return;

    const columns = buildForeignKeyColumnCandidates(table, constraint, CHURCH_FK_COLUMNS);
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
        if (canIgnoreReferenceCheckError(error)) {
          continue;
        }
        const message = getPostgresErrorText(error);
        if (isPermissionDenied(error)) {
          skippedPermissionTables.push(table);
          if (process.env.NODE_ENV !== "production") {
            console.warn(`Skip dynamic church cleanup permission ${table}.${column}:`, message || error);
          }
          continue;
        }
        if (process.env.NODE_ENV !== "production") {
          console.warn(`Skip dynamic church cleanup ${table}.${column}:`, message || error);
        }
        continue;
      }
    }
  };

  let deleteError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { error: adminDeleteError } = await adminClient.from("churches").delete().eq("id", id);
    deleteError = adminDeleteError;

    if (deleteError && isPermissionDenied(deleteError)) {
      const { error: sessionDeleteError } = await sessionClient.from("churches").delete().eq("id", id);
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

    await cleanupDynamicChurchForeignTable(dynamicTable, dynamicConstraint);
  }

  if (deleteError) {
    const code = getPostgresErrorCode(deleteError);
    const message = getPostgresErrorText(deleteError);

    if (code === "23503") {
      const referenceSpecs = [
        ...cleanupSpecs,
        { table: "mass_schedules", column: "church_id", mode: "delete", label: "Jadwal Misa" } satisfies CleanupSpec,
      ];
      const references = await collectReferences(adminClient, sessionClient, referenceSpecs, id);
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
            `Tidak bisa menghapus karena data ini masih dipakai oleh tabel relasi lain.${relationHint}${fkHint}`,
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
            "Service role belum punya izin hapus di tabel churches. Jalankan SQL GRANT terlebih dahulu.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: "DatabaseError", message: message || "Gagal menghapus paroki." },
      { status: 500 },
    );
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "DELETE_CHURCH",
    tableName: "churches",
    recordId: id,
    oldData: existing as Record<string, unknown>,
    newData: { deleted: true },
    request: req,
  });

  const res = NextResponse.json({ success: true, data: existing });
  setCookiesToResponse(res);
  return res;
}
