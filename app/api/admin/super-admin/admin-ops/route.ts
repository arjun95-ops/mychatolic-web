import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedAdmin } from '@/lib/admin-guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    // 1. Auth Check: Super Admin Only
    const ctx = await requireApprovedAdmin(req, 'super_admin')

    // Handle Auth Errors (401/403)
    if (ctx instanceof NextResponse) {
        return ctx
    }

    const { supabaseAdminClient: adminClient } = ctx

    // 2. Parse Query Params
    const url = new URL(req.url)
    const statusParam = url.searchParams.get('status') || 'pending_approval'

    // 3. Build Query
    let query = adminClient
        .from('admin_users')
        .select('*')
        .eq('role', 'admin_ops') // Only list admin_ops, assume super_admin manages admin_ops
        .order('created_at', { ascending: false })

    if (statusParam && statusParam !== 'all') {
        query = query.eq('status', statusParam)
    }

    const { data, error } = await query

    if (error) {
        console.error('Fetch Admin Ops Error:', error)
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        )
    }

    return NextResponse.json({ data })
}
