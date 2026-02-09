import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedAdmin } from '@/lib/admin-guard'
import { DEFAULT_TIMEZONE, safeTimeZone } from '@/lib/admin-constants'
import { getNextRunAt, validateCronExpression } from '@/lib/admin-schedule'
import { logAdminAudit } from '@/lib/admin-audit'

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

function handleMissingScheduleTable(error: unknown) {
    const code = getPostgresErrorCode(error)
    const message = getPostgresErrorMessage(error)
    if (code === '42501' || /permission denied/i.test(message)) {
        return NextResponse.json(
            {
                error: 'PermissionError',
                message:
                    'Akses ke tabel admin_backup_schedules ditolak untuk service role. Jalankan GRANT pada migration RBAC.',
            },
            { status: 500 }
        )
    }

    if (code === '42P01') {
        return NextResponse.json(
            {
                error: 'SchemaError',
                message: 'Tabel admin_backup_schedules belum tersedia. Jalankan migration backup scheduler terlebih dahulu.',
            },
            { status: 500 }
        )
    }
    return null
}

export async function GET(req: NextRequest) {
    const ctx = await requireApprovedAdmin(req, 'super_admin')
    if (ctx instanceof NextResponse) return ctx

    const { supabaseAdminClient: adminClient } = ctx
    const activeOnly = req.nextUrl.searchParams.get('active') === '1'

    let query = adminClient
        .from('admin_backup_schedules')
        .select('*')
        .order('created_at', { ascending: false })
    if (activeOnly) {
        query = query.eq('is_active', true)
    }

    const { data, error } = await query
    if (error) {
        const missing = handleMissingScheduleTable(error)
        if (missing) return missing
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        )
    }

    return NextResponse.json({ data: data || [] })
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

    const parsedBody = body && typeof body === 'object'
        ? (body as {
            id?: unknown
            name?: unknown
            cron_expression?: unknown
            timezone?: unknown
            channels?: unknown
            is_active?: unknown
        })
        : {}
    const scheduleId = String(parsedBody.id || '').trim()
    const name = String(parsedBody.name || '').trim()
    const cronExpression = String(parsedBody.cron_expression || '').trim()
    const timezone = safeTimeZone(parsedBody.timezone || DEFAULT_TIMEZONE, DEFAULT_TIMEZONE)
    const channelsRaw = Array.isArray(parsedBody.channels) ? parsedBody.channels : ['in_app', 'email']
    const channelsParsed = channelsRaw
        .map((item: unknown) => String(item || '').trim().toLowerCase())
        .filter((item: string) => item === 'in_app' || item === 'email')
    const channels = channelsParsed.length > 0 ? channelsParsed : ['in_app']
    const isActive = parsedBody.is_active !== false

    if (!name) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'Nama jadwal wajib diisi.' },
            { status: 400 }
        )
    }

    const cronValidation = validateCronExpression(cronExpression)
    if (!cronValidation.valid) {
        return NextResponse.json(
            { error: 'ValidationError', message: cronValidation.error || 'Cron expression tidak valid.' },
            { status: 400 }
        )
    }

    let nextRunAt: Date
    try {
        nextRunAt = getNextRunAt({
            cronExpression,
            timezone,
            fromDate: new Date(),
        })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Gagal menghitung next run.'
        return NextResponse.json(
            { error: 'ValidationError', message },
            { status: 400 }
        )
    }

    const nowIso = new Date().toISOString()
    const payload = {
        name,
        cron_expression: cronExpression,
        timezone,
        channels,
        is_active: isActive,
        next_run_at: nextRunAt.toISOString(),
        updated_by: user.id,
        updated_at: nowIso,
        ...(scheduleId
            ? {}
            : {
                  created_by: user.id,
                  created_at: nowIso,
              }),
    }

    let oldRow: Record<string, unknown> | null = null
    if (scheduleId) {
        const { data: existing } = await adminClient
            .from('admin_backup_schedules')
            .select('*')
            .eq('id', scheduleId)
            .maybeSingle()
        oldRow = existing
    }

    const mutation = scheduleId
        ? adminClient.from('admin_backup_schedules').update(payload).eq('id', scheduleId)
        : adminClient.from('admin_backup_schedules').insert(payload)

    const { data, error } = await mutation.select('*').single()
    if (error) {
        const missing = handleMissingScheduleTable(error)
        if (missing) return missing
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        )
    }

    await logAdminAudit({
        supabaseAdminClient: adminClient,
        actorAuthUserId: user.id,
        action: scheduleId ? 'UPDATE_BACKUP_SCHEDULE' : 'CREATE_BACKUP_SCHEDULE',
        tableName: 'admin_backup_schedules',
        recordId: String(data?.id || scheduleId || ''),
        oldData: oldRow,
        newData: data || payload,
        request: req,
    })

    return NextResponse.json({ success: true, data })
}

export async function DELETE(req: NextRequest) {
    const ctx = await requireApprovedAdmin(req, 'super_admin')
    if (ctx instanceof NextResponse) return ctx

    const { user, supabaseAdminClient: adminClient } = ctx
    const scheduleId = String(req.nextUrl.searchParams.get('id') || '').trim()
    if (!scheduleId) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'Query parameter id wajib diisi.' },
            { status: 400 }
        )
    }

    const { data: existing, error: existingError } = await adminClient
        .from('admin_backup_schedules')
        .select('*')
        .eq('id', scheduleId)
        .maybeSingle()

    if (existingError) {
        const missing = handleMissingScheduleTable(existingError)
        if (missing) return missing
        return NextResponse.json(
            { error: 'DatabaseError', message: existingError.message },
            { status: 500 }
        )
    }

    if (!existing) {
        return NextResponse.json(
            { error: 'NotFound', message: 'Jadwal backup tidak ditemukan.' },
            { status: 404 }
        )
    }

    const { error } = await adminClient
        .from('admin_backup_schedules')
        .delete()
        .eq('id', scheduleId)

    if (error) {
        const missing = handleMissingScheduleTable(error)
        if (missing) return missing
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        )
    }

    await logAdminAudit({
        supabaseAdminClient: adminClient,
        actorAuthUserId: user.id,
        action: 'DELETE_BACKUP_SCHEDULE',
        tableName: 'admin_backup_schedules',
        recordId: scheduleId,
        oldData: existing,
        newData: { deleted: true },
        request: req,
    })

    return NextResponse.json({ success: true })
}
