import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedAdmin } from '@/lib/admin-guard'
import { logAdminAudit } from '@/lib/admin-audit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    // 1. Auth Check
    const ctx = await requireApprovedAdmin(req)

    if (ctx instanceof NextResponse) {
        return ctx
    }

    const { user, supabaseAdminClient } = ctx

    // 2. Capture Metadata
    const ip =
        req.headers.get('x-real-ip') ||
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        ''
    const userAgent = req.headers.get('user-agent') || ''
    const requestHeaders = {
        ip,
        user_agent: userAgent,
        referer: req.headers.get('referer') || '',
        origin: req.headers.get('origin') || '',
    }

    const loginAt = new Date().toISOString()

    // 3. Insert Session with compatibility fallback
    let sessionId = ''
    const modernInsert = await supabaseAdminClient
        .from('admin_sessions')
        .insert({
            admin_auth_user_id: user.id,
            login_at: loginAt,
            ip,
            user_agent: userAgent,
            request_headers: requestHeaders,
        })
        .select('id')
        .single()

    if (!modernInsert.error && modernInsert.data?.id) {
        sessionId = modernInsert.data.id
    } else {
        const legacyInsert = await supabaseAdminClient
            .from('admin_sessions')
            .insert({
                admin_auth_user_id: user.id,
                login_at: loginAt,
                request_headers: requestHeaders,
            })
            .select('id')
            .single()

        if (legacyInsert.error || !legacyInsert.data?.id) {
            console.error('Session Start Error:', modernInsert.error || legacyInsert.error)
            return NextResponse.json(
                { error: 'DatabaseError', message: 'Gagal memulai sesi' },
                { status: 500 }
            )
        }
        sessionId = legacyInsert.data.id
    }

    await logAdminAudit({
        supabaseAdminClient,
        actorAuthUserId: user.id,
        action: 'ADMIN_LOGIN',
        tableName: 'admin_sessions',
        recordId: sessionId,
        oldData: null,
        newData: {
            admin_auth_user_id: user.id,
            login_at: loginAt,
            ip,
            user_agent: userAgent,
        },
        request: req,
    })

    return NextResponse.json({ session_id: sessionId })
}
