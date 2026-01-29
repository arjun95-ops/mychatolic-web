import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// PENTING: Force Dynamic agar tidak di-cache (Data selalu fresh)
export const dynamic = 'force-dynamic';

export async function GET() {
    console.log("⚡ API ADMIN USERS DIPANGGIL"); // Cek terminal VS Code nanti

    try {
        // 1. Cek Service Role Key
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error("SUPABASE_SERVICE_ROLE_KEY tidak ditemukan di .env.local");
        }

        // 2. Init Supabase Admin (Bypass RLS)
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                },
            }
        );

        // 3. Ambil Data
        const { data, error } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        console.log(`✅ Berhasil ambil ${data?.length} user dari database`);
        return NextResponse.json({ users: data || [] });

    } catch (err: any) {
        console.error("❌ API Error:", err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
