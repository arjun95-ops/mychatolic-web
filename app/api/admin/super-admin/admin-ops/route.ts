import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedAdmin } from '@/lib/admin-guard'
import { normalizeLower, parseAdminRole, parseAdminStatus } from '@/lib/admin-constants'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    // 1. Auth Check: Super Admin Only
    const ctx = await requireApprovedAdmin(req, 'super_admin')

    // Handle Auth Errors (401/403)
    if (ctx instanceof NextResponse) {
        return ctx
    }

    const { supabaseAdminClient: adminClient } = ctx

    const { user: actor } = ctx

    // 2. Parse Query Params
    const url = new URL(req.url)
    const statusParam = parseAdminStatus(url.searchParams.get('status') || '') || null
    const roleParam = parseAdminRole(url.searchParams.get('role') || '') || null
    const queryParam = normalizeLower(url.searchParams.get('q') || '')

    // 3. Build Query
    let query = adminClient
        .from('admin_users')
        .select('*')
        .order('created_at', { ascending: false })

    if (statusParam) {
        query = query.eq('status', statusParam)
    }
    if (roleParam) {
        query = query.eq('role', roleParam)
    }

    const { data, error } = await query

    if (error) {
        console.error('Fetch Admin Ops Error:', error)
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        )
    }

    const rows = (data || []) as Array<Record<string, unknown>>
    const items = rows.filter((row) => {
        if (!queryParam) return true
        const haystack = `${row.full_name || ''} ${row.email || ''} ${row.role || ''} ${row.status || ''}`.toLowerCase()
        return haystack.includes(queryParam)
    })

    const { count: approvedSuperAdminsCount, error: approvedCountError } = await adminClient
        .from('admin_users')
        .select('auth_user_id', { count: 'exact', head: true })
        .eq('role', 'super_admin')
        .eq('status', 'approved')

    if (approvedCountError) {
        return NextResponse.json(
            { error: 'DatabaseError', message: approvedCountError.message },
            { status: 500 }
        )
    }

    const approvedSuperAdmins = approvedSuperAdminsCount || 0

    const mapped = items.map((row) => {
        const isSelf = String(row.auth_user_id || '') === String(actor.id || '')
        const isSuperAdmin = row.role === 'super_admin'
        const isLastSuperAdmin = isSuperAdmin && row.status === 'approved' && approvedSuperAdmins <= 1

        return {
            ...row,
            is_self: isSelf,
            is_last_super_admin: isLastSuperAdmin,
        }
    })

    return NextResponse.json({ data: mapped })
}
