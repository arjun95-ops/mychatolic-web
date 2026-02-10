#!/usr/bin/env node

import fs from "fs";
import path from "path";
import process from "process";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_REPORT = "docs/import/admin_email_exclusivity_report.json";
const DEFAULT_REASON =
  "Email khusus Super Admin/Admin Ops. Akun aplikasi untuk email ini diblokir.";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    report: DEFAULT_REPORT,
    reason: DEFAULT_REASON,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") args.dryRun = true;
    else if (token === "--report") args.report = String(argv[i + 1] || "");
    else if (token === "--reason") args.reason = String(argv[i + 1] || "");

    if (token === "--report" || token === "--reason") i += 1;
  }

  return args;
}

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  const text = fs.readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/g)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function safeJsonWrite(filePath, data) {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function normalizeLower(value) {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function isBlockedProfile(row) {
  const accountStatus = normalizeLower(row.account_status);
  const verificationStatus = normalizeLower(row.verification_status);
  if (accountStatus === "banned" || accountStatus === "rejected") return true;
  if (verificationStatus === "rejected") return true;
  return false;
}

async function fetchAdminRows(client) {
  const { data, error } = await client
    .from("admin_users")
    .select("auth_user_id,email,role,status")
    .in("role", ["super_admin", "admin_ops"]);
  if (error) throw new Error(`Gagal memuat admin_users: ${error.message}`);
  return data || [];
}

async function fetchProfilesByIds(client, ids) {
  const rows = [];
  for (const chunk of chunkArray(ids, 500)) {
    if (chunk.length === 0) continue;
    const { data, error } = await client
      .from("profiles")
      .select("id,email,role,account_status,verification_status,rejection_reason,updated_at")
      .in("id", chunk);
    if (error) throw new Error(`Gagal memuat profiles by id: ${error.message}`);
    rows.push(...(data || []));
  }
  return rows;
}

async function fetchProfilesByEmails(client, emails) {
  const rows = [];
  for (const chunk of chunkArray(emails, 500)) {
    if (chunk.length === 0) continue;
    const { data, error } = await client
      .from("profiles")
      .select("id,email,role,account_status,verification_status,rejection_reason,updated_at")
      .in("email", chunk);
    if (error) throw new Error(`Gagal memuat profiles by email: ${error.message}`);
    rows.push(...(data || []));
  }
  return rows;
}

async function updateProfilesByIds(client, ids, payload) {
  const updated = [];
  for (const chunk of chunkArray(ids, 500)) {
    if (chunk.length === 0) continue;
    const { data, error } = await client
      .from("profiles")
      .update(payload)
      .in("id", chunk)
      .select("id");
    if (error) throw new Error(`Gagal update profiles by id: ${error.message}`);
    updated.push(...(data || []));
  }
  return updated;
}

async function updateProfilesByEmails(client, emails, payload) {
  const updated = [];
  for (const chunk of chunkArray(emails, 500)) {
    if (chunk.length === 0) continue;
    const { data, error } = await client
      .from("profiles")
      .update(payload)
      .in("email", chunk)
      .select("id");
    if (error) throw new Error(`Gagal update profiles by email: ${error.message}`);
    updated.push(...(data || []));
  }
  return updated;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv(path.join(process.cwd(), ".env.local"));
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const client = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const startedAt = new Date().toISOString();
  const adminRows = await fetchAdminRows(client);
  const adminAuthIds = Array.from(
    new Set(adminRows.map((row) => String(row.auth_user_id || "").trim()).filter(Boolean)),
  );
  const adminEmails = Array.from(
    new Set(adminRows.map((row) => normalizeLower(row.email)).filter(Boolean)),
  );

  const byIdProfiles = await fetchProfilesByIds(client, adminAuthIds);
  const byEmailProfiles = await fetchProfilesByEmails(client, adminEmails);

  const profileMap = new Map();
  for (const row of [...byIdProfiles, ...byEmailProfiles]) {
    if (!row?.id) continue;
    profileMap.set(String(row.id), row);
  }

  const candidateProfiles = Array.from(profileMap.values());
  const alreadyBlocked = candidateProfiles.filter(isBlockedProfile);
  const needsBlocking = candidateProfiles.filter((row) => !isBlockedProfile(row));

  const report = {
    started_at: startedAt,
    finished_at: null,
    dry_run: args.dryRun,
    reason: args.reason || DEFAULT_REASON,
    summary: {
      admin_rows: adminRows.length,
      unique_admin_auth_user_ids: adminAuthIds.length,
      unique_admin_emails: adminEmails.length,
      matched_profiles: candidateProfiles.length,
      already_blocked_profiles: alreadyBlocked.length,
      profiles_to_block: needsBlocking.length,
      updated_profiles: 0,
    },
    samples: {
      admins: adminRows.slice(0, 20),
      profiles_to_block: needsBlocking.slice(0, 50),
      already_blocked_profiles: alreadyBlocked.slice(0, 50),
    },
  };

  if (!args.dryRun) {
    const payload = {
      account_status: "banned",
      verification_status: "rejected",
      rejection_reason: args.reason || DEFAULT_REASON,
      updated_at: new Date().toISOString(),
    };

    const updatedById = await updateProfilesByIds(client, adminAuthIds, payload);
    const updatedByEmail = await updateProfilesByEmails(client, adminEmails, payload);
    const updatedIds = new Set();

    for (const row of [...updatedById, ...updatedByEmail]) {
      if (row?.id) updatedIds.add(String(row.id));
    }

    report.summary.updated_profiles = updatedIds.size;
  }

  report.finished_at = new Date().toISOString();
  safeJsonWrite(args.report || DEFAULT_REPORT, report);

  console.log("Admin email exclusivity report:");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report saved to: ${args.report || DEFAULT_REPORT}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
