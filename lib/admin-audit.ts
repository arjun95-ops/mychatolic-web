import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type SupabaseAdminClient = SupabaseClient;

type AuditPayload = {
  supabaseAdminClient: SupabaseAdminClient;
  actorAuthUserId: string;
  action: string;
  tableName?: string | null;
  recordId?: string | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  request?: NextRequest | null;
  extra?: Record<string, unknown> | null;
};

function toJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function computeDiff(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>
): Record<string, { before: unknown; after: unknown }> {
  const keys = new Set<string>([...Object.keys(oldData), ...Object.keys(newData)]);
  const diff: Record<string, { before: unknown; after: unknown }> = {};

  for (const key of keys) {
    const before = oldData[key];
    const after = newData[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    diff[key] = { before, after };
  }

  return diff;
}

export function extractRequestMetadata(request?: NextRequest | null): Record<string, string> {
  if (!request) return {};

  const ip =
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "";
  const userAgent = request.headers.get("user-agent") || "";
  const referer = request.headers.get("referer") || "";
  const origin = request.headers.get("origin") || "";

  return {
    ip,
    user_agent: userAgent,
    referer,
    origin,
  };
}

export async function logAdminAudit(payload: AuditPayload): Promise<void> {
  const {
    supabaseAdminClient,
    actorAuthUserId,
    action,
    tableName,
    recordId,
    oldData,
    newData,
    request,
    extra,
  } = payload;

  if (!supabaseAdminClient || !actorAuthUserId || !action) return;

  const normalizedOld = toJson(oldData);
  const normalizedNew = toJson(newData);
  const diff = computeDiff(normalizedOld, normalizedNew);
  const requestHeaders = extractRequestMetadata(request);
  const baseInsert = {
    action,
    table_name: tableName || null,
    record_id: recordId || null,
    actor_auth_user_id: actorAuthUserId,
    old_data: Object.keys(normalizedOld).length > 0 ? normalizedOld : null,
    new_data:
      Object.keys(normalizedNew).length > 0 || extra
        ? {
            ...normalizedNew,
            ...(extra ? { __extra: extra } : {}),
            __diff: diff,
          }
        : null,
    request_headers: requestHeaders,
    occurred_at: new Date().toISOString(),
  };

  const attempts: Array<{ values: Record<string, unknown>; label: string }> = [
    { values: baseInsert, label: "modern" },
    {
      label: "legacy_user_details",
      values: {
        user_id: actorAuthUserId,
        action,
        details: {
          table_name: tableName || null,
          record_id: recordId || null,
          old_data: normalizedOld,
          new_data: normalizedNew,
          diff,
          extra: extra || null,
          request_headers: requestHeaders,
        },
        created_at: new Date().toISOString(),
      },
    },
    {
      label: "legacy_actor_details",
      values: {
        actor_auth_user_id: actorAuthUserId,
        action,
        details: {
          table_name: tableName || null,
          record_id: recordId || null,
          old_data: normalizedOld,
          new_data: normalizedNew,
          diff,
          extra: extra || null,
          request_headers: requestHeaders,
        },
        occurred_at: new Date().toISOString(),
      },
    },
  ];

  for (const attempt of attempts) {
    const { error } = await supabaseAdminClient.from("audit_logs").insert(attempt.values);
    if (!error) return;
    // undefined table/column continues to next shape; other errors still try fallback.
  }
}
