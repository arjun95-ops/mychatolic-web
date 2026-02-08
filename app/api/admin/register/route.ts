import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, createSupabaseAdminClient } from '@/lib/admin-guard'

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
    } catch (e) {
        return NextResponse.json({ error: 'BadRequest', message: 'Invalid JSON' }, { status: 400 });
    }

    const { full_name } = body;

    if (!full_name || typeof full_name !== 'string' || full_name.trim().length === 0) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'full_name wajib diisi' },
            { status: 400 }
        );
    }

    // Initialize Admin Client with Actor (User) Context for Audit
    const adminClient = createSupabaseAdminClient(user.id);

    // 3. Upsert to admin_users
    // We check if the user is already a super_admin to prevent accidental overwrite/downgrade via this endpoint.
    const { data: existingAdmin, error: fetchError } = await adminClient
        .from('admin_users')
        .select('role')
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
        // If they are admin_ops or other status, update is generally okay here (e.g. re-apply after suspension?)
        // Or if they are pending, update name? Allowed.
    }

    // Perform Upsert
    const { error } = await adminClient
        .from('admin_users')
        .upsert({
            auth_user_id: user.id,
            email: user.email,
            full_name: full_name,
            role: 'admin_ops',
            status: 'pending_approval',
            approved_at: null,
            approved_by: null,
            created_at: new Date().toISOString(), // Ensure created_at is set for new rows? Upsert might use default if omitted on insert, but explicit is fine.
        }, { onConflict: 'auth_user_id' })

    if (error) {
        console.error('Register Admin Error:', error);
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        );
    }

    return NextResponse.json({ success: true });
}
