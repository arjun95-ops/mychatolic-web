import { NextRequest, NextResponse } from 'next/server'
import { getAdminContext, supabaseAdminClient } from '@/lib/admin-guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    // 1. Get Admin Context
    // This validates session existence and email verification.
    // Returns 401 if not logged in or email not verified.
    const ctx = await getAdminContext(req)

    if (ctx instanceof NextResponse) {
        return ctx
    }

    const { user, adminRow } = ctx

    // 2. Fetch User Profile for Full Name
    // We use supabaseAdminClient to ensure we get the name even if RLS is tricky,
    // though typically users can read their own profile.
    const { data: profile } = await supabaseAdminClient
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()

    // 3. Construct Response
    // Note: getAdminContext guarantees email is verified if it returns success.
    const responseData = {
        isAuthenticated: true,
        emailVerified: true, // getAdminContext blocks if false
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
