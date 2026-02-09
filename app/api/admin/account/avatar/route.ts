import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedAdmin } from '@/lib/admin-guard'
import { logAdminAudit } from '@/lib/admin-audit'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const AVATAR_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_ADMIN_AVATAR_BUCKET || 'admin-avatars'
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_AVATAR_BYTES = 2 * 1024 * 1024

function getExtensionByMime(mimeType: string): string {
    switch (mimeType) {
        case 'image/jpeg':
            return 'jpg'
        case 'image/png':
            return 'png'
        case 'image/webp':
            return 'webp'
        default:
            return 'bin'
    }
}

async function ensureAvatarBucket(
    supabaseAdminClient: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
    const { data, error } = await supabaseAdminClient.storage.getBucket(AVATAR_BUCKET)
    if (!error && data) {
        return { ok: true }
    }

    const errorRecord = error && typeof error === 'object'
        ? (error as unknown as Record<string, unknown>)
        : {}
    const errorMessage = String(errorRecord.message || '').toLowerCase()
    const statusCode = Number(errorRecord.statusCode ?? errorRecord.status ?? NaN)
    const isMissingBucket =
        statusCode === 404 ||
        /not found|does not exist|bucket/i.test(errorMessage)

    if (!isMissingBucket) {
        return {
            ok: false,
            message: String(errorRecord.message || `Gagal akses bucket ${AVATAR_BUCKET}.`),
        }
    }

    const { error: createError } = await supabaseAdminClient.storage.createBucket(AVATAR_BUCKET, {
        public: true,
        fileSizeLimit: MAX_AVATAR_BYTES,
        allowedMimeTypes: ALLOWED_MIME_TYPES,
    })

    if (createError) {
        return {
            ok: false,
            message:
                createError.message ||
                `Gagal membuat bucket ${AVATAR_BUCKET}. Buat manual di Supabase Storage.`,
        }
    }

    return { ok: true }
}

function extractObjectPathFromAvatarUrl(url: string | null | undefined): string | null {
    if (!url) return null
    const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`
    const index = url.indexOf(marker)
    if (index < 0) return null
    const rawPath = url.slice(index + marker.length).split('?')[0]
    if (!rawPath) return null
    try {
        return decodeURIComponent(rawPath)
    } catch {
        return rawPath
    }
}

export async function POST(req: NextRequest) {
    const ctx = await requireApprovedAdmin(req)
    if (ctx instanceof NextResponse) return ctx

    const { user, supabaseAdminClient } = ctx

    const bucketCheck = await ensureAvatarBucket(supabaseAdminClient)
    if (!bucketCheck.ok) {
        return NextResponse.json(
            {
                error: 'StorageError',
                message: bucketCheck.message || 'Bucket avatar belum siap.',
            },
            { status: 500 }
        )
    }

    let formData: FormData
    try {
        formData = await req.formData()
    } catch {
        return NextResponse.json(
            { error: 'BadRequest', message: 'Payload upload tidak valid.' },
            { status: 400 }
        )
    }

    const fileInput = formData.get('file')
    if (!(fileInput instanceof File)) {
        return NextResponse.json(
            { error: 'ValidationError', message: 'File avatar wajib diisi.' },
            { status: 400 }
        )
    }

    const mimeType = String(fileInput.type || '').toLowerCase()
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        return NextResponse.json(
            {
                error: 'ValidationError',
                message: 'Format gambar harus JPG, PNG, atau WEBP.',
            },
            { status: 400 }
        )
    }

    if (fileInput.size > MAX_AVATAR_BYTES) {
        return NextResponse.json(
            {
                error: 'ValidationError',
                message: 'Ukuran file maksimal 2 MB.',
            },
            { status: 400 }
        )
    }

    const { data: oldProfile, error: oldProfileError } = await supabaseAdminClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

    if (oldProfileError) {
        return NextResponse.json(
            { error: 'DatabaseError', message: oldProfileError.message },
            { status: 500 }
        )
    }

    const extension = getExtensionByMime(mimeType)
    const filePath = `avatars/${user.id}/${Date.now()}.${extension}`
    const binary = Buffer.from(await fileInput.arrayBuffer())

    const { error: uploadError } = await supabaseAdminClient.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, binary, {
            upsert: true,
            contentType: mimeType,
            cacheControl: '3600',
        })

    if (uploadError) {
        return NextResponse.json(
            { error: 'StorageError', message: uploadError.message || 'Gagal upload avatar.' },
            { status: 500 }
        )
    }

    const { data: publicData } = supabaseAdminClient.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(filePath)

    const avatarUrl = publicData?.publicUrl || null

    const { data: updatedProfile, error: updateError } = await supabaseAdminClient
        .from('profiles')
        .update({
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .select('id, full_name, avatar_url, updated_at')
        .maybeSingle()

    if (updateError || !updatedProfile) {
        return NextResponse.json(
            {
                error: 'DatabaseError',
                message: updateError?.message || 'Gagal update profile avatar.',
            },
            { status: 500 }
        )
    }

    const oldPath = extractObjectPathFromAvatarUrl(oldProfile?.avatar_url)
    if (oldPath && oldPath !== filePath) {
        await supabaseAdminClient.storage.from(AVATAR_BUCKET).remove([oldPath])
    }

    await logAdminAudit({
        supabaseAdminClient,
        actorAuthUserId: user.id,
        action: 'UPLOAD_ADMIN_AVATAR',
        tableName: 'profiles',
        recordId: user.id,
        oldData: oldProfile || null,
        newData: updatedProfile,
        request: req,
        extra: {
            bucket: AVATAR_BUCKET,
            file_path: filePath,
            mime_type: mimeType,
            size_bytes: fileInput.size,
        },
    })

    return NextResponse.json({
        success: true,
        data: updatedProfile,
        constraints: {
            max_bytes: MAX_AVATAR_BYTES,
            max_megabytes: 2,
            allowed_mime_types: ALLOWED_MIME_TYPES,
            bucket: AVATAR_BUCKET,
        },
    })
}

export async function DELETE(req: NextRequest) {
    const ctx = await requireApprovedAdmin(req)
    if (ctx instanceof NextResponse) return ctx

    const { user, supabaseAdminClient } = ctx

    const { data: oldProfile, error: oldProfileError } = await supabaseAdminClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

    if (oldProfileError) {
        return NextResponse.json(
            { error: 'DatabaseError', message: oldProfileError.message },
            { status: 500 }
        )
    }

    const { data: updatedProfile, error: updateError } = await supabaseAdminClient
        .from('profiles')
        .update({
            avatar_url: null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .select('id, full_name, avatar_url, updated_at')
        .maybeSingle()

    if (updateError || !updatedProfile) {
        return NextResponse.json(
            {
                error: 'DatabaseError',
                message: updateError?.message || 'Gagal menghapus avatar profile.',
            },
            { status: 500 }
        )
    }

    const oldPath = extractObjectPathFromAvatarUrl(oldProfile?.avatar_url)
    if (oldPath) {
        await supabaseAdminClient.storage.from(AVATAR_BUCKET).remove([oldPath])
    }

    await logAdminAudit({
        supabaseAdminClient,
        actorAuthUserId: user.id,
        action: 'DELETE_ADMIN_AVATAR',
        tableName: 'profiles',
        recordId: user.id,
        oldData: oldProfile || null,
        newData: updatedProfile,
        request: req,
        extra: {
            bucket: AVATAR_BUCKET,
            removed_path: oldPath,
        },
    })

    return NextResponse.json({ success: true, data: updatedProfile })
}
