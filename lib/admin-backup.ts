import { format } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

function escapeCsvValue(value: unknown): string {
  if (value == null) return "";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows || rows.length === 0) return "";

  const headerSet = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row || {})) {
      headerSet.add(key);
    }
  }
  const headers = Array.from(headerSet);

  const lines = [headers.map((h) => escapeCsvValue(h)).join(",")];
  for (const row of rows) {
    const values = headers.map((header) => escapeCsvValue(row?.[header]));
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

export function buildBackupBasePath(now = new Date()): string {
  return `backups/${format(now, "yyyy/MM/dd/HHmmss")}`;
}

export function buildFileName(prefix: string, ext: "csv" | "json", now = new Date()): string {
  return `${prefix}_${format(now, "yyyyMMdd_HHmmss")}.${ext}`;
}

export function toJsonText(rows: Array<Record<string, unknown>>): string {
  return JSON.stringify(rows || [], null, 2);
}

export async function uploadTextFile({
  supabaseAdminClient,
  bucket,
  path,
  content,
  contentType,
}: {
  supabaseAdminClient: SupabaseClient;
  bucket: string;
  path: string;
  content: string;
  contentType: string;
}): Promise<{ path: string; signed_url: string | null }> {
  const binary = Buffer.from(content, "utf-8");

  const { error: uploadError } = await supabaseAdminClient.storage
    .from(bucket)
    .upload(path, binary, {
      upsert: true,
      contentType,
      cacheControl: "0",
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: signedData, error: signedError } = await supabaseAdminClient.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60);

  if (signedError) {
    return { path, signed_url: null };
  }

  return { path, signed_url: signedData?.signedUrl || null };
}
