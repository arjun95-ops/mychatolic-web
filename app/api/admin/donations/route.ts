import { NextResponse, type NextRequest } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { toCsv } from "@/lib/admin-backup";

export const dynamic = "force-dynamic";

type DonationRow = {
  id: string;
  user_id?: string | null;
  donor_name?: string | null;
  donor_contact?: string | null;
  amount?: number | null;
  note?: string | null;
  status?: string | null;
  submitted_at?: string | null;
  verified_at?: string | null;
  verified_by?: string | null;
  reject_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type LatestProofRow = {
  donation_id: string;
  proof_id?: string | null;
  storage_path?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  uploaded_at?: string | null;
};

type ProfileRow = {
  id: string;
  full_name?: string | null;
  email?: string | null;
};

type AdminUserRow = {
  auth_user_id: string;
  full_name?: string | null;
  email?: string | null;
};

function normalizeStatusFilter(value: string | null): string | null {
  const normalized = (value || "").trim().toUpperCase();
  if (!normalized || normalized === "ALL") return null;

  const allowed = new Set([
    "PENDING_VERIFICATION",
    "APPROVED",
    "REJECTED",
    "CANCELLED",
    "EXPIRED",
  ]);

  if (!allowed.has(normalized)) return null;
  return normalized;
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt((value || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseIsoDateInput(value: string | null): string | null {
  const normalized = (value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  return normalized;
}

function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();
}

function amountValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function textOrNull(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

export async function GET(req: NextRequest) {
  const ctx = await requireApprovedAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { supabaseAdminClient, setCookiesToResponse } = ctx;

  try {
    const params = req.nextUrl.searchParams;

    const statusFilter = normalizeStatusFilter(params.get("status"));
    const dateFrom = parseIsoDateInput(params.get("date_from"));
    const dateTo = parseIsoDateInput(params.get("date_to"));
    const searchTermRaw = (params.get("q") || "").trim();
    const searchTerm = sanitizeSearchTerm(searchTermRaw);

    const page = parsePositiveInt(params.get("page"), 1);
    const pageSize = Math.min(100, parsePositiveInt(params.get("page_size"), 20));
    const format = (params.get("format") || "").trim().toLowerCase();
    const exportCsv = format === "csv";

    let query = supabaseAdminClient
      .from("donations")
      .select(
        "id, user_id, donor_name, donor_contact, amount, note, status, submitted_at, verified_at, verified_by, reject_reason, created_at, updated_at",
        { count: "exact" }
      )
      .order("submitted_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    if (dateFrom) {
      query = query.gte("submitted_at", `${dateFrom}T00:00:00.000Z`);
    }

    if (dateTo) {
      query = query.lte("submitted_at", `${dateTo}T23:59:59.999Z`);
    }

    if (searchTerm) {
      const conditions: string[] = [
        `donor_name.ilike.%${searchTerm}%`,
        `donor_contact.ilike.%${searchTerm}%`,
      ];

      const numericSearch = Number.parseInt(searchTerm.replace(/\D/g, ""), 10);
      if (Number.isFinite(numericSearch) && numericSearch > 0) {
        conditions.push(`amount.eq.${numericSearch}`);
      }

      query = query.or(conditions.join(","));
    }

    if (exportCsv) {
      query = query.limit(5000);
    } else {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);
    }

    const { data: donationData, error: donationError, count } = await query;
    if (donationError) {
      throw donationError;
    }

    const donationRows = (donationData || []) as DonationRow[];
    const donationIds = donationRows.map((row) => row.id).filter(Boolean);
    const userIds = Array.from(
      new Set(
        donationRows
          .map((row) => String(row.user_id || "").trim())
          .filter((value) => value)
      )
    );
    const verifierIds = Array.from(
      new Set(
        donationRows
          .map((row) => String(row.verified_by || "").trim())
          .filter((value) => value)
      )
    );

    const profileByUserId = new Map<string, ProfileRow>();
    if (userIds.length > 0) {
      const { data: profileData, error: profileError } = await supabaseAdminClient
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      if (!profileError) {
        for (const item of (profileData || []) as ProfileRow[]) {
          profileByUserId.set(item.id, item);
        }
      }
    }

    const verifierLabelById = new Map<string, string>();
    if (verifierIds.length > 0) {
      const { data: adminUsersData, error: adminUsersError } = await supabaseAdminClient
        .from("admin_users")
        .select("auth_user_id, full_name, email")
        .in("auth_user_id", verifierIds);

      if (!adminUsersError) {
        for (const item of (adminUsersData || []) as AdminUserRow[]) {
          const label = textOrNull(item.full_name) || textOrNull(item.email) || item.auth_user_id;
          verifierLabelById.set(item.auth_user_id, label);
        }
      }

      const missingVerifierIds = verifierIds.filter((id) => !verifierLabelById.has(id));
      if (missingVerifierIds.length > 0) {
        const { data: fallbackProfilesData, error: fallbackProfilesError } = await supabaseAdminClient
          .from("profiles")
          .select("id, full_name, email")
          .in("id", missingVerifierIds);

        if (!fallbackProfilesError) {
          for (const item of (fallbackProfilesData || []) as ProfileRow[]) {
            const label = textOrNull(item.full_name) || textOrNull(item.email) || item.id;
            verifierLabelById.set(item.id, label);
          }
        }
      }
    }

    const latestProofByDonationId = new Map<string, LatestProofRow>();
    if (donationIds.length > 0) {
      const { data: proofData, error: proofError } = await supabaseAdminClient
        .from("donation_latest_proofs")
        .select("donation_id, proof_id, storage_path, file_type, file_size, uploaded_at")
        .in("donation_id", donationIds);

      if (!proofError) {
        for (const proof of (proofData || []) as LatestProofRow[]) {
          latestProofByDonationId.set(proof.donation_id, proof);
        }
      }
    }

    const rows = donationRows.map((row) => {
      const profile = row.user_id ? profileByUserId.get(String(row.user_id)) : undefined;
      const donorDisplayName =
        textOrNull(row.donor_name) || textOrNull(profile?.full_name) || "Donatur";
      const donorDisplayContact =
        textOrNull(row.donor_contact) || textOrNull(profile?.email) || null;
      const latestProof = latestProofByDonationId.get(row.id) || null;

      return {
        ...row,
        amount: amountValue(row.amount),
        donor_display_name: donorDisplayName,
        donor_display_contact: donorDisplayContact,
        verified_by_label: row.verified_by
          ? verifierLabelById.get(String(row.verified_by)) || String(row.verified_by)
          : null,
        latest_proof: latestProof,
      };
    });

    const { count: pendingCount } = await supabaseAdminClient
      .from("donations")
      .select("id", { count: "exact", head: true })
      .eq("status", "PENDING_VERIFICATION");

    const now = new Date();
    const startTodayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
    );
    const startMonthUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
    );

    const { data: approvedRowsData } = await supabaseAdminClient
      .from("donations")
      .select("amount, verified_at")
      .eq("status", "APPROVED")
      .gte("verified_at", startMonthUtc.toISOString());

    let approvedTodayCount = 0;
    let approvedTodayAmount = 0;
    let approvedMonthCount = 0;
    let approvedMonthAmount = 0;

    for (const item of (approvedRowsData || []) as Array<{ amount?: number; verified_at?: string | null }>) {
      const verifiedAtRaw = textOrNull(item.verified_at);
      if (!verifiedAtRaw) continue;

      const verifiedAt = new Date(verifiedAtRaw);
      if (Number.isNaN(verifiedAt.getTime())) continue;

      const amount = amountValue(item.amount);

      approvedMonthCount += 1;
      approvedMonthAmount += amount;

      if (verifiedAt >= startTodayUtc) {
        approvedTodayCount += 1;
        approvedTodayAmount += amount;
      }
    }

    if (exportCsv) {
      const csvRows = rows.map((row) => ({
        id: row.id,
        status: row.status,
        donor_name: row.donor_display_name,
        donor_contact: row.donor_display_contact,
        amount: row.amount,
        submitted_at: row.submitted_at,
        verified_at: row.verified_at,
        verified_by: row.verified_by_label,
        reject_reason: row.reject_reason,
        note: row.note,
        user_id: row.user_id,
        latest_proof_path: row.latest_proof?.storage_path || "",
        latest_proof_type: row.latest_proof?.file_type || "",
      }));

      const csv = toCsv(csvRows as Array<Record<string, unknown>>);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const response = new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=donations_${timestamp}.csv`,
        },
      });
      setCookiesToResponse(response);
      return response;
    }

    const total = count || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const response = NextResponse.json({
      rows,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: totalPages,
      },
      summary: {
        pending_count: pendingCount || 0,
        approved_today_count: approvedTodayCount,
        approved_today_amount: approvedTodayAmount,
        approved_month_count: approvedMonthCount,
        approved_month_amount: approvedMonthAmount,
      },
      filters: {
        status: statusFilter || "ALL",
        date_from: dateFrom,
        date_to: dateTo,
        q: searchTermRaw,
      },
    });

    setCookiesToResponse(response);
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal memuat donasi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
