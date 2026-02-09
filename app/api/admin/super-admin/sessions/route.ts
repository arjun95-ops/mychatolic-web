import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedAdmin } from '@/lib/admin-guard'
import { normalizeLower } from '@/lib/admin-constants'
import { resolveActorMap } from '@/lib/admin-actors'

export const dynamic = 'force-dynamic'

function parsePositiveInt(value: string | null, fallback: number): number {
    const num = Number(value)
    if (!Number.isFinite(num) || num < 1) return fallback
    return Math.floor(num)
}

function parseIsoDate(value: string | null): string | null {
    if (!value) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toISOString()
}

export async function GET(req: NextRequest) {
    const ctx = await requireApprovedAdmin(req, 'super_admin')
    if (ctx instanceof NextResponse) return ctx

    const { supabaseAdminClient: adminClient } = ctx
    const searchParams = req.nextUrl.searchParams

    const page = parsePositiveInt(searchParams.get('page'), 1)
    const limit = Math.min(parsePositiveInt(searchParams.get('limit'), 20), 100)
    const q = normalizeLower(searchParams.get('q') || '')
    const status = normalizeLower(searchParams.get('status') || 'all')
    const from = parseIsoDate(searchParams.get('from'))
    const to = parseIsoDate(searchParams.get('to'))

    let query = adminClient
        .from('admin_sessions')
        .select('*')
        .order('login_at', { ascending: false })

    if (from) {
        query = query.gte('login_at', from)
    }
    if (to) {
        query = query.lte('login_at', to)
    }

    if (status === 'active') {
        query = query.is('logout_at', null)
    } else if (status === 'closed') {
        query = query.not('logout_at', 'is', null)
    }

    const { data: rows, error } = await query
    if (error) {
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        )
    }

    const rawRows = (rows || []) as Array<Record<string, unknown>>
    const actorIds = rawRows.map((row) => String(row.admin_auth_user_id || ''))
    const actorMap = await resolveActorMap(adminClient, actorIds)

    const enriched = rawRows.map((row) => {
        const actorId = String(row.admin_auth_user_id || '')
        const actor = actorMap.get(actorId)
        const headers = row.request_headers && typeof row.request_headers === 'object'
            ? (row.request_headers as Record<string, unknown>)
            : {}
        const ip =
            String(headers.ip || '') ||
            String(headers['x-real-ip'] || '') ||
            String(headers['x-forwarded-for'] || '').split(',')[0].trim()
        const userAgent = String(headers.user_agent || headers['user-agent'] || '')

        const loginRaw = row.login_at
        const logoutRaw = row.logout_at
        const loginAt =
            typeof loginRaw === 'string' || typeof loginRaw === 'number' || loginRaw instanceof Date
                ? new Date(loginRaw)
                : null
        const logoutAt =
            typeof logoutRaw === 'string' || typeof logoutRaw === 'number' || logoutRaw instanceof Date
                ? new Date(logoutRaw)
                : null
        const durationSeconds =
            loginAt && !Number.isNaN(loginAt.getTime())
                ? Math.max(
                      0,
                      Math.floor(
                          ((logoutAt && !Number.isNaN(logoutAt.getTime())
                              ? logoutAt.getTime()
                              : Date.now()) - loginAt.getTime()) /
                              1000
                      )
                  )
                : 0

        return {
            id: row.id,
            admin_auth_user_id: actorId,
            email: actor?.email || '',
            full_name: actor?.full_name || '',
            role: actor?.role || '',
            status: actor?.status || '',
            login_at: row.login_at,
            logout_at: row.logout_at,
            is_active: !logoutRaw,
            duration_seconds: durationSeconds,
            ip: ip || '-',
            user_agent: userAgent || '-',
        }
    })

    const filtered = enriched.filter((row) => {
        if (!q) return true
        const haystack = `${row.email} ${row.full_name} ${row.role} ${row.ip} ${row.user_agent}`.toLowerCase()
        return haystack.includes(q)
    })

    const totalItems = filtered.length
    const totalPages = Math.max(1, Math.ceil(totalItems / limit))
    const safePage = Math.min(Math.max(1, page), totalPages)
    const fromIndex = (safePage - 1) * limit
    const items = filtered.slice(fromIndex, fromIndex + limit)

    return NextResponse.json({
        page: safePage,
        limit,
        total_items: totalItems,
        total_pages: totalPages,
        data: items,
    })
}
