import { NextResponse, type NextRequest } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

function parseAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1000) return null;
  return parsed;
}

function textOrNull(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
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
      .catch(() => ({} as { amount?: unknown; note?: unknown }));

    const correctedAmount = parseAmount(body?.amount);
    const note = textOrNull(body?.note);

    if (body?.amount != null && correctedAmount == null) {
      return NextResponse.json(
        { error: "Nominal koreksi minimal Rp1.000." },
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

    const updates: Record<string, unknown> = {
      status: "APPROVED",
      verified_at: new Date().toISOString(),
      verified_by: actor.id,
      reject_reason: null,
    };

    if (correctedAmount != null) {
      updates.amount = correctedAmount;
    }

    if (note) {
      updates.note = note;
    }

    const { data: updatedDonation, error: updateError } = await supabaseAdminClient
      .from("donations")
      .update(updates)
      .eq("id", normalizedDonationId)
      .select("*")
      .single();

    if (updateError) throw updateError;

    await logAdminAudit({
      supabaseAdminClient,
      actorAuthUserId: actor.id,
      action: "APPROVE_DONATION",
      tableName: "donations",
      recordId: normalizedDonationId,
      oldData: oldDonation,
      newData: updatedDonation,
      request: req,
      extra: {
        corrected_amount: correctedAmount,
      },
    });

    const response = NextResponse.json({
      success: true,
      donation: updatedDonation,
    });

    setCookiesToResponse(response);
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal menyetujui donasi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
