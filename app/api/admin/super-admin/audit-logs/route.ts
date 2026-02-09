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
    const action = normalizeLower(searchParams.get('action') || '')
    const table = normalizeLower(searchParams.get('table') || '')
    const from = parseIsoDate(searchParams.get('from'))
    const to = parseIsoDate(searchParams.get('to'))

    let query = adminClient
        .from('audit_logs')
        .select('*')
        .order('occurred_at', { ascending: false })

    if (from) {
        query = query.gte('occurred_at', from)
    }
    if (to) {
        query = query.lte('occurred_at', to)
    }
    if (action) {
        query = query.ilike('action', `%${action}%`)
    }
    if (table) {
        query = query.ilike('table_name', `%${table}%`)
    }

    const { data: rows, error } = await query
    if (error) {
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        )
    }

    const rawRows = (rows || []) as Array<Record<string, unknown>>
    const actorIds = rawRows.map((row) => String(row.actor_auth_user_id || ''))
    const actorMap = await resolveActorMap(adminClient, actorIds)

    const enriched = rawRows.map((row) => {
        const actorId = String(row.actor_auth_user_id || '')
        const actor = actorMap.get(actorId)
        return {
            id: row.id,
            action: row.action || '',
            table_name: row.table_name || '',
            record_id: row.record_id || '',
            actor_auth_user_id: actorId,
            actor_email: actor?.email || '',
            actor_full_name: actor?.full_name || '',
            actor_role: actor?.role || '',
            occurred_at: row.occurred_at || null,
            old_data: row.old_data || null,
            new_data: row.new_data || null,
            request_headers: row.request_headers || null,
        }
    })

    const filtered = enriched.filter((row) => {
        if (!q) return true
        const haystack = `${row.action} ${row.table_name} ${row.record_id} ${row.actor_email} ${row.actor_full_name}`.toLowerCase()
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
