import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, createSupabaseAdminClient } from '@/lib/admin-guard'
import { normalizeLower, parseAdminRole } from '@/lib/admin-constants'
import { logAdminAudit } from '@/lib/admin-audit'
import {
    ensureAdminEmailExclusive,
    findActiveAppProfilesByEmail,
} from '@/lib/admin-email-exclusivity'

export async function POST(req: NextRequest) {
    // 1. Validate Auth & Email Verification
    const ctx = await getAuthContext(req)

    if (ctx instanceof NextResponse) {
        return ctx
    }

    const { isAuthenticated, emailVerified, user, setCookiesToResponse } = ctx

    const json = (payload: unknown, init?: { status?: number }) => {
        const res = NextResponse.json(payload, init)
        setCookiesToResponse(res)
        return res
    }

    if (!isAuthenticated || !user) {
        return json(
            { error: 'Unauthorized', message: 'Silakan login terlebih dahulu' },
            { status: 401 }
        )
    }

    if (!emailVerified) {
        return json(
            { error: 'Forbidden', message: 'Email belum diverifikasi' },
            { status: 403 }
        )
    }

    // 2. Parse Body
    let body;
    try {
        body = await req.json();
    } catch {
        return json({ error: 'BadRequest', message: 'Invalid JSON' }, { status: 400 });
    }

    const fullNameInput = body?.full_name;
    const full_name = typeof fullNameInput === 'string' ? fullNameInput.trim() : '';

    if (!full_name) {
        return json(
            { error: 'ValidationError', message: 'full_name wajib diisi' },
            { status: 400 }
        );
    }

    // Initialize Admin Client with Actor (User) Context for Audit
    const adminClient = createSupabaseAdminClient(user.id);
    const normalizedEmail = normalizeLower(user.email || '');
    const requestedAdminRole = parseAdminRole(user.user_metadata?.requested_admin_role || '');

    // 3. Two-way exclusivity guard: existing app account cannot request admin role
    // unless this account is created from admin onboarding flow.
    if (!requestedAdminRole) {
        const appProfileCheck = await findActiveAppProfilesByEmail({
            supabaseAdminClient: adminClient,
            email: normalizedEmail,
        });
        if (appProfileCheck.hasActiveAppProfile) {
            return json(
                {
                    error: 'Forbidden',
                    message:
                        'Email ini sudah dipakai akun aplikasi. Gunakan email khusus untuk Super Admin/Admin Ops.',
                },
                { status: 403 }
            );
        }
    }

    // 4. Email allowlist check
    const { data: allowlistedEmail, error: allowlistError } = await adminClient
        .from('admin_email_allowlist')
        .select('email')
        .eq('email', normalizedEmail)
        .maybeSingle();

    if (allowlistError) {
        if (allowlistError.code === '42P01') {
            return json(
                {
                    error: 'SchemaError',
                    message:
                        'Tabel admin_email_allowlist belum tersedia. Jalankan migration RBAC terlebih dahulu.',
                },
                { status: 500 }
            );
        }
        return json(
            { error: 'DatabaseError', message: allowlistError.message },
            { status: 500 }
        );
    }

    if (!allowlistedEmail) {
        return json(
            {
                error: 'Forbidden',
                message: 'Email Anda belum masuk daftar allowlist admin. Hubungi Super Admin.',
            },
            { status: 403 }
        );
    }

    // 5. Upsert to admin_users
    // We check if the user is already a super_admin to prevent accidental overwrite/downgrade via this endpoint.
    const { data: existingAdmin, error: fetchError } = await adminClient
        .from('admin_users')
        .select('auth_user_id, role, status')
        .eq('auth_user_id', user.id)
        .maybeSingle();

    if (fetchError) {
        console.error('Check Existing Admin Error:', fetchError);
        return json(
            { error: 'DatabaseError', message: 'Gagal mengecek data admin' },
            { status: 500 }
        );
    }

    if (existingAdmin) {
        if (existingAdmin.role === 'super_admin') {
            return json(
                { error: 'Forbidden', message: 'Anda sudah terdaftar sebagai Super Admin' },
                { status: 403 }
            );
        }

        if (existingAdmin.status === 'suspended') {
            return json(
                {
                    error: 'Forbidden',
                    message: 'Akun admin Anda sedang suspended. Hanya Super Admin yang bisa mengaktifkan kembali.',
                },
                { status: 403 }
            );
        }

        if (existingAdmin.status === 'approved') {
            return json(
                { error: 'Forbidden', message: 'Akun Anda sudah aktif sebagai admin.' },
                { status: 403 }
            );
        }
    }

    const upsertPayload = {
        auth_user_id: user.id,
        email: normalizedEmail,
        full_name,
        role: 'admin_ops',
        status: 'pending_approval',
        approved_at: null,
        approved_by: null,
        updated_at: new Date().toISOString(),
    };

    // 6. Perform Upsert
    const { error } = await adminClient
        .from('admin_users')
        .upsert(upsertPayload, { onConflict: 'auth_user_id' })

    if (error) {
        console.error('Register Admin Error:', error);
        return json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        );
    }

    try {
        await ensureAdminEmailExclusive({
            supabaseAdminClient: adminClient,
            authUserId: user.id,
            email: normalizedEmail,
        });
    } catch (exclusivityError: unknown) {
        const message =
            exclusivityError instanceof Error
                ? exclusivityError.message
                : 'Gagal menerapkan aturan email eksklusif admin.';
        return json(
            { error: 'DatabaseError', message },
            { status: 500 }
        );
    }

    await logAdminAudit({
        supabaseAdminClient: adminClient,
        actorAuthUserId: user.id,
        action: 'REGISTER_ADMIN_REQUEST',
        tableName: 'admin_users',
        recordId: user.id,
        oldData: existingAdmin || null,
        newData: upsertPayload,
        request: req,
        extra: { source: 'self_register' },
    });

    return json({ success: true });
}
