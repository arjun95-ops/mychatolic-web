// import { createClient } from '@supabase/supabase-js'; 
import { NextResponse, type NextRequest } from 'next/server';
import { requireApprovedAdmin } from '@/lib/admin-guard';
import { logAdminAudit } from '@/lib/admin-audit';

export async function POST(req: NextRequest) {
    // 1. Guard: Authentication & Authorization
    const ctx = await requireApprovedAdmin(req);

    if (ctx instanceof NextResponse) {
        return ctx;
    }

    const { user: actor, supabaseAdminClient, setCookiesToResponse } = ctx;

    try {
        // 2. Parse Body
        const body = await req.json();
        const { userId, updates } = body;

        if (!userId || !updates) {
            return NextResponse.json(
                { error: 'Missing required fields: userId or updates' },
                { status: 400 }
            );
        }

        const { data: oldProfile } = await supabaseAdminClient
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

        // 3. Update Profile via Admin Client
        const { data, error } = await supabaseAdminClient
            .from('profiles')
            .update(updates)
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            console.error('Supabase Admin Error:', error);
            throw error;
        }

        await logAdminAudit({
            supabaseAdminClient,
            actorAuthUserId: actor.id,
            action: 'UPDATE_USER_VERIFICATION',
            tableName: 'profiles',
            recordId: String(userId),
            oldData: oldProfile || null,
            newData: data || updates,
            request: req,
        });

        const response = NextResponse.json({ success: true, data });
        setCookiesToResponse(response);
        return response;

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        console.error('API Error:', error);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
