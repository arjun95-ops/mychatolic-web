import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

const QR_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_DONATION_ASSETS_BUCKET || "donation-assets";
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_QR_BYTES = 5 * 1024 * 1024;
const DEFAULT_INSTRUCTION =
  "Silakan scan QRIS ini, lakukan pembayaran, lalu unggah bukti pembayaran agar donasi tercatat di sistem.";

function textOrNull(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function getExtensionByMime(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

function extractObjectPathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${QR_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index < 0) return null;
  const rawPath = url.slice(index + marker.length).split("?")[0];
  if (!rawPath) return null;
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

async function ensureQrBucket(
  supabaseAdminClient: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const { data, error } = await supabaseAdminClient.storage.getBucket(QR_BUCKET);
  if (!error && data) {
    return { ok: true };
  }

  const errorRecord =
    error && typeof error === "object" ? (error as unknown as Record<string, unknown>) : {};
  const errorMessage = String(errorRecord.message || "").toLowerCase();
  const statusCode = Number(errorRecord.statusCode ?? errorRecord.status ?? Number.NaN);
  const isMissingBucket =
    statusCode === 404 || /not found|does not exist|bucket/i.test(errorMessage);

  if (!isMissingBucket) {
    return {
      ok: false,
      message: String(errorRecord.message || `Gagal akses bucket ${QR_BUCKET}.`),
    };
  }

  const { error: createError } = await supabaseAdminClient.storage.createBucket(QR_BUCKET, {
    public: true,
    fileSizeLimit: MAX_QR_BYTES,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  });

  if (createError) {
    return {
      ok: false,
      message:
        createError.message ||
        `Gagal membuat bucket ${QR_BUCKET}. Buat manual di Supabase Storage.`,
    };
  }

  return { ok: true };
}

export async function GET(req: NextRequest) {
  const ctx = await requireApprovedAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { supabaseAdminClient, setCookiesToResponse } = ctx;

  try {
    const { data, error } = await supabaseAdminClient
      .from("donation_qr_configs")
      .select("id, qr_image_url, qr_storage_path, instruction_text, is_active, updated_at, updated_by")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const config = data || {
      id: 1,
      qr_image_url: null,
      qr_storage_path: null,
      instruction_text: DEFAULT_INSTRUCTION,
      is_active: true,
      updated_at: null,
      updated_by: null,
    };

    const response = NextResponse.json({ success: true, config });
    setCookiesToResponse(response);
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal memuat konfigurasi QRIS.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const ctx = await requireApprovedAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { user, supabaseAdminClient, setCookiesToResponse } = ctx;

  const bucketCheck = await ensureQrBucket(supabaseAdminClient);
  if (!bucketCheck.ok) {
    return NextResponse.json(
      {
        error: "StorageError",
        message: bucketCheck.message || "Bucket QRIS belum siap.",
      },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "BadRequest", message: "Payload upload tidak valid." },
      { status: 400 }
    );
  }

  const instructionText = textOrNull(formData.get("instruction_text"));
  const fileInput = formData.get("file");
  const hasFile = fileInput instanceof File;

  if (!hasFile && !instructionText) {
    return NextResponse.json(
      { error: "ValidationError", message: "Pilih file QRIS atau isi instruksi baru." },
      { status: 400 }
    );
  }

  if (hasFile) {
    const mimeType = String(fileInput.type || "").toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: "ValidationError", message: "Format file harus JPG, PNG, atau WEBP." },
        { status: 400 }
      );
    }

    if (fileInput.size > MAX_QR_BYTES) {
      return NextResponse.json(
        { error: "ValidationError", message: "Ukuran file maksimal 5 MB." },
        { status: 400 }
      );
    }
  }

  try {
    const { data: oldConfig, error: oldConfigError } = await supabaseAdminClient
      .from("donation_qr_configs")
      .select("id, qr_image_url, qr_storage_path, instruction_text, is_active, updated_at, updated_by")
      .eq("id", 1)
      .maybeSingle();

    if (oldConfigError) {
      return NextResponse.json(
        { error: "DatabaseError", message: oldConfigError.message },
        { status: 500 }
      );
    }

    let nextQrImageUrl = textOrNull(oldConfig?.qr_image_url);
    let nextQrStoragePath = textOrNull(oldConfig?.qr_storage_path);
    let uploadedPath: string | null = null;

    if (hasFile) {
      const mimeType = String(fileInput.type || "").toLowerCase();
      const extension = getExtensionByMime(mimeType);
      uploadedPath = `qris/qris_${Date.now()}.${extension}`;
      const binary = Buffer.from(await fileInput.arrayBuffer());

      const { error: uploadError } = await supabaseAdminClient.storage
        .from(QR_BUCKET)
        .upload(uploadedPath, binary, {
          upsert: true,
          contentType: mimeType,
          cacheControl: "3600",
        });

      if (uploadError) {
        return NextResponse.json(
          {
            error: "StorageError",
            message: uploadError.message || "Gagal upload QRIS baru.",
          },
          { status: 500 }
        );
      }

      const { data: publicData } = supabaseAdminClient.storage
        .from(QR_BUCKET)
        .getPublicUrl(uploadedPath);
      nextQrImageUrl = textOrNull(publicData?.publicUrl);
      nextQrStoragePath = uploadedPath;
    }

    const nextInstructionText =
      instructionText || textOrNull(oldConfig?.instruction_text) || DEFAULT_INSTRUCTION;

    const { data: updatedConfig, error: updateError } = await supabaseAdminClient
      .from("donation_qr_configs")
      .upsert(
        {
          id: 1,
          qr_image_url: nextQrImageUrl,
          qr_storage_path: nextQrStoragePath,
          instruction_text: nextInstructionText,
          is_active: true,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select("id, qr_image_url, qr_storage_path, instruction_text, is_active, updated_at, updated_by")
      .single();

    if (updateError || !updatedConfig) {
      return NextResponse.json(
        {
          error: "DatabaseError",
          message: updateError?.message || "Gagal menyimpan konfigurasi QRIS.",
        },
        { status: 500 }
      );
    }

    const oldPath =
      textOrNull(oldConfig?.qr_storage_path) ||
      extractObjectPathFromPublicUrl(textOrNull(oldConfig?.qr_image_url));
    if (uploadedPath && oldPath && oldPath !== uploadedPath) {
      await supabaseAdminClient.storage.from(QR_BUCKET).remove([oldPath]);
    }

    await logAdminAudit({
      supabaseAdminClient,
      actorAuthUserId: user.id,
      action: "UPDATE_DONATION_QR",
      tableName: "donation_qr_configs",
      recordId: "1",
      oldData: oldConfig || null,
      newData: updatedConfig,
      request: req,
      extra: {
        bucket: QR_BUCKET,
        uploaded_path: uploadedPath,
        has_new_file: Boolean(uploadedPath),
      },
    });

    const response = NextResponse.json({
      success: true,
      config: updatedConfig,
      constraints: {
        max_bytes: MAX_QR_BYTES,
        max_megabytes: 5,
        allowed_mime_types: ALLOWED_MIME_TYPES,
        bucket: QR_BUCKET,
      },
    });

    setCookiesToResponse(response);
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal update QRIS.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
