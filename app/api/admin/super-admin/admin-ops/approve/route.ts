import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedAdmin, supabaseAdminClient } from '@/lib/admin-guard'

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

    const { auth_user_id } = body

    if (!auth_user_id) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'auth_user_id required' },
            { status: 400 }
        )
    }

    // 3. Update Status
    const { error } = await adminClient
        .from('admin_users')
        .update({
            status: 'approved',
            approved_at: new Date().toISOString(),
            approved_by: currentUser.id
        })
        .eq('auth_user_id', auth_user_id)
        .eq('role', 'admin_ops') // Safety: only approve admin_ops, not other super_admins or random accounts

    if (error) {
        console.error('Approve Admin Error:', error)
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        )
    }

    return NextResponse.json({ success: true })
}
