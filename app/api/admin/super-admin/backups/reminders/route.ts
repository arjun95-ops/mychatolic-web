import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedAdmin } from '@/lib/admin-guard'

export const dynamic = 'force-dynamic'

function getPostgresErrorCode(error: unknown): string {
    if (!error || typeof error !== 'object') return ''
    const code = (error as { code?: unknown }).code
    return typeof code === 'string' ? code : ''
}

function getPostgresErrorMessage(error: unknown): string {
    if (!error || typeof error !== 'object') return ''
    const message = (error as { message?: unknown }).message
    return typeof message === 'string' ? message : ''
}

function handleMissingReminderTable(error: unknown) {
    const code = getPostgresErrorCode(error)
    const message = getPostgresErrorMessage(error)
    if (code === '42501' || /permission denied/i.test(message)) {
        return NextResponse.json(
            {
                error: 'PermissionError',
                message:
                    'Akses ke tabel admin_backup_reminders ditolak untuk service role. Jalankan GRANT pada migration RBAC.',
            },
            { status: 500 }
        )
    }

    if (code === '42P01') {
        return NextResponse.json(
            {
                error: 'SchemaError',
                message: 'Tabel admin_backup_reminders belum tersedia. Jalankan migration backup scheduler terlebih dahulu.',
            },
            { status: 500 }
        )
    }
    return null
}

export async function GET(req: NextRequest) {
    const ctx = await requireApprovedAdmin(req, 'super_admin')
    if (ctx instanceof NextResponse) return ctx

    const { user, supabaseAdminClient: adminClient } = ctx
    const onlyUnread = req.nextUrl.searchParams.get('unread') === '1'

    let query = adminClient
        .from('admin_backup_reminders')
        .select('*')
        .eq('recipient_auth_user_id', user.id)
        .order('reminder_at', { ascending: false })
        .limit(200)

    if (onlyUnread) {
        query = query.eq('is_read', false)
    }

    const { data, error } = await query
    if (error) {
        const missing = handleMissingReminderTable(error)
        if (missing) return missing
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        )
    }

    const rows = (data || []) as Array<Record<string, unknown>>
    const unreadCount = rows.filter((item) => !item.is_read).length

    return NextResponse.json({
        unread_count: unreadCount,
        data: rows,
    })
}

export async function POST(req: NextRequest) {
    const ctx = await requireApprovedAdmin(req, 'super_admin')
    if (ctx instanceof NextResponse) return ctx

    const { user, supabaseAdminClient: adminClient } = ctx

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
        body && typeof body === 'object' ? (body as { id?: unknown; mark_read?: unknown }) : {}
    const reminderId = String(parsedBody.id || '').trim()
    const markRead = parsedBody.mark_read !== false
    if (!reminderId) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'id reminder wajib diisi' },
            { status: 400 }
        )
    }

    const { data, error } = await adminClient
        .from('admin_backup_reminders')
        .update({
            is_read: markRead,
            read_at: markRead ? new Date().toISOString() : null,
        })
        .eq('id', reminderId)
        .eq('recipient_auth_user_id', user.id)
        .select('*')
        .maybeSingle()

    if (error) {
        const missing = handleMissingReminderTable(error)
        if (missing) return missing
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        )
    }

    return NextResponse.json({ success: true, data })
}
