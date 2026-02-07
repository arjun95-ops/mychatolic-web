import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
    getUserStatus,
    isVerifiedStatus,
    VerificationUserLike,
} from '@/lib/verification-status';

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
            .select('account_status, verification_status');

        if (userError) throw userError;

        const rows = (users || []) as VerificationUserLike[];

        const userStats = {
            total: rows.length,
            pending: rows.filter((u) => getUserStatus(u) === 'pending').length,
            verified: rows.filter((u) => isVerifiedStatus(getUserStatus(u))).length,
            rejected: rows.filter((u) => getUserStatus(u) === 'rejected').length,
        };

        // 2. Churches Count (Assuming table 'churches' exists based on prompt, otherwise handle gracefull)
        // Checking for 'churches' or 'parishes'. Prompt said 'churches'.
        const { count: churchCount, error: churchError } = await supabase
            .from('churches')
            .select('*', { count: 'exact', head: true });
        if (churchError) {
            console.error('Failed to count churches:', churchError.message);
        }

        // 3. Articles Count
        const { count: articleCount, error: articleError } = await supabase
            .from('articles')
            .select('*', { count: 'exact', head: true });
        if (articleError) {
            console.error('Failed to count articles:', articleError.message);
        }

        return NextResponse.json({
            users: userStats,
            churches: churchCount || 0,
            articles: articleCount || 0,
        });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error("Stats API Error:", err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
