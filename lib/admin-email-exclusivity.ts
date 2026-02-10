import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLower, parseAdminRole } from "@/lib/admin-constants";

export const ADMIN_APP_BLOCK_REASON =
  "Email khusus Super Admin/Admin Ops. Akun aplikasi untuk email ini diblokir.";

type ProfileStatusRow = {
  id: string;
  email?: string | null;
  role?: string | null;
  account_status?: string | null;
  verification_status?: string | null;
};

type EnsureAdminEmailExclusiveInput = {
  supabaseAdminClient: SupabaseClient;
  authUserId?: string | null;
  email?: string | null;
  reason?: string | null;
};

type EnsureAdminEmailExclusiveResult = {
  updatedProfileIds: string[];
  updatedCount: number;
};

type ActiveAppProfileCheckInput = {
  supabaseAdminClient: SupabaseClient;
  email: string;
};

type ActiveAppProfileCheckResult = {
  hasActiveAppProfile: boolean;
  activeProfiles: ProfileStatusRow[];
};

function isBlockedProfile(row: Pick<ProfileStatusRow, "account_status" | "verification_status">): boolean {
  const accountStatus = normalizeLower(row.account_status);
  const verificationStatus = normalizeLower(row.verification_status);
  if (accountStatus === "banned" || accountStatus === "rejected") return true;
  if (verificationStatus === "rejected") return true;
  return false;
}

function isAdminProfileRole(role: unknown): boolean {
  return Boolean(parseAdminRole(role));
}

function isActiveAppProfile(row: ProfileStatusRow): boolean {
  if (isBlockedProfile(row)) return false;
  if (isAdminProfileRole(row.role)) return false;
  return true;
}

export async function findActiveAppProfilesByEmail(
  input: ActiveAppProfileCheckInput,
): Promise<ActiveAppProfileCheckResult> {
  const normalizedEmail = normalizeLower(input.email);
  if (!normalizedEmail) {
    return { hasActiveAppProfile: false, activeProfiles: [] };
  }

  const { data, error } = await input.supabaseAdminClient
    .from("profiles")
    .select("id,email,role,account_status,verification_status")
    .eq("email", normalizedEmail);

  if (error) {
    throw new Error(`Gagal cek profil aplikasi: ${error.message}`);
  }

  const activeProfiles = ((data || []) as ProfileStatusRow[]).filter(isActiveAppProfile);
  return {
    hasActiveAppProfile: activeProfiles.length > 0,
    activeProfiles,
  };
}

export async function ensureAdminEmailExclusive(
  input: EnsureAdminEmailExclusiveInput,
): Promise<EnsureAdminEmailExclusiveResult> {
  const authUserId = String(input.authUserId || "").trim();
  const email = normalizeLower(input.email || "");
  const reason = String(input.reason || ADMIN_APP_BLOCK_REASON).trim() || ADMIN_APP_BLOCK_REASON;
  const profileIds = new Set<string>();

  const payload = {
    account_status: "banned",
    verification_status: "rejected",
    rejection_reason: reason,
    updated_at: new Date().toISOString(),
  };

  if (authUserId) {
    const { data, error } = await input.supabaseAdminClient
      .from("profiles")
      .update(payload)
      .eq("id", authUserId)
      .select("id");

    if (error) {
      throw new Error(`Gagal blokir profil admin berdasarkan user id: ${error.message}`);
    }

    for (const row of data || []) {
      if (row?.id) profileIds.add(String(row.id));
    }
  }

  if (email) {
    let updateByEmailQuery = input.supabaseAdminClient
      .from("profiles")
      .update(payload)
      .eq("email", email);

    if (authUserId) {
      updateByEmailQuery = updateByEmailQuery.neq("id", authUserId);
    }

    const { data, error } = await updateByEmailQuery.select("id");

    if (error) {
      throw new Error(`Gagal blokir profil admin berdasarkan email: ${error.message}`);
    }

    for (const row of data || []) {
      if (row?.id) profileIds.add(String(row.id));
    }
  }

  return {
    updatedProfileIds: Array.from(profileIds),
    updatedCount: profileIds.size,
  };
}
