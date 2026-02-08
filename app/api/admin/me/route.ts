import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, createSupabaseAdminClient } from '@/lib/admin-guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    // 1. Get Auth Context (Permissive: allows unverified email)
    const ctx = await getAuthContext(req)

    if (ctx instanceof NextResponse) {
        return ctx
    }

    const { isAuthenticated, emailVerified, user } = ctx

    if (!isAuthenticated || !user) {
        return NextResponse.json(
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

    // 3. Fetch User Profile for Full Name
    const { data: profile } = await adminClient
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()

    // 4. Construct Response
    // We return 200 OK even if emailVerified is false, so Frontend can handle it.
    const responseData = {
        isAuthenticated: true,
        emailVerified: emailVerified,
        adminExists: !!adminRow,
        role: adminRow?.role || null,
        status: adminRow?.status || null,
        full_name: profile?.full_name || user.user_metadata?.full_name || user.email || 'Admin',
        // Debug safe fields
        user_id: user.id,
        user_email: user.email,
        admin_auth_user_id: adminRow?.auth_user_id || null,
    }

    return NextResponse.json(responseData)
}
