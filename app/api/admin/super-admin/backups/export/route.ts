import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireApprovedAdmin } from '@/lib/admin-guard'
import { BACKUP_BUCKET } from '@/lib/admin-constants'
import {
    buildBackupBasePath,
    buildFileName,
    toCsv,
    toJsonText,
    uploadTextFile,
} from '@/lib/admin-backup'
import { logAdminAudit } from '@/lib/admin-audit'

export const dynamic = 'force-dynamic'

function parseIsoDate(value: unknown): string | null {
    if (!value) return null
    const parsed = new Date(String(value))
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toISOString()
}

async function fetchRows({
    supabaseAdminClient,
    table,
    from,
    to,
    orderBy,
}: {
    supabaseAdminClient: SupabaseClient
    table: 'admin_sessions' | 'audit_logs'
    from: string | null
    to: string | null
    orderBy: string
}) {
    let query = supabaseAdminClient
        .from(table)
        .select('*')
        .order(orderBy, { ascending: false })

    if (from) {
        query = query.gte(orderBy, from)
    }
    if (to) {
        query = query.lte(orderBy, to)
    }

    const { data, error } = await query
    if (error) throw error
    return (data || []) as Array<Record<string, unknown>>
}

export async function POST(req: NextRequest) {
    const ctx = await requireApprovedAdmin(req, 'super_admin')
    if (ctx instanceof NextResponse) return ctx

    const { user: actor, supabaseAdminClient: adminClient } = ctx

    let body: unknown
    try {
        body = await req.json()
    } catch {
        body = {}
    }

    const parsedBody =
        body && typeof body === 'object' ? (body as { from?: unknown; to?: unknown }) : {}
    const from = parseIsoDate(parsedBody.from)
    const to = parseIsoDate(parsedBody.to)
    const now = new Date()
    const basePath = buildBackupBasePath(now)

    try {
        const [sessionRows, auditRows] = await Promise.all([
            fetchRows({
                supabaseAdminClient: adminClient,
                table: 'admin_sessions',
                from,
                to,
                orderBy: 'login_at',
            }),
            fetchRows({
                supabaseAdminClient: adminClient,
                table: 'audit_logs',
                from,
                to,
                orderBy: 'occurred_at',
            }),
        ])

        const filesToUpload = [
            {
                key: 'admin_sessions_json',
                path: `${basePath}/${buildFileName('admin_sessions', 'json', now)}`,
                content: toJsonText(sessionRows),
                contentType: 'application/json',
            },
            {
                key: 'admin_sessions_csv',
                path: `${basePath}/${buildFileName('admin_sessions', 'csv', now)}`,
                content: toCsv(sessionRows),
                contentType: 'text/csv',
            },
            {
                key: 'audit_logs_json',
                path: `${basePath}/${buildFileName('audit_logs', 'json', now)}`,
                content: toJsonText(auditRows),
                contentType: 'application/json',
            },
            {
                key: 'audit_logs_csv',
                path: `${basePath}/${buildFileName('audit_logs', 'csv', now)}`,
                content: toCsv(auditRows),
                contentType: 'text/csv',
            },
        ]

        const uploads = []
        for (const file of filesToUpload) {
            const uploaded = await uploadTextFile({
                supabaseAdminClient: adminClient,
                bucket: BACKUP_BUCKET,
                path: file.path,
                content: file.content,
                contentType: file.contentType,
            })
            uploads.push({
                key: file.key,
                ...uploaded,
                content_type: file.contentType,
            })
        }

        const exportRecord = {
            exported_by: actor.id,
            export_type: 'on_demand',
            files: uploads,
            from_at: from,
            to_at: to,
            created_at: now.toISOString(),
        }

        const { error: exportRecordError } = await adminClient
            .from('admin_backup_exports')
            .insert(exportRecord)

        if (exportRecordError && exportRecordError.code !== '42P01') {
            console.error('Failed to save export history:', exportRecordError)
        }

        await logAdminAudit({
            supabaseAdminClient: adminClient,
            actorAuthUserId: actor.id,
            action: 'EXPORT_ADMIN_BACKUP',
            tableName: 'admin_backup_exports',
            recordId: null,
            oldData: null,
            newData: {
                from_at: from,
                to_at: to,
                files: uploads.map((file) => ({
                    key: file.key,
                    path: file.path,
                })),
                rows: {
                    admin_sessions: sessionRows.length,
                    audit_logs: auditRows.length,
                },
            },
            request: req,
            extra: { bucket: BACKUP_BUCKET },
        })

        return NextResponse.json({
            success: true,
            bucket: BACKUP_BUCKET,
            from,
            to,
            rows: {
                admin_sessions: sessionRows.length,
                audit_logs: auditRows.length,
            },
            files: uploads,
        })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error || '')
        const statusCode =
            error && typeof error === 'object' && 'statusCode' in error
                ? Number((error as { statusCode?: unknown }).statusCode)
                : NaN
        if (statusCode === 404 || /bucket/i.test(message)) {
            return NextResponse.json(
                {
                    error: 'StorageError',
                    message: `Bucket ${BACKUP_BUCKET} tidak ditemukan atau tidak bisa diakses.`,
                },
                { status: 500 }
            )
        }
        return NextResponse.json(
            { error: 'BackupError', message: message || 'Gagal membuat backup.' },
            { status: 500 }
        )
    }
}
