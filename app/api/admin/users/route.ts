// import { createClient } from '@supabase/supabase-js'; // Removed manually created client
import { NextResponse, type NextRequest } from 'next/server';
import { requireApprovedAdmin } from '@/lib/admin-guard';

// PENTING: Force Dynamic agar tidak di-cache (Data selalu fresh)
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    console.log("⚡ API ADMIN USERS DIPANGGIL"); // Cek terminal VS Code nanti

    // 1. Guard: Authentication & Authorization
    const ctx = await requireApprovedAdmin(req);

    if (ctx instanceof NextResponse) {
        return ctx;
    }

    const { supabaseAdminClient, setCookiesToResponse } = ctx;

    try {
        // 2. Ambil Data
        const { data, error } = await supabaseAdminClient
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        console.log(`✅ Berhasil ambil ${data?.length} user dari database`);

        const response = NextResponse.json({ users: data || [] });

        // 3. Set Cookies (Refresh authentication)
        setCookiesToResponse(response);

        return response;

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Internal Server Error';
        console.error("❌ API Error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
