import { NextResponse, type NextRequest } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";

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

type DonationProofRow = {
  id: string;
  donation_id: string;
  storage_path: string;
  file_type?: string | null;
  file_size?: number | null;
  checksum?: string | null;
  uploaded_by?: string | null;
  uploaded_at?: string | null;
  created_at?: string | null;
};

function textOrNull(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function amountValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ donationId: string }> }
) {
  const ctx = await requireApprovedAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { supabaseAdminClient, setCookiesToResponse } = ctx;

  try {
    const { donationId } = await context.params;
    const normalizedDonationId = (donationId || "").trim();

    if (!normalizedDonationId) {
      return NextResponse.json({ error: "ID donasi tidak valid." }, { status: 400 });
    }

    const { data: donationData, error: donationError } = await supabaseAdminClient
      .from("donations")
      .select(
        "id, user_id, donor_name, donor_contact, amount, note, status, submitted_at, verified_at, verified_by, reject_reason, created_at, updated_at"
      )
      .eq("id", normalizedDonationId)
      .maybeSingle();

    if (donationError) throw donationError;
    if (!donationData) {
      return NextResponse.json({ error: "Donasi tidak ditemukan." }, { status: 404 });
    }

    const donation = donationData as DonationRow;

    let profile: { id: string; full_name?: string | null; email?: string | null } | null = null;
    const userId = textOrNull(donation.user_id);
    if (userId) {
      const { data: profileData, error: profileError } = await supabaseAdminClient
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", userId)
        .maybeSingle();

      if (!profileError && profileData) {
        profile = profileData;
      }
    }

    const verifierId = textOrNull(donation.verified_by);
    let verifierLabel: string | null = null;

    if (verifierId) {
      const { data: adminData, error: adminError } = await supabaseAdminClient
        .from("admin_users")
        .select("auth_user_id, full_name, email")
        .eq("auth_user_id", verifierId)
        .maybeSingle();

      if (!adminError && adminData) {
        verifierLabel =
          textOrNull(adminData.full_name) ||
          textOrNull(adminData.email) ||
          textOrNull(adminData.auth_user_id);
      }

      if (!verifierLabel) {
        const { data: verifierProfileData, error: verifierProfileError } = await supabaseAdminClient
          .from("profiles")
          .select("id, full_name, email")
          .eq("id", verifierId)
          .maybeSingle();

        if (!verifierProfileError && verifierProfileData) {
          verifierLabel =
            textOrNull(verifierProfileData.full_name) ||
            textOrNull(verifierProfileData.email) ||
            textOrNull(verifierProfileData.id);
        }
      }
    }

    const { data: proofData, error: proofError } = await supabaseAdminClient
      .from("donation_proofs")
      .select(
        "id, donation_id, storage_path, file_type, file_size, checksum, uploaded_by, uploaded_at, created_at"
      )
      .eq("donation_id", normalizedDonationId)
      .order("uploaded_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (proofError) throw proofError;

    const proofs = await Promise.all(
      ((proofData || []) as DonationProofRow[]).map(async (proof) => {
        let signedUrl: string | null = null;
        const storagePath = textOrNull(proof.storage_path);

        if (storagePath) {
          const { data: signedData, error: signedError } = await supabaseAdminClient.storage
            .from("donation-proofs")
            .createSignedUrl(storagePath, 60 * 15);

          if (!signedError) {
            signedUrl = signedData?.signedUrl || null;
          }
        }

        return {
          ...proof,
          file_size: amountValue(proof.file_size),
          signed_url: signedUrl,
          is_pdf:
            String(proof.file_type || "")
              .toLowerCase()
              .includes("pdf") ||
            String(proof.storage_path || "")
              .toLowerCase()
              .endsWith(".pdf"),
        };
      })
    );

    const response = NextResponse.json({
      donation: {
        ...donation,
        amount: amountValue(donation.amount),
        donor_display_name:
          textOrNull(donation.donor_name) || textOrNull(profile?.full_name) || "Donatur",
        donor_display_contact:
          textOrNull(donation.donor_contact) || textOrNull(profile?.email) || null,
        verified_by_label: verifierLabel,
      },
      proofs,
    });

    setCookiesToResponse(response);
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal memuat detail donasi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
