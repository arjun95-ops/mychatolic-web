// import { createClient } from '@supabase/supabase-js'; 
import { NextResponse, type NextRequest } from 'next/server';
import { requireApprovedAdmin } from '@/lib/admin-guard';
import {
    getUserStatus,
    isVerifiedStatus,
    VerificationUserLike,
} from '@/lib/verification-status';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    // 1. Guard: Authentication & Authorization
    const ctx = await requireApprovedAdmin(req);

    if (ctx instanceof NextResponse) {
        return ctx;
    }

    const { supabaseAdminClient, setCookiesToResponse } = ctx;

    try {
        // 2. Users Stats
        const { data: users, error: userError } = await supabaseAdminClient
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

        // 3. Churches Count (Assuming table 'churches' exists based on prompt, otherwise handle gracefull)
        // Checking for 'churches' or 'parishes'. Prompt said 'churches'.
        const { count: churchCount, error: churchError } = await supabaseAdminClient
            .from('churches')
            .select('*', { count: 'exact', head: true });
        if (churchError) {
            console.error('Failed to count churches:', churchError.message);
        }

        // 4. Articles Count
        const { count: articleCount, error: articleError } = await supabaseAdminClient
            .from('articles')
            .select('*', { count: 'exact', head: true });
        if (articleError) {
            console.error('Failed to count articles:', articleError.message);
        }

        const response = NextResponse.json({
            users: userStats,
            churches: churchCount || 0,
            articles: articleCount || 0,
        });

        setCookiesToResponse(response);
        return response;

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error("Stats API Error:", err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
