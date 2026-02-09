import { NextRequest, NextResponse } from "next/server";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";
import {
  getErrorMessage,
  isPermissionDenied,
  isUuid,
  isValidGrouping,
  isValidLanguageCode,
  isValidVersionCode,
  parseBibleScopeFromBody,
  parseBibleScopeFromSearchParams,
  parsePositiveInt,
  sanitizeText,
} from "@/lib/bible-admin";

export const dynamic = "force-dynamic";

type BibleBookRow = {
  id: string;
  language_code: string;
  version_code: string;
  name: string;
  abbreviation: string | null;
  grouping: "old" | "new" | "deutero";
  order_index: number;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function toSafePage(value: string | null): number {
  const parsed = Number(value || "1");
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.floor(parsed);
}

function toSafeLimit(value: string | null): number {
  const parsed = Number(value || String(DEFAULT_LIMIT));
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function validateScope(languageCode: string, versionCode: string): string | null {
  if (!isValidLanguageCode(languageCode)) {
    return "language_code tidak valid.";
  }
  if (!isValidVersionCode(versionCode)) {
    return "version_code tidak valid.";
  }
  return null;
}

function parseGroupingFilter(value: string): "old" | "new" | "deutero" | null {
  const normalized = sanitizeText(value).toLowerCase();
  if (!normalized) return null;
  if (isValidGrouping(normalized)) return normalized;
  if (normalized.includes("lama")) return "old";
  if (normalized.includes("baru")) return "new";
  if (normalized.includes("deutero")) return "deutero";
  return null;
}

export async function GET(req: NextRequest) {
  const ctx = await requireApprovedAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { supabaseAdminClient: adminClient, setCookiesToResponse } = ctx;
  const url = new URL(req.url);

  const { languageCode, versionCode } = parseBibleScopeFromSearchParams(url.searchParams);
  const scopeError = validateScope(languageCode, versionCode);
  if (scopeError) {
    return NextResponse.json(
      {
        error: "ValidationError",
        message: scopeError,
      },
      { status: 400 },
    );
  }

  const search = sanitizeText(url.searchParams.get("q"));
  const groupingInput = sanitizeText(url.searchParams.get("grouping"));
  const groupingFilter = parseGroupingFilter(groupingInput);
  const page = toSafePage(url.searchParams.get("page"));
  const limit = toSafeLimit(url.searchParams.get("limit"));

  if (groupingInput && !groupingFilter) {
    return NextResponse.json(
      {
        error: "ValidationError",
        message: "grouping tidak valid. Gunakan old/new/deutero.",
      },
      { status: 400 },
    );
  }

  let query = adminClient
    .from("bible_books")
    .select("id, language_code, version_code, name, abbreviation, grouping, order_index", {
      count: "exact",
    })
    .eq("language_code", languageCode)
    .eq("version_code", versionCode)
    .order("order_index", { ascending: true })
    .order("name", { ascending: true });

  if (groupingFilter) {
    query = query.eq("grouping", groupingFilter);
  }

  if (search) {
    const escaped = search.replace(/,/g, "\\,");
    query = query.or(`name.ilike.%${escaped}%,abbreviation.ilike.%${escaped}%`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, error, count } = await query.range(from, to);

  if (error) {
    if (isPermissionDenied(error)) {
      return NextResponse.json(
        {
          error: "PermissionDenied",
          message:
            "Service role belum punya izin akses tabel bible_books. Jalankan SQL migration/grant terlebih dahulu.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(error) },
      { status: 500 },
    );
  }

  const total = Number(count || 0);
  const res = NextResponse.json({
    success: true,
    items: (data || []) as BibleBookRow[],
    pagination: {
      page,
      limit,
      total,
      total_pages: total <= 0 ? 1 : Math.ceil(total / limit),
    },
  });
  setCookiesToResponse(res);
  return res;
}

export async function POST(req: NextRequest) {
  const ctx = await requireApprovedAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const {
    user,
    supabaseAdminClient: adminClient,
    setCookiesToResponse,
  } = ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "BadRequest", message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const id = sanitizeText((body as { id?: unknown })?.id);
  const { languageCode, versionCode } = parseBibleScopeFromBody(body);
  const scopeError = validateScope(languageCode, versionCode);
  if (scopeError) {
    return NextResponse.json(
      {
        error: "ValidationError",
        message: scopeError,
      },
      { status: 400 },
    );
  }

  const name = sanitizeText((body as { name?: unknown })?.name);
  const abbreviationRaw = sanitizeText((body as { abbreviation?: unknown })?.abbreviation);
  const groupingRaw = sanitizeText((body as { grouping?: unknown })?.grouping).toLowerCase();
  const orderIndex = parsePositiveInt((body as { order_index?: unknown })?.order_index);

  if (id && !isUuid(id)) {
    return NextResponse.json(
      { error: "ValidationError", message: "id kitab tidak valid." },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json(
      { error: "ValidationError", message: "Nama kitab wajib diisi." },
      { status: 400 },
    );
  }
  if (!isValidGrouping(groupingRaw)) {
    return NextResponse.json(
      { error: "ValidationError", message: "grouping wajib: old/new/deutero." },
      { status: 400 },
    );
  }
  if (!orderIndex) {
    return NextResponse.json(
      { error: "ValidationError", message: "order_index harus angka bulat positif." },
      { status: 400 },
    );
  }

  const { data: sameOrderRows, error: orderCheckError } = await adminClient
    .from("bible_books")
    .select("id")
    .eq("language_code", languageCode)
    .eq("version_code", versionCode)
    .eq("order_index", orderIndex)
    .neq("id", id || "00000000-0000-0000-0000-000000000000")
    .limit(1);

  if (orderCheckError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(orderCheckError) },
      { status: 500 },
    );
  }
  const orderIndexConflict = Array.isArray(sameOrderRows) && sameOrderRows.length > 0;

  const payload = {
    language_code: languageCode,
    version_code: versionCode,
    name,
    abbreviation: abbreviationRaw || null,
    grouping: groupingRaw,
    order_index: orderIndex,
  };

  if (id) {
    const { data: existing, error: existingError } = await adminClient
      .from("bible_books")
      .select("id, language_code, version_code, name, abbreviation, grouping, order_index")
      .eq("id", id)
      .eq("language_code", languageCode)
      .eq("version_code", versionCode)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: "DatabaseError", message: getErrorMessage(existingError) },
        { status: 500 },
      );
    }
    if (!existing) {
      return NextResponse.json(
        { error: "NotFound", message: "Kitab tidak ditemukan." },
        { status: 404 },
      );
    }

    const { data: updated, error: updateError } = await adminClient
      .from("bible_books")
      .update(payload)
      .eq("id", id)
      .eq("language_code", languageCode)
      .eq("version_code", versionCode)
      .select("id, language_code, version_code, name, abbreviation, grouping, order_index")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        { error: "DatabaseError", message: getErrorMessage(updateError) },
        { status: 500 },
      );
    }

    await logAdminAudit({
      supabaseAdminClient: adminClient,
      actorAuthUserId: user.id,
      action: "UPDATE_BIBLE_BOOK",
      tableName: "bible_books",
      recordId: id,
      oldData: existing as unknown as Record<string, unknown>,
      newData: (updated || payload) as unknown as Record<string, unknown>,
      request: req,
      extra: { order_index_conflict: orderIndexConflict },
    });

    const res = NextResponse.json({
      success: true,
      message: "Kitab berhasil diperbarui.",
      data: updated,
      order_index_conflict: orderIndexConflict,
    });
    setCookiesToResponse(res);
    return res;
  }

  const { data: inserted, error: insertError } = await adminClient
    .from("bible_books")
    .insert(payload)
    .select("id, language_code, version_code, name, abbreviation, grouping, order_index")
    .maybeSingle();

  if (insertError) {
    return NextResponse.json(
      { error: "DatabaseError", message: getErrorMessage(insertError) },
      { status: 500 },
    );
  }

  await logAdminAudit({
    supabaseAdminClient: adminClient,
    actorAuthUserId: user.id,
    action: "CREATE_BIBLE_BOOK",
    tableName: "bible_books",
    recordId: String((inserted as { id?: unknown })?.id || ""),
    oldData: null,
    newData: (inserted || payload) as unknown as Record<string, unknown>,
    request: req,
    extra: { order_index_conflict: orderIndexConflict },
  });

  const res = NextResponse.json({
    success: true,
    message: "Kitab berhasil ditambahkan.",
    data: inserted,
    order_index_conflict: orderIndexConflict,
  });
  setCookiesToResponse(res);
  return res;
}
