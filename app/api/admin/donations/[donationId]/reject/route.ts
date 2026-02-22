import { NextResponse, type NextRequest } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

function normalizeReason(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return normalized.slice(0, 400);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ donationId: string }> }
) {
  const ctx = await requireApprovedAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { user: actor, supabaseAdminClient, setCookiesToResponse } = ctx;

  try {
    const { donationId } = await context.params;
    const normalizedDonationId = (donationId || "").trim();

    if (!normalizedDonationId) {
      return NextResponse.json({ error: "ID donasi tidak valid." }, { status: 400 });
    }

    const body = await req
      .json()
      .catch(() => ({} as { reason?: unknown }));

    const reason = normalizeReason(body?.reason);
    if (!reason) {
      return NextResponse.json(
        { error: "Alasan penolakan wajib diisi." },
        { status: 400 }
      );
    }

    const { data: oldDonation, error: oldDonationError } = await supabaseAdminClient
      .from("donations")
      .select("*")
      .eq("id", normalizedDonationId)
      .maybeSingle();

    if (oldDonationError) throw oldDonationError;
    if (!oldDonation) {
      return NextResponse.json({ error: "Donasi tidak ditemukan." }, { status: 404 });
    }

    const { data: updatedDonation, error: updateError } = await supabaseAdminClient
      .from("donations")
      .update({
        status: "REJECTED",
        reject_reason: reason,
        verified_at: new Date().toISOString(),
        verified_by: actor.id,
      })
      .eq("id", normalizedDonationId)
      .select("*")
      .single();

    if (updateError) throw updateError;

    await logAdminAudit({
      supabaseAdminClient,
      actorAuthUserId: actor.id,
      action: "REJECT_DONATION",
      tableName: "donations",
      recordId: normalizedDonationId,
      oldData: oldDonation,
      newData: updatedDonation,
      request: req,
      extra: {
        reason,
      },
    });

    const response = NextResponse.json({
      success: true,
      donation: updatedDonation,
    });

    setCookiesToResponse(response);
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal menolak donasi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
