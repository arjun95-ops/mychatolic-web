import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedAdmin } from '@/lib/admin-guard'
import { getNextRunAt } from '@/lib/admin-schedule'
import { DEFAULT_TIMEZONE } from '@/lib/admin-constants'
import { logAdminAudit } from '@/lib/admin-audit'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

function schemaErrorResponse(tableName: string) {
    return NextResponse.json(
        {
            error: 'SchemaError',
            message: `Tabel ${tableName} belum tersedia. Jalankan migration backup scheduler terlebih dahulu.`,
        },
        { status: 500 }
    )
}

function permissionErrorResponse(tableName: string) {
    return NextResponse.json(
        {
            error: 'PermissionError',
            message: `Akses ke tabel ${tableName} ditolak untuk service role. Jalankan GRANT pada migration RBAC.`,
        },
        { status: 500 }
    )
}

export async function POST(req: NextRequest) {
    const ctx = await requireApprovedAdmin(req, 'super_admin')
    if (ctx instanceof NextResponse) return ctx

    const { user, supabaseAdminClient: adminClient } = ctx
    const now = new Date()
    const nowIso = now.toISOString()

    const { data: schedules, error: schedulesError } = await adminClient
        .from('admin_backup_schedules')
        .select('*')
        .eq('is_active', true)
        .lte('next_run_at', nowIso)
        .order('next_run_at', { ascending: true })

    if (schedulesError) {
        if (schedulesError.code === '42501' || /permission denied/i.test(String(schedulesError.message || ''))) {
            return permissionErrorResponse('admin_backup_schedules')
        }
        if (schedulesError.code === '42P01') {
            return schemaErrorResponse('admin_backup_schedules')
        }
        return NextResponse.json(
            { error: 'DatabaseError', message: schedulesError.message },
            { status: 500 }
        )
    }

    if (!schedules || schedules.length === 0) {
        return NextResponse.json({ success: true, processed: 0, reminders_created: 0, emails_sent: 0 })
    }

    const { data: superAdmins, error: superAdminsError } = await adminClient
        .from('admin_users')
        .select('auth_user_id, email, full_name')
        .eq('role', 'super_admin')
        .eq('status', 'approved')

    if (superAdminsError) {
        return NextResponse.json(
            { error: 'DatabaseError', message: superAdminsError.message },
            { status: 500 }
        )
    }

    const superAdminRows = (superAdmins || []) as Array<Record<string, unknown>>
    const recipients = superAdminRows.filter((item) => Boolean(item.auth_user_id))
    const emailRecipients = recipients
        .map((item) => String(item.email || '').trim())
        .filter((email: string) => !!email)

    const resendApiKey = process.env.RESEND_API_KEY || ''
    const resendFrom = process.env.RESEND_FROM_EMAIL || 'MyCatholic Admin <noreply@mychatolic.app>'
    const resend = resendApiKey ? new Resend(resendApiKey) : null

    let remindersCreated = 0
    let emailsSent = 0

    for (const schedule of schedules) {
        const title = `Reminder Backup: ${schedule.name || 'Jadwal Backup'}`
        const message =
            `Waktunya backup data admin.\n` +
            `Jadwal: ${schedule.name || '-'}\n` +
            `Cron: ${schedule.cron_expression}\n` +
            `Timezone: ${schedule.timezone || DEFAULT_TIMEZONE}\n` +
            `Silakan buka Dashboard Super Admin > Backups untuk menjalankan export CSV + JSON.`

        const channels = Array.isArray(schedule.channels) ? schedule.channels : ['in_app', 'email']
        const normalizedChannels = channels.map((c: unknown) => String(c).toLowerCase())
        const useInApp = normalizedChannels.includes('in_app')
        const useEmail = normalizedChannels.includes('email')

        const reminderRows = recipients.map((recipient) => ({
            schedule_id: schedule.id,
            recipient_auth_user_id: recipient.auth_user_id,
            title,
            message,
            reminder_at: nowIso,
            is_read: false,
            metadata: {
                schedule_name: schedule.name || '',
                cron_expression: schedule.cron_expression || '',
                timezone: schedule.timezone || DEFAULT_TIMEZONE,
            },
        }))

        if (useInApp && reminderRows.length > 0) {
            const { error: reminderError } = await adminClient
                .from('admin_backup_reminders')
                .insert(reminderRows)

            if (reminderError) {
                if (reminderError.code === '42501' || /permission denied/i.test(String(reminderError.message || ''))) {
                    return permissionErrorResponse('admin_backup_reminders')
                }
                if (reminderError.code === '42P01') {
                    return schemaErrorResponse('admin_backup_reminders')
                }
                return NextResponse.json(
                    { error: 'DatabaseError', message: reminderError.message },
                    { status: 500 }
                )
            }
            remindersCreated += reminderRows.length
        }

        if (useEmail && resend && emailRecipients.length > 0) {
            try {
                await resend.emails.send({
                    from: resendFrom,
                    to: emailRecipients,
                    subject: title,
                    text: message,
                })
                emailsSent += emailRecipients.length
            } catch (emailError) {
                console.error('Failed sending backup reminder email:', emailError)
            }
        }

        let nextRunAt: Date
        try {
            nextRunAt = getNextRunAt({
                cronExpression: String(schedule.cron_expression || ''),
                timezone: String(schedule.timezone || DEFAULT_TIMEZONE),
                fromDate: new Date(now.getTime() + 1000),
            })
        } catch {
            nextRunAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
        }

        const { error: updateError } = await adminClient
            .from('admin_backup_schedules')
            .update({
                last_run_at: nowIso,
                last_reminded_at: nowIso,
                next_run_at: nextRunAt.toISOString(),
                updated_at: nowIso,
                updated_by: user.id,
            })
            .eq('id', schedule.id)

        if (updateError) {
            return NextResponse.json(
                { error: 'DatabaseError', message: updateError.message },
                { status: 500 }
            )
        }

        await logAdminAudit({
            supabaseAdminClient: adminClient,
            actorAuthUserId: user.id,
            action: 'RUN_BACKUP_SCHEDULE_REMINDER',
            tableName: 'admin_backup_schedules',
            recordId: String(schedule.id),
            oldData: schedule,
            newData: {
                last_run_at: nowIso,
                last_reminded_at: nowIso,
                next_run_at: nextRunAt.toISOString(),
            },
            request: req,
            extra: {
                recipients: recipients.length,
                channels: normalizedChannels,
                in_app_created: useInApp ? reminderRows.length : 0,
                emails_sent: useEmail ? emailRecipients.length : 0,
            },
        })
    }

    return NextResponse.json({
        success: true,
        processed: schedules.length,
        reminders_created: remindersCreated,
        emails_sent: emailsSent,
        email_provider: resend ? 'resend' : 'disabled',
    })
}
