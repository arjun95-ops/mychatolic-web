import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { AdminRole, AdminStatus } from '@/lib/admin-constants'

// --- Types ---

export interface AdminUserRow {
    auth_user_id: string
    email?: string | null
    full_name?: string | null
    role: AdminRole
    status: AdminStatus
    created_at: string
    approved_at?: string | null
    approved_by?: string | null
    updated_at?: string | null
    // Add other fields if necessary based on your schema
}

export interface AuthContextResult {
    isAuthenticated: boolean
    emailVerified: boolean
    user: User | null
    supabase: SupabaseClient
    setCookiesToResponse: (res: NextResponse) => void
}

export interface AdminContextResult {
    user: User
    adminRow: AdminUserRow | null
    setCookiesToResponse: (res: NextResponse) => void
    supabase: SupabaseClient
}

export interface ApprovedAdminResult {
    user: User
    adminRow: AdminUserRow
    supabaseAdminClient: SupabaseClient
    supabase: SupabaseClient
    setCookiesToResponse: (res: NextResponse) => void
}

// --- Clients ---

// Factory for Service Role Client with Audit Context
// Injects 'x-admin-actor-id' header for DB triggers to capture the actor
export function createSupabaseAdminClient(actorId?: string) {
    const headers: Record<string, string> = {}
    if (actorId) {
        headers['x-admin-actor-id'] = actorId
    }

    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
            global: {
                headers,
            }
        }
    )
}

// Backward compatibility (deprecated) - preferably use createSupabaseAdminClient or get it from context
export const supabaseAdminClient = createSupabaseAdminClient()

// --- Functions ---

/**
 * Basic Auth Context.
 * Checks: Login ONLY.
 * Returns: User, Email Verified Status, Supabase Client.
 * Does NOT throw 401 if unverified.
 */
export async function getAuthContext(
    req: NextRequest
): Promise<AuthContextResult | NextResponse> {
    const cookieStore = req.cookies
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    // 0. Validate Server Configuration
    if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json(
            {
                error: 'ServerMisconfigured',
                message: 'Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL'
            },
            { status: 500 }
        )
    }

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

    // Helper to apply cookies
    const setCookiesToResponse = (res: NextResponse) => {
        cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options)
        })
    }

    // 1. Get User
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
        // Return context with false flags instead of 401
        return {
            isAuthenticated: false,
            emailVerified: false,
            user: null,
            supabase,
            setCookiesToResponse
        }
    }

    // 2. Check Verification
    const isVerified = !!(user.email_confirmed_at || user.confirmed_at)

    return {
        isAuthenticated: true,
        emailVerified: isVerified,
        user,
        supabase,
        setCookiesToResponse
    }
}

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

    const authRes = await getAuthContext(req)

    // If getAuthContext returned NextResponse (e.g. 500 config), forward it
    if (authRes instanceof NextResponse) {
        return authRes
    }

    const { isAuthenticated, emailVerified, user, supabase, setCookiesToResponse } = authRes

    if (!isAuthenticated || !user) {
        return NextResponse.json(
            { error: 'Unauthorized', message: 'Silakan login terlebih dahulu' },
            { status: 401 }
        )
    }

    if (!emailVerified) {
        return NextResponse.json(
            { error: 'Unauthorized', message: 'Email belum diverifikasi' },
            { status: 401 }
        )
    }

    // 3. Fetch Admin Row using dynamic client with actor
    // Even for reading admin row, it's good practice to use actor context if available, though not strictly required for read audit unless configured.
    const adminClient = createSupabaseAdminClient(user.id)

    const { data: adminRow, error: adminError } = await adminClient
        .from('admin_users')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle()

    if (adminError) {
        console.error('getAdminContext: Error fetching admin_users row:', adminError);
        return NextResponse.json(
            {
                error: 'AdminUsersQueryFailed',
                code: adminError.code,
                message: adminError.message,
                details: adminError.details
            },
            { status: 500 }
        )
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

    const { user, adminRow, setCookiesToResponse, supabase } = ctx

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

    // 5. Return Success with Actor-Injected Client
    // This ensures any DB operation done via this passed client has the actor header
    const injectedAdminClient = createSupabaseAdminClient(user.id)

    return {
        user,
        adminRow,
        supabaseAdminClient: injectedAdminClient, // Override/Provide the injected one
        supabase,
        setCookiesToResponse,
    }
}
