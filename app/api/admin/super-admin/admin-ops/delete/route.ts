import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedAdmin } from '@/lib/admin-guard'
import { logAdminAudit } from '@/lib/admin-audit'
import type { SupabaseClient } from '@supabase/supabase-js'

async function forceLogoutAdmin(supabaseAdminClient: SupabaseClient, authUserId: string) {
    const nowIso = new Date().toISOString()
    await supabaseAdminClient
        .from('admin_sessions')
        .update({ logout_at: nowIso })
        .eq('admin_auth_user_id', authUserId)
        .is('logout_at', null)

    try {
        const authAdminApi = supabaseAdminClient.auth.admin as {
            signOut: (userId: string, scope?: 'global' | 'local' | 'others') => Promise<unknown>
        }
        await authAdminApi.signOut(authUserId, 'global')
    } catch {
        // Best effort.
    }
}

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
        body && typeof body === 'object' ? (body as { auth_user_id?: unknown }) : {}
    const authUserId = String(parsedBody.auth_user_id || '').trim()
    if (!authUserId) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'auth_user_id required' },
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

    if (targetAdmin.role === 'super_admin') {
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
                { error: 'Forbidden', message: 'Tidak bisa menghapus Super Admin terakhir.' },
                { status: 403 }
            )
        }
    }

    if (authUserId === String(currentUser.id)) {
        const { count: approvedSuperAdmins } = await adminClient
            .from('admin_users')
            .select('auth_user_id', { count: 'exact', head: true })
            .eq('role', 'super_admin')
            .eq('status', 'approved')
        if ((approvedSuperAdmins || 0) <= 1) {
            return NextResponse.json(
                { error: 'Forbidden', message: 'Anda tidak bisa menghapus diri sendiri sebagai Super Admin terakhir.' },
                { status: 403 }
            )
        }
    }

    const { error } = await adminClient
        .from('admin_users')
        .delete()
        .eq('auth_user_id', authUserId)

    if (error) {
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        )
    }

    await forceLogoutAdmin(adminClient, authUserId)

    await logAdminAudit({
        supabaseAdminClient: adminClient,
        actorAuthUserId: currentUser.id,
        action: 'DELETE_ADMIN',
        tableName: 'admin_users',
        recordId: authUserId,
        oldData: targetAdmin,
        newData: { deleted: true, deleted_at: new Date().toISOString() },
        request: req,
    })

    return NextResponse.json({ success: true })
}
