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

    const parsedBody =
        body && typeof body === 'object' ? (body as { auth_user_id?: unknown; role?: unknown }) : {}
    const authUserId = String(parsedBody.auth_user_id || '').trim()
    const nextRole = parseAdminRole(parsedBody.role || '')

    if (!authUserId || !nextRole) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'auth_user_id dan role wajib diisi' },
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

    if (targetAdmin.role === nextRole) {
        return NextResponse.json(
            { error: 'Conflict', message: 'Role target sudah sesuai.' },
            { status: 409 }
        )
    }

    if (targetAdmin.role === 'super_admin' && nextRole !== 'super_admin' && targetAdmin.status === 'approved') {
        const { count: approvedSuperAdmins, error: countError } = await adminClient
            .from('admin_users')
            .select('auth_user_id', { count: 'exact', head: true })
            .eq('role', 'super_admin')
            .eq('status', 'approved')

        if (countError) {
            return NextResponse.json(
                { error: 'DatabaseError', message: countError.message },
                { status: 500 }
            )
        }

        if ((approvedSuperAdmins || 0) <= 1) {
            return NextResponse.json(
                { error: 'Forbidden', message: 'Tidak bisa ubah role Super Admin terakhir.' },
                { status: 403 }
            )
        }
    }

    try {
        await ensureAdminEmailExclusive({
            supabaseAdminClient: adminClient,
            authUserId: authUserId,
            email: String(targetAdmin.email || ''),
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
        role: nextRole,
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
        action: 'UPDATE_ADMIN_ROLE',
        tableName: 'admin_users',
        recordId: authUserId,
        oldData: targetAdmin,
        newData: updated || updatePayload,
        request: req,
        extra: { new_role: nextRole },
    })

    return NextResponse.json({ success: true, data: updated })
}
