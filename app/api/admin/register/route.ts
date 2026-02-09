import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, createSupabaseAdminClient } from '@/lib/admin-guard'
import { normalizeLower } from '@/lib/admin-constants'
import { logAdminAudit } from '@/lib/admin-audit'

export async function POST(req: NextRequest) {
    // 1. Validate Auth & Email Verification
    const ctx = await getAuthContext(req)

    if (ctx instanceof NextResponse) {
        return ctx
    }

    const { isAuthenticated, emailVerified, user } = ctx

    if (!isAuthenticated || !user) {
        return NextResponse.json(
            { error: 'Unauthorized', message: 'Silakan login terlebih dahulu' },
            { status: 401 }
        )
    }

    if (!emailVerified) {
        return NextResponse.json(
            { error: 'Forbidden', message: 'Email belum diverifikasi' },
            { status: 403 }
        )
    }

    // 2. Parse Body
    let body;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'BadRequest', message: 'Invalid JSON' }, { status: 400 });
    }

    const fullNameInput = body?.full_name;
    const full_name = typeof fullNameInput === 'string' ? fullNameInput.trim() : '';

    if (!full_name) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'full_name wajib diisi' },
            { status: 400 }
        );
    }

    // Initialize Admin Client with Actor (User) Context for Audit
    const adminClient = createSupabaseAdminClient(user.id);
    const normalizedEmail = normalizeLower(user.email || '');

    // 3. Email allowlist check
    const { data: allowlistedEmail, error: allowlistError } = await adminClient
        .from('admin_email_allowlist')
        .select('email')
        .eq('email', normalizedEmail)
        .maybeSingle();

    if (allowlistError) {
        if (allowlistError.code === '42P01') {
            return NextResponse.json(
                {
                    error: 'SchemaError',
                    message:
                        'Tabel admin_email_allowlist belum tersedia. Jalankan migration RBAC terlebih dahulu.',
                },
                { status: 500 }
            );
        }
        return NextResponse.json(
            { error: 'DatabaseError', message: allowlistError.message },
            { status: 500 }
        );
    }

    if (!allowlistedEmail) {
        return NextResponse.json(
            {
                error: 'Forbidden',
                message: 'Email Anda belum masuk daftar allowlist admin. Hubungi Super Admin.',
            },
            { status: 403 }
        );
    }

    // 4. Upsert to admin_users
    // We check if the user is already a super_admin to prevent accidental overwrite/downgrade via this endpoint.
    const { data: existingAdmin, error: fetchError } = await adminClient
        .from('admin_users')
        .select('auth_user_id, role, status')
        .eq('auth_user_id', user.id)
        .maybeSingle();

    if (fetchError) {
        console.error('Check Existing Admin Error:', fetchError);
        return NextResponse.json(
            { error: 'DatabaseError', message: 'Gagal mengecek data admin' },
            { status: 500 }
        );
    }

    if (existingAdmin) {
        if (existingAdmin.role === 'super_admin') {
            return NextResponse.json(
                { error: 'Forbidden', message: 'Anda sudah terdaftar sebagai Super Admin' },
                { status: 403 }
            );
        }

        if (existingAdmin.status === 'suspended') {
            return NextResponse.json(
                {
                    error: 'Forbidden',
                    message: 'Akun admin Anda sedang suspended. Hanya Super Admin yang bisa mengaktifkan kembali.',
                },
                { status: 403 }
            );
        }

        if (existingAdmin.status === 'approved') {
            return NextResponse.json(
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

    // 5. Perform Upsert
    const { error } = await adminClient
        .from('admin_users')
        .upsert(upsertPayload, { onConflict: 'auth_user_id' })

    if (error) {
        console.error('Register Admin Error:', error);
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
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

    return NextResponse.json({ success: true });
}
