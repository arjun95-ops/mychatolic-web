import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedAdmin } from '@/lib/admin-guard'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    // 1. Auth Check
    const ctx = await requireApprovedAdmin(req)

    if (ctx instanceof NextResponse) {
        return ctx
    }

    const { user, supabaseAdminClient } = ctx

    // 2. Capture Headers
    const requestHeaders: Record<string, string> = {}
    req.headers.forEach((value, key) => {
        // Filter out sensitive headers if necessary, but capturing all is useful for audit
        requestHeaders[key] = value
    })

    // 3. Insert Session
    const { data, error } = await supabaseAdminClient
        .from('admin_sessions')
        .insert({
            admin_auth_user_id: user.id,
            request_headers: requestHeaders,
            // created_at is usually default now()
            // logout_at is null
        })
        .select('id')
        .single()

    if (error) {
        console.error('Session Start Error:', error)
        return NextResponse.json(
            { error: 'DatabaseError', message: 'Gagal memulai sesi' },
            { status: 500 }
        )
    }

    return NextResponse.json({ session_id: data.id })
}
