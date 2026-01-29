import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        );

        // 1. Users Stats
        const { data: users, error: userError } = await supabase
            .from('profiles')
            .select('account_status');

        if (userError) throw userError;

        const userStats = {
            total: users?.length || 0,
            pending: users?.filter(u => u.account_status === 'pending').length || 0,
            verified: users?.filter(u => ['verified_catholic', 'verified_pastoral', 'approved'].includes(u.account_status)).length || 0,
            rejected: users?.filter(u => u.account_status === 'rejected').length || 0,
        };

        // 2. Churches Count (Assuming table 'churches' exists based on prompt, otherwise handle gracefull)
        // Checking for 'churches' or 'parishes'. Prompt said 'churches'.
        const { count: churchCount, error: churchError } = await supabase
            .from('churches')
            .select('*', { count: 'exact', head: true });

        // 3. Articles Count
        const { count: articleCount, error: articleError } = await supabase
            .from('articles')
            .select('*', { count: 'exact', head: true });

        return NextResponse.json({
            users: userStats,
            churches: churchCount || 0,
            articles: articleCount || 0,
        });

    } catch (err: any) {
        console.error("Stats API Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
