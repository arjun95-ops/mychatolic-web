import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// --- Types ---

export type AdminRole = 'admin' | 'super_admin'
export type AdminStatus = 'pending_approval' | 'approved' | 'suspended'

export interface AdminUserRow {
    id: string
    auth_user_id: string
    email: string
    role: AdminRole
    status: AdminStatus
    created_at: string
    // Add other fields if necessary based on your schema
}

export interface AdminContextResult {
    user: any // Typed as User later
    adminRow: AdminUserRow | null
    setCookiesToResponse: (res: NextResponse) => void
    supabase: any // The client used to fetch user (helpful if needed)
}

export interface ApprovedAdminResult {
    user: any
    adminRow: AdminUserRow
    supabaseAdminClient: typeof supabaseAdminClient
    setCookiesToResponse: (res: NextResponse) => void
}

// --- Clients ---

// Service Role Client (Bypass RLS) - Singleton
// Used for internal admin operations where user context is already validated
export const supabaseAdminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    }
)

// --- Functions ---

/**
 * Validates the current request for admin access.
 * Checks: Login, Email Verification.
 * Fetches: Admin User Row.
 * 
 * @param req NextRequest
 * @returns AdminContextResult or NextResponse (401)
 */
export async function getAdminContext(
    req: NextRequest
): Promise<AdminContextResult | NextResponse> {
    const cookieStore = req.cookies

    // Track cookies to set on the response (for session refresh)
    const cookiesToSet: { name: string; value: string; options: CookieOptions }[] = []

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookies) {
                    cookies.forEach(({ name, value, options }) => {
                        cookiesToSet.push({ name, value, options })
                    })
                },
            },
        }
    )

    // 1. Get User
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
        return NextResponse.json(
            { error: 'Unauthorized', message: 'Silakan login terlebih dahulu' },
            { status: 401 }
        )
    }

    // 2. Validate Email Verified
    // supabase.auth.getUser() returns a User object with email_confirmed_at
    // confirmed_at is sometimes used in older schemas or different auth providers, 
    // checking both covers bases or sticking to standard property.
    // Standard Supabase Auth user has email_confirmed_at.
    // The 'user' object might have 'confirmed_at' if it's the specific columns returned, 
    // but usually it's compliant with the User interface.
    const isVerified = user.email_confirmed_at || user.confirmed_at

    if (!isVerified) {
        return NextResponse.json(
            { error: 'Unauthorized', message: 'Email belum diverifikasi' },
            { status: 401 }
        )
    }

    // 3. Fetch Admin Row
    const { data: adminRow, error: adminError } = await supabaseAdminClient
        .from('admin_users')
        .select('*')
        .eq('auth_user_id', user.id)
        .single()

    if (adminError) {
        console.error('getAdminContext: Error fetching admin_users row:', adminError);
    }

    // Note: We don't error here if adminRow is missing, 
    // because getAdminContext just builds context. 
    // requireApprovedAdmin will enforce presence.

    // Helper to apply cookies
    const setCookiesToResponse = (res: NextResponse) => {
        cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options)
        })
    }

    return {
        user,
        adminRow,
        setCookiesToResponse,
        supabase
    }
}

/**
 * Enforces stricter admin access rules.
 * Checks: getAdminContext, Admin Row Exists, Status Approved.
 * Optional: Check Role matches.
 * 
 * @param req NextRequest
 * @param requireRole Optional role requirement (e.g. 'super_admin')
 * @returns ApprovedAdminResult or NextResponse (401/403)
 */
export async function requireApprovedAdmin(
    req: NextRequest,
    requireRole?: 'super_admin' // We can expand this type if needed
): Promise<ApprovedAdminResult | NextResponse> {
    // 1. Get Context
    const ctx = await getAdminContext(req)

    if (ctx instanceof NextResponse) {
        return ctx
    }

    const { user, adminRow, setCookiesToResponse } = ctx

    // 2. Check Admin Row Existence
    if (!adminRow) {
        return NextResponse.json(
            { error: 'Forbidden', message: 'User tidak terdaftar sebagai admin' },
            { status: 403 }
        )
    }

    // 3. Check Status
    if (adminRow.status === 'pending_approval') {
        return NextResponse.json(
            { error: 'Forbidden', message: 'menunggu approval super admin' },
            { status: 403 }
        )
    }

    if (adminRow.status === 'suspended') {
        return NextResponse.json(
            { error: 'Forbidden', message: 'Akun admin ditangguhkan (suspended)' },
            { status: 403 }
        )
    }

    if (adminRow.status !== 'approved') {
        // Should not happen if enum is strict, but safe guard
        return NextResponse.json(
            { error: 'Forbidden', message: `Status admin tidak valid: ${adminRow.status}` },
            { status: 403 }
        )
    }

    // 4. Check Role (if required)
    if (requireRole === 'super_admin') {
        if (adminRow.role !== 'super_admin') {
            return NextResponse.json(
                { error: 'Forbidden', message: 'Akses ditolak: Membutuhkan role super_admin' },
                { status: 403 }
            )
        }
    }

    // 5. Return Success
    return {
        user,
        adminRow,
        supabaseAdminClient, // The service role client
        setCookiesToResponse,
    }
}
