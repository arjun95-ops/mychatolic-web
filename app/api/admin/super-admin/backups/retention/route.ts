import { NextRequest, NextResponse } from 'next/server'
import { subDays } from 'date-fns'
import { requireApprovedAdmin } from '@/lib/admin-guard'
import { RETENTION_DAYS } from '@/lib/admin-constants'
import { logAdminAudit } from '@/lib/admin-audit'

export async function POST(req: NextRequest) {
    const ctx = await requireApprovedAdmin(req, 'super_admin')
    if (ctx instanceof NextResponse) return ctx

    const { user, supabaseAdminClient: adminClient } = ctx

    let body: unknown
    try {
        body = await req.json()
    } catch {
        body = {}
    }

    const parsedBody =
        body && typeof body === 'object' ? (body as { dry_run?: unknown }) : {}
    const dryRun = parsedBody.dry_run === true
    const cutoff = subDays(new Date(), RETENTION_DAYS).toISOString()

    const [{ count: oldSessionsCount, error: sessionsCountError }, { count: oldAuditCount, error: auditCountError }] =
        await Promise.all([
            adminClient
                .from('admin_sessions')
                .select('id', { count: 'exact', head: true })
                .lt('login_at', cutoff),
            adminClient
                .from('audit_logs')
                .select('id', { count: 'exact', head: true })
                .lt('occurred_at', cutoff),
        ])

    if (sessionsCountError) {
        return NextResponse.json(
            { error: 'DatabaseError', message: sessionsCountError.message },
            { status: 500 }
        )
    }

    if (auditCountError) {
        return NextResponse.json(
            { error: 'DatabaseError', message: auditCountError.message },
            { status: 500 }
        )
    }

    if (!dryRun) {
        const [{ error: deleteSessionsError }, { error: deleteAuditError }] = await Promise.all([
            adminClient.from('admin_sessions').delete().lt('login_at', cutoff),
            adminClient.from('audit_logs').delete().lt('occurred_at', cutoff),
        ])

        if (deleteSessionsError) {
            return NextResponse.json(
                { error: 'DatabaseError', message: deleteSessionsError.message },
                { status: 500 }
            )
        }

        if (deleteAuditError) {
            return NextResponse.json(
                { error: 'DatabaseError', message: deleteAuditError.message },
                { status: 500 }
            )
        }
    }

    await logAdminAudit({
        supabaseAdminClient: adminClient,
        actorAuthUserId: user.id,
        action: dryRun ? 'RETENTION_DRY_RUN' : 'RETENTION_PURGE',
        tableName: 'admin_sessions,audit_logs',
        recordId: null,
        oldData: null,
        newData: {
            retention_days: RETENTION_DAYS,
            cutoff,
            sessions: oldSessionsCount || 0,
            audit_logs: oldAuditCount || 0,
            dry_run: dryRun,
        },
        request: req,
    })

    return NextResponse.json({
        success: true,
        dry_run: dryRun,
        retention_days: RETENTION_DAYS,
        cutoff,
        old_rows: {
            admin_sessions: oldSessionsCount || 0,
            audit_logs: oldAuditCount || 0,
        },
        purged_rows: dryRun
            ? {
                  admin_sessions: 0,
                  audit_logs: 0,
              }
            : {
                  admin_sessions: oldSessionsCount || 0,
                  audit_logs: oldAuditCount || 0,
              },
    })
}
