import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedAdmin } from '@/lib/admin-guard'
import { parseAdminRole } from '@/lib/admin-constants'
import { logAdminAudit } from '@/lib/admin-audit'
import { ensureAdminEmailExclusive } from '@/lib/admin-email-exclusivity'

export async function POST(req: NextRequest) {
    const ctx = await requireApprovedAdmin(req, 'super_admin')
    if (ctx instanceof NextResponse) return ctx

    const { user: currentUser, supabaseAdminClient: adminClient } = ctx

    let body: unknown
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: 'BadRequest', message: 'Invalid JSON' },
            { status: 400 }
        )
    }

    const parsedBody = body && typeof body === 'object'
        ? (body as { auth_user_id?: unknown; role?: unknown })
        : {}
    const authUserId = String(parsedBody.auth_user_id || '').trim()
    const nextRole = parsedBody.role ? parseAdminRole(parsedBody.role) : null

    if (!authUserId) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'auth_user_id required' },
            { status: 400 }
        )
    }

    if (parsedBody.role && !nextRole) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'role harus super_admin atau admin_ops' },
            { status: 400 }
        )
    }

    const { data: targetAdmin, error: targetError } = await adminClient
        .from('admin_users')
        .select('*')
        .eq('auth_user_id', authUserId)
        .maybeSingle()

    if (targetError) {
        return NextResponse.json(
            { error: 'DatabaseError', message: targetError.message },
            { status: 500 }
        )
    }

    if (!targetAdmin) {
        return NextResponse.json(
            { error: 'NotFound', message: 'Admin target tidak ditemukan.' },
            { status: 404 }
        )
    }

    const { data: authData, error: authError } = await adminClient.auth.admin.getUserById(authUserId)
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
            authUserId: authUserId,
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
        status: 'approved',
        role: nextRole || targetAdmin.role,
        updated_at: new Date().toISOString(),
    }

    const { data: updated, error } = await adminClient
        .from('admin_users')
        .update(updatePayload)
        .eq('auth_user_id', authUserId)
        .select('*')
        .single()

    if (error) {
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        )
    }

    await logAdminAudit({
        supabaseAdminClient: adminClient,
        actorAuthUserId: currentUser.id,
        action: 'REACTIVATE_ADMIN',
        tableName: 'admin_users',
        recordId: authUserId,
        oldData: targetAdmin,
        newData: updated || updatePayload,
        request: req,
        extra: { role: updatePayload.role },
    })

    return NextResponse.json({ success: true, data: updated })
}
