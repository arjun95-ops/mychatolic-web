import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedAdmin } from '@/lib/admin-guard'
import { parseAdminRole } from '@/lib/admin-constants'
import { logAdminAudit } from '@/lib/admin-audit'
import { ensureAdminEmailExclusive } from '@/lib/admin-email-exclusivity'

export async function POST(req: NextRequest) {
    // 1. Auth Check: Super Admin Only
    const ctx = await requireApprovedAdmin(req, 'super_admin')

    if (ctx instanceof NextResponse) {
        return ctx
    }

    const { user: currentUser, supabaseAdminClient: adminClient } = ctx

    // 2. Parse Body
    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: 'BadRequest', message: 'Invalid JSON' },
            { status: 400 }
        )
    }

    const { auth_user_id, role: roleInput } = body
    const role = parseAdminRole(roleInput || '')

    if (!auth_user_id || !role) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'auth_user_id dan role (super_admin/admin_ops) wajib diisi' },
            { status: 400 }
        )
    }

    const { data: targetAdmin, error: targetError } = await adminClient
        .from('admin_users')
        .select('*')
        .eq('auth_user_id', auth_user_id)
        .maybeSingle()

    if (targetError) {
        return NextResponse.json(
            { error: 'DatabaseError', message: targetError.message },
            { status: 500 }
        )
    }

    if (!targetAdmin) {
        return NextResponse.json(
            { error: 'NotFound', message: 'Data admin target tidak ditemukan.' },
            { status: 404 }
        )
    }

    if (targetAdmin.status === 'approved' && targetAdmin.role === role) {
        return NextResponse.json(
            { error: 'Conflict', message: 'Admin sudah approved dengan role yang sama.' },
            { status: 409 }
        )
    }

    // wajib email verified sebelum bisa di-approve
    const { data: authData, error: authError } = await adminClient.auth.admin.getUserById(auth_user_id)
    if (authError || !authData?.user) {
        return NextResponse.json(
            { error: 'AuthError', message: 'Gagal membaca data auth target admin.' },
            { status: 400 }
        )
    }
    const emailVerified = Boolean(authData.user.email_confirmed_at || authData.user.confirmed_at)
    if (!emailVerified) {
        return NextResponse.json(
            { error: 'Forbidden', message: 'Target admin belum verifikasi email.' },
            { status: 403 }
        )
    }

    try {
        await ensureAdminEmailExclusive({
            supabaseAdminClient: adminClient,
            authUserId: auth_user_id,
            email: String(authData.user.email || targetAdmin.email || ''),
        })
    } catch (exclusivityError: unknown) {
        const message =
            exclusivityError instanceof Error
                ? exclusivityError.message
                : 'Gagal menerapkan aturan email eksklusif admin.'
        return NextResponse.json(
            { error: 'DatabaseError', message },
            { status: 500 }
        )
    }

    const updatePayload = {
        role,
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: currentUser.id,
        updated_at: new Date().toISOString(),
    }

    // 3. Update Status + Role
    const { data: updated, error } = await adminClient
        .from('admin_users')
        .update(updatePayload)
        .eq('auth_user_id', auth_user_id)
        .select('*')
        .single()

    if (error) {
        console.error('Approve Admin Error:', error)
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        )
    }

    await logAdminAudit({
        supabaseAdminClient: adminClient,
        actorAuthUserId: currentUser.id,
        action: 'APPROVE_ADMIN',
        tableName: 'admin_users',
        recordId: auth_user_id,
        oldData: targetAdmin,
        newData: updated || updatePayload,
        request: req,
        extra: { approved_role: role },
    })

    return NextResponse.json({ success: true, data: updated })
}
