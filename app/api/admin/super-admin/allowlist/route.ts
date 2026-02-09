import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedAdmin } from '@/lib/admin-guard'
import { normalizeLower } from '@/lib/admin-constants'
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

function handleAllowlistAccessError(error: unknown) {
    const code = getPostgresErrorCode(error)
    const message = getPostgresErrorMessage(error)
    if (code === '42501' || /permission denied/i.test(message)) {
        return NextResponse.json(
            {
                error: 'PermissionError',
                message:
                    'Akses ke tabel admin_email_allowlist ditolak untuk service role. Jalankan GRANT pada migration RBAC.',
            },
            { status: 500 }
        )
    }

    if (code === '42P01') {
        return NextResponse.json(
            {
                error: 'SchemaError',
                message: 'Tabel admin_email_allowlist belum tersedia. Jalankan migration RBAC terlebih dahulu.',
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
    const q = normalizeLower(req.nextUrl.searchParams.get('q') || '')

    const { data, error } = await adminClient
        .from('admin_email_allowlist')
        .select('*')
        .order('added_at', { ascending: false })

    if (error) {
        const access = handleAllowlistAccessError(error)
        if (access) return access
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        )
    }

    const rows = (data || []) as Array<Record<string, unknown>>
    const items = rows.filter((row) => {
        if (!q) return true
        const haystack = `${row.email || ''} ${row.note || ''}`.toLowerCase()
        return haystack.includes(q)
    })

    return NextResponse.json({ data: items })
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
        body && typeof body === 'object' ? (body as { email?: unknown; note?: unknown }) : {}
    const email = normalizeLower(parsedBody.email || '')
    const note = String(parsedBody.note || '').trim()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'Email allowlist tidak valid.' },
            { status: 400 }
        )
    }

    const upsertPayload = {
        email,
        note: note || null,
        added_by: user.id,
        added_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }

    const { data, error } = await adminClient
        .from('admin_email_allowlist')
        .upsert(upsertPayload, { onConflict: 'email' })
        .select('*')
        .single()

    if (error) {
        const access = handleAllowlistAccessError(error)
        if (access) return access
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        )
    }

    await logAdminAudit({
        supabaseAdminClient: adminClient,
        actorAuthUserId: user.id,
        action: 'UPSERT_ADMIN_ALLOWLIST_EMAIL',
        tableName: 'admin_email_allowlist',
        recordId: email,
        oldData: null,
        newData: data || upsertPayload,
        request: req,
    })

    return NextResponse.json({ success: true, data })
}

export async function DELETE(req: NextRequest) {
    const ctx = await requireApprovedAdmin(req, 'super_admin')
    if (ctx instanceof NextResponse) return ctx

    const { user, supabaseAdminClient: adminClient } = ctx

    const email = normalizeLower(req.nextUrl.searchParams.get('email') || '')
    if (!email) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'Query parameter email wajib diisi.' },
            { status: 400 }
        )
    }

    const { data: existing, error: existingError } = await adminClient
        .from('admin_email_allowlist')
        .select('*')
        .eq('email', email)
        .maybeSingle()

    if (existingError) {
        const access = handleAllowlistAccessError(existingError)
        if (access) return access
        return NextResponse.json(
            { error: 'DatabaseError', message: existingError.message },
            { status: 500 }
        )
    }

    if (!existing) {
        return NextResponse.json(
            { error: 'NotFound', message: 'Email allowlist tidak ditemukan.' },
            { status: 404 }
        )
    }

    const { error } = await adminClient
        .from('admin_email_allowlist')
        .delete()
        .eq('email', email)

    if (error) {
        const access = handleAllowlistAccessError(error)
        if (access) return access
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        )
    }

    await logAdminAudit({
        supabaseAdminClient: adminClient,
        actorAuthUserId: user.id,
        action: 'DELETE_ADMIN_ALLOWLIST_EMAIL',
        tableName: 'admin_email_allowlist',
        recordId: email,
        oldData: existing,
        newData: { deleted: true },
        request: req,
    })

    return NextResponse.json({ success: true })
}
