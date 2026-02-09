import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedAdmin } from '@/lib/admin-guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const ctx = await requireApprovedAdmin(req, 'super_admin')
    if (ctx instanceof NextResponse) return ctx

    const { supabaseAdminClient: adminClient } = ctx
    const limitRaw = Number(req.nextUrl.searchParams.get('limit') || '30')
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), 100) : 30

    const { data, error } = await adminClient
        .from('admin_backup_exports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        if (error.code === '42501' || /permission denied/i.test(String(error.message || ''))) {
            return NextResponse.json(
                {
                    error: 'PermissionError',
                    message:
                        'Akses ke tabel admin_backup_exports ditolak untuk service role. Jalankan GRANT pada migration RBAC.',
                },
                { status: 500 }
            )
        }
        if (error.code === '42P01') {
            return NextResponse.json(
                {
                    error: 'SchemaError',
                    message: 'Tabel admin_backup_exports belum tersedia. Jalankan migration backup scheduler terlebih dahulu.',
                },
                { status: 500 }
            )
        }
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        )
    }

    return NextResponse.json({ data: data || [] })
}
