import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, createSupabaseAdminClient } from '@/lib/admin-guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    // 1. Get Auth Context (Permissive: allows unverified email)
    const ctx = await getAuthContext(req)

    if (ctx instanceof NextResponse) {
        return ctx
    }

    const { isAuthenticated, emailVerified, user, setCookiesToResponse } = ctx

    const json = (payload: unknown, init?: { status?: number }) => {
        const res = NextResponse.json(payload, init)
        setCookiesToResponse(res)
        return res
    }

    if (!isAuthenticated || !user) {
        return json(
            { error: 'Unauthorized', message: 'Silakan login terlebih dahulu' },
            { status: 401 }
        )
    }

    // Initialize Admin Client with Actor
    const adminClient = createSupabaseAdminClient(user.id);

    // 2. Fetch Admin Row (if user exists, regardless of email verification)
    const { data: adminRow } = await adminClient
        .from('admin_users')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle()

    // 3. Fetch User Profile for display
    const { data: profile } = await adminClient
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single()

    let backupReminderUnread = 0
    if (adminRow?.role === 'super_admin' && adminRow?.status === 'approved') {
        const { count } = await adminClient
            .from('admin_backup_reminders')
            .select('id', { count: 'exact', head: true })
            .eq('recipient_auth_user_id', user.id)
            .eq('is_read', false)
        backupReminderUnread = count || 0
    }

    // 4. Construct Response
    // We return 200 OK even if emailVerified is false, so Frontend can handle it.
    const responseData = {
        isAuthenticated: true,
        emailVerified: emailVerified,
        adminExists: !!adminRow,
        role: adminRow?.role || null,
        status: adminRow?.status || null,
        full_name: profile?.full_name || user.user_metadata?.full_name || user.email || 'Admin',
        avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url || null,
        email: user.email || adminRow?.email || null,
        is_super_admin: adminRow?.role === 'super_admin',
        backup_reminder_unread: backupReminderUnread,
        // Debug safe fields
        user_id: user.id,
        user_email: user.email,
        admin_auth_user_id: adminRow?.auth_user_id || null,
    }

    return json(responseData)
}
