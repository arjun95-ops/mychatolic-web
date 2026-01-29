import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        // 1. Validasi Service Role Key
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!serviceRoleKey) {
            console.error('SERVER ERROR: SUPABASE_SERVICE_ROLE_KEY is missing in .env.local');
            return NextResponse.json(
                { error: 'Server misconfiguration: Service Role Key missing' },
                { status: 500 }
            );
        }

        // 2. Init Admin Client (Bypass RLS)
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceRoleKey,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            }
        );

        // 3. Parse Body
        const body = await request.json();
        const { userId, updates } = body;

        if (!userId || !updates) {
            return NextResponse.json(
                { error: 'Missing required fields: userId or updates' },
                { status: 400 }
            );
        }

        // 4. Update Profile via Admin Client
        const { data, error } = await supabaseAdmin
            .from('profiles')
            .update(updates)
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            console.error('Supabase Admin Error:', error);
            throw error;
        }

        return NextResponse.json({ success: true, data });

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
