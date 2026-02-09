import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedAdmin } from '@/lib/admin-guard'
import { logAdminAudit } from '@/lib/admin-audit'

export const dynamic = 'force-dynamic'

type AccountUpdatePayload = {
    full_name?: string
    avatar_url?: string | null
}

function normalizeAvatarUrl(value: unknown): string | null {
    if (value == null) return null
    const str = String(value).trim()
    if (!str) return null
    if (!/^https?:\/\//i.test(str)) {
        throw new Error('Avatar URL harus diawali http:// atau https://')
    }
    return str
}

export async function GET(req: NextRequest) {
    const ctx = await requireApprovedAdmin(req)
    if (ctx instanceof NextResponse) return ctx

    const { user, adminRow, supabaseAdminClient } = ctx

    const { data: profile, error } = await supabaseAdminClient
        .from('profiles')
        .select('id, full_name, avatar_url, updated_at')
        .eq('id', user.id)
        .maybeSingle()

    if (error) {
        return NextResponse.json(
            { error: 'DatabaseError', message: error.message },
            { status: 500 }
        )
    }

    return NextResponse.json({
        data: {
            id: user.id,
            email: user.email || adminRow?.email || '',
            full_name:
                profile?.full_name ||
                adminRow?.full_name ||
                user.user_metadata?.full_name ||
                user.email ||
                'Admin',
            avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url || null,
            role: adminRow?.role || null,
            status: adminRow?.status || null,
            updated_at: profile?.updated_at || null,
        },
    })
}

export async function POST(req: NextRequest) {
    const ctx = await requireApprovedAdmin(req)
    if (ctx instanceof NextResponse) return ctx

    const { user, supabaseAdminClient } = ctx

    let body: AccountUpdatePayload
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: 'BadRequest', message: 'Invalid JSON' },
            { status: 400 }
        )
    }

    const fullName = typeof body?.full_name === 'string' ? body.full_name.trim() : ''
    let avatarUrl: string | null = null

    try {
        avatarUrl = normalizeAvatarUrl(body?.avatar_url)
    } catch (error: unknown) {
        return NextResponse.json(
            {
                error: 'ValidationError',
                message: error instanceof Error ? error.message : 'Avatar URL tidak valid.',
            },
            { status: 400 }
        )
    }

    if (!fullName && body?.avatar_url == null) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'Tidak ada perubahan yang dikirim.' },
            { status: 400 }
        )
    }

    const { data: oldProfile } = await supabaseAdminClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

    const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    }

    if (fullName) {
        updates.full_name = fullName
    }

    if (body?.avatar_url !== undefined) {
        updates.avatar_url = avatarUrl
    }

    const { data: updatedProfile, error: updateError } = await supabaseAdminClient
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select('id, full_name, avatar_url, updated_at')
        .maybeSingle()

    if (updateError) {
        return NextResponse.json(
            { error: 'DatabaseError', message: updateError.message },
            { status: 500 }
        )
    }

    if (!updatedProfile) {
        return NextResponse.json(
            { error: 'NotFound', message: 'Profile user tidak ditemukan.' },
            { status: 404 }
        )
    }

    if (fullName) {
        await supabaseAdminClient
            .from('admin_users')
            .update({
                full_name: fullName,
                updated_at: new Date().toISOString(),
            })
            .eq('auth_user_id', user.id)
    }

    await logAdminAudit({
        supabaseAdminClient,
        actorAuthUserId: user.id,
        action: 'UPDATE_ADMIN_ACCOUNT_PROFILE',
        tableName: 'profiles',
        recordId: user.id,
        oldData: oldProfile || null,
        newData: updatedProfile,
        request: req,
    })

    return NextResponse.json({ success: true, data: updatedProfile })
}
