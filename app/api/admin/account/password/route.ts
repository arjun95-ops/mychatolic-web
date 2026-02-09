import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedAdmin } from '@/lib/admin-guard'
import { logAdminAudit } from '@/lib/admin-audit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    const ctx = await requireApprovedAdmin(req)
    if (ctx instanceof NextResponse) return ctx

    const { user, supabaseAdminClient } = ctx

    let body: { new_password?: string; confirm_password?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: 'BadRequest', message: 'Invalid JSON' },
            { status: 400 }
        )
    }

    const newPassword = String(body?.new_password || '')
    const confirmPassword = String(body?.confirm_password || '')

    if (!newPassword || !confirmPassword) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'Password baru dan konfirmasi wajib diisi.' },
            { status: 400 }
        )
    }

    if (newPassword.length < 8) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'Password minimal 8 karakter.' },
            { status: 400 }
        )
    }

    if (newPassword !== confirmPassword) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'Konfirmasi password tidak sama.' },
            { status: 400 }
        )
    }

    const { error } = await supabaseAdminClient.auth.admin.updateUserById(user.id, {
        password: newPassword,
    })

    if (error) {
        return NextResponse.json(
            { error: 'AuthError', message: error.message || 'Gagal mengubah password.' },
            { status: 400 }
        )
    }

    await logAdminAudit({
        supabaseAdminClient,
        actorAuthUserId: user.id,
        action: 'CHANGE_ADMIN_PASSWORD',
        tableName: 'auth.users',
        recordId: user.id,
        oldData: null,
        newData: { password_changed: true, changed_at: new Date().toISOString() },
        request: req,
    })

    return NextResponse.json({ success: true })
}
