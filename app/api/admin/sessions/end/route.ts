import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedAdmin } from '@/lib/admin-guard'
import { logAdminAudit } from '@/lib/admin-audit'

export async function POST(req: NextRequest) {
    // 1. Auth Check
    const ctx = await requireApprovedAdmin(req)

    if (ctx instanceof NextResponse) {
        return ctx
    }

    const { user, supabaseAdminClient } = ctx

    // 2. Parse Body
    let body
    try {
        body = await req.json()
    } catch {
        // Can be optional if no body, but we need session_id
        return NextResponse.json(
            { error: 'BadRequest', message: 'Invalid JSON' },
            { status: 400 }
        )
    }

    const { session_id } = body
    if (!session_id) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'session_id required' },
            { status: 400 }
        )
    }

    // 3. Update Session Logout Time
    // Only update if it belongs to this user
    const logoutAt = new Date().toISOString()
    const { error } = await supabaseAdminClient
        .from('admin_sessions')
        .update({
            logout_at: logoutAt
        })
        .eq('id', session_id)
        .eq('admin_auth_user_id', user.id)

    if (error) {
        console.error('Session End Error:', error)
        return NextResponse.json(
            { error: 'DatabaseError', message: 'Gagal mengakhiri sesi' },
            { status: 500 }
        )
    }

    await logAdminAudit({
        supabaseAdminClient,
        actorAuthUserId: user.id,
        action: 'ADMIN_LOGOUT',
        tableName: 'admin_sessions',
        recordId: session_id,
        oldData: null,
        newData: {
            id: session_id,
            logout_at: logoutAt,
        },
        request: req,
    })

    return NextResponse.json({ success: true })
}
