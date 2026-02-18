// import { createClient } from '@supabase/supabase-js'; 
import { NextResponse, type NextRequest } from 'next/server';
import { requireApprovedAdmin } from '@/lib/admin-guard';
import { logAdminAudit } from '@/lib/admin-audit';
import { ensureAdminEmailExclusive } from '@/lib/admin-email-exclusivity';

const LEGACY_VERIFICATION_STATUS_MAP: Record<string, string> = {
    verified_catholic: 'verified',
    verified_pastoral: 'verified',
};

function normalizeStatusValue(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return value;
    return LEGACY_VERIFICATION_STATUS_MAP[normalized] ?? normalized;
}

function normalizeVerificationUpdates(updates: Record<string, unknown>): Record<string, unknown> {
    const normalizedUpdates: Record<string, unknown> = { ...updates };

    if ('account_status' in normalizedUpdates) {
        normalizedUpdates.account_status = normalizeStatusValue(normalizedUpdates.account_status);
    }

    if ('verification_status' in normalizedUpdates) {
        normalizedUpdates.verification_status = normalizeStatusValue(normalizedUpdates.verification_status);
    }

    return normalizedUpdates;
}

export async function POST(req: NextRequest) {
    // 1. Guard: Authentication & Authorization
    const ctx = await requireApprovedAdmin(req);

    if (ctx instanceof NextResponse) {
        return ctx;
    }

    const { user: actor, supabaseAdminClient, setCookiesToResponse } = ctx;

    try {
        // 2. Parse Body
        const body = await req.json();
        const { userId, updates } = body;
        const normalizedUserId = String(userId || '').trim();

        if (!normalizedUserId || !updates || typeof updates !== 'object') {
            return NextResponse.json(
                { error: 'Missing required fields: userId or updates' },
                { status: 400 }
            );
        }

        const normalizedUpdates = normalizeVerificationUpdates(updates as Record<string, unknown>);

        const { data: linkedAdmin, error: linkedAdminError } = await supabaseAdminClient
            .from('admin_users')
            .select('auth_user_id, role, status, email')
            .eq('auth_user_id', normalizedUserId)
            .in('role', ['super_admin', 'admin_ops'])
            .maybeSingle();

        if (linkedAdminError) {
            return NextResponse.json(
                { error: `Gagal mengecek akun admin: ${linkedAdminError.message}` },
                { status: 500 }
            );
        }

        if (linkedAdmin) {
            await ensureAdminEmailExclusive({
                supabaseAdminClient,
                authUserId: normalizedUserId,
                email: linkedAdmin.email ? String(linkedAdmin.email) : '',
            });

            return NextResponse.json(
                {
                    error:
                        'Akun ini terdaftar sebagai Super Admin/Admin Ops. Status user aplikasi tidak bisa diubah.',
                },
                { status: 403 }
            );
        }

        const { data: oldProfile } = await supabaseAdminClient
            .from('profiles')
            .select('*')
            .eq('id', normalizedUserId)
            .maybeSingle();

        // 3. Update Profile via Admin Client
        const { data, error } = await supabaseAdminClient
            .from('profiles')
            .update(normalizedUpdates)
            .eq('id', normalizedUserId)
            .select()
            .single();

        if (error) {
            console.error('Supabase Admin Error:', error);
            throw error;
        }

        await logAdminAudit({
            supabaseAdminClient,
            actorAuthUserId: actor.id,
            action: 'UPDATE_USER_VERIFICATION',
            tableName: 'profiles',
            recordId: normalizedUserId,
            oldData: oldProfile || null,
            newData: data || normalizedUpdates,
            request: req,
        });

        const response = NextResponse.json({ success: true, data });
        setCookiesToResponse(response);
        return response;

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        console.error('API Error:', error);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
