import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const level = searchParams.get('level'); // countries, dioceses, churches, users
    const id = searchParams.get('id');       // parent id or current level id context
    const scope = searchParams.get('scope'); // country, diocese, church (for users)
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);
    const q = searchParams.get('q') || '';
    const status = searchParams.get('status');
    const role = searchParams.get('role');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ error: 'Configuration Error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        if (level === 'countries') {
            // 1. Get Countries with counts
            const { data: countries, error } = await supabase
                .from('countries')
                .select('*')
                .order('name');

            if (error) throw error;

            // For counts, we can do aggregated queries or just count profiles if feasible. 
            // Optimized approach: fetch exact counts side-by-side or use a view.
            // Here we will do parallel counts for UX simplicity, assuming < 200 countries.
            // Fetch dioceses count, churches count, users count per country

            const items = await Promise.all(countries.map(async (c) => {
                const { count: dCount } = await supabase.from('dioceses').select('*', { count: 'exact', head: true }).eq('country_id', c.id);
                const { count: chCount } = await supabase.from('churches').select('*', { count: 'exact', head: true }).eq('country_id', c.id); // Assuming denormalized or handled via join logic - wait, churches has diocese_id.
                // If churches only has diocese_id, we need a join or two-step. 
                // Let's do a join query for churches count in a country?
                // Supabase join syntax: churches!inner(diocese!inner(country_id))
                const { count: chCountJoined } = await supabase.from('churches').select('id', { count: 'exact', head: true })
                    .not('diocese_id', 'is', null) // filter valid
                // Actually counting churches by country might be complex without direct FK. 
                // Let's rely on standard structure: Country -> Diocese -> Church.
                // However, for list view "Jumlah Gereja", strictly we need to sum dioceses' churches.
                // Simplification for speed: fetching counts might be slow N+1.
                // Alternative: fetch all dioceses and all churches, then aggregate in memory (fast for master data < 10k rows).

                const { count: uCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('country_id', c.id);

                // Fetch recursively is expensive. Let's do basic counts.
                // For distinct churches count in country:
                // We can query dioceses in this country first.
                const { data: diocesesInCountry } = await supabase.from('dioceses').select('id').eq('country_id', c.id);
                const dioceseIds = diocesesInCountry?.map(d => d.id) || [];
                let totalChurches = 0;
                if (dioceseIds.length > 0) {
                    const { count } = await supabase.from('churches').select('*', { count: 'exact', head: true }).in('diocese_id', dioceseIds);
                    totalChurches = count || 0;
                }

                return {
                    id: c.id,
                    name: c.name,
                    dioceses_count: dCount || 0,
                    churches_count: totalChurches,
                    users_count: uCount || 0
                };
            }));

            return NextResponse.json({ level: 'countries', items });
        }

        if (level === 'dioceses' && id) {
            // Parent: Country
            const { data: parent } = await supabase.from('countries').select('id, name').eq('id', id).single();

            const { data: dioceses, error } = await supabase
                .from('dioceses')
                .select('*')
                .eq('country_id', id)
                .order('name');

            if (error) throw error;

            const items = await Promise.all(dioceses.map(async (d) => {
                const { count: chCount } = await supabase.from('churches').select('*', { count: 'exact', head: true }).eq('diocese_id', d.id);
                const { count: uCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('diocese_id', d.id);

                return {
                    id: d.id,
                    name: d.name,
                    country_id: d.country_id,
                    churches_count: chCount || 0,
                    users_count: uCount || 0
                };
            }));

            return NextResponse.json({
                level: 'dioceses',
                parent,
                items
            });
        }

        if (level === 'churches' && id) {
            // Parent: Diocese
            // We also want Country ID/Name for breadcrumbs if possible, fetch via Diocese
            const { data: diocese } = await supabase.from('dioceses').select('id, name, country_id').eq('id', id).single();
            let parentData = diocese;
            if (diocese) {
                const { data: country } = await supabase.from('countries').select('name').eq('id', diocese.country_id).single();
                (parentData as any).country_name = country?.name;
            }

            const { data: churches, error } = await supabase
                .from('churches')
                .select('*')
                .eq('diocese_id', id)
                .order('name');

            if (error) throw error;

            const items = await Promise.all(churches.map(async (c) => {
                const { count: uCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('church_id', c.id);
                return {
                    id: c.id,
                    name: c.name,
                    diocese_id: c.diocese_id,
                    users_count: uCount || 0
                };
            }));

            return NextResponse.json({
                level: 'churches',
                parent: parentData,
                items
            });
        }

        if (level === 'users') {
            // Scope: country | diocese | church
            if (!scope || !id) {
                return NextResponse.json({ error: 'Scope and ID required for users level' }, { status: 400 });
            }

            // 1. Resolve Parent & Breadcrumb Names
            const locationNames: any = {};
            let filterColumn = '';

            if (scope === 'church') {
                filterColumn = 'church_id';
                const { data: c } = await supabase.from('churches').select('id, name, diocese_id').eq('id', id).single();
                if (c) {
                    locationNames.church = c.name;
                    const { data: d } = await supabase.from('dioceses').select('id, name, country_id').eq('id', c.diocese_id).single();
                    if (d) {
                        locationNames.diocese = d.name;
                        const { data: co } = await supabase.from('countries').select('id, name').eq('id', d.country_id).single();
                        if (co) locationNames.country = co.name;
                    }
                }
            } else if (scope === 'diocese') {
                filterColumn = 'diocese_id';
                const { data: d } = await supabase.from('dioceses').select('id, name, country_id').eq('id', id).single();
                if (d) {
                    locationNames.diocese = d.name;
                    const { data: co } = await supabase.from('countries').select('id, name').eq('id', d.country_id).single();
                    if (co) locationNames.country = co.name;
                }
            } else if (scope === 'country') {
                filterColumn = 'country_id';
                const { data: co } = await supabase.from('countries').select('id, name').eq('id', id).single();
                if (co) locationNames.country = co.name;
            }

            // 2. Build Query
            let query = supabase.from('profiles').select(`
        id, full_name, baptism_name, birth_date, gender, marital_status, email,
        role, is_catechumen, faith_status,
        account_status, verification_status, verification_submitted_at, verified_at, rejection_reason,
        created_at, updated_at, last_active,
        country_id, diocese_id, church_id,
        ktp_url, baptism_cert_url, chrism_cert_url, assignment_letter_url, selfie_url,
        verification_ktp_url, verification_document_url, baptism_certificate_url, baptism_document_url, chrism_document_url, task_letter_url, verification_video_url
      `, { count: 'exact' });

            // Apply Scope
            query = query.eq(filterColumn, id);

            // Apply Filters
            if (q) {
                query = query.or(`full_name.ilike.%${q}%,baptism_name.ilike.%${q}%`);
            }

            if (role) {
                if (role === 'katekumen') {
                    query = query.eq('is_catechumen', true);
                } else {
                    query = query.eq('role', role).eq('is_catechumen', false); // Assuming mutual exclusive for clear filtering
                }
            }

            if (status) {
                if (status === 'banned') query = query.eq('account_status', 'banned');
                else if (status === 'rejected') query = query.or('account_status.eq.rejected,verification_status.eq.rejected');
                else if (status === 'verified') query = query.or('verification_status.eq.verified_catholic,verification_status.eq.verified_pastoral,account_status.eq.verified');
                else if (status === 'pending') query = query.or('verification_status.eq.pending,account_status.eq.pending');
                else if (status === 'unverified') {
                    // Hard to filter exact 'not logic' in one go efficiently without multiple negations. 
                    // Simplification: query.not('verification_status', 'in', '("verified_catholic","verified_pastoral","pending")')...
                    // For now, let's limit scope complexity. If user asks for unverified, maybe handle clientside or basic filter.
                    // Or strict:
                    query = query.neq('account_status', 'banned')
                        .neq('account_status', 'rejected')
                        .neq('verification_status', 'rejected')
                        .neq('verification_status', 'verified_catholic')
                        .neq('verification_status', 'verified_pastoral')
                        .neq('verification_status', 'pending')
                        .neq('account_status', 'pending');
                }
            }

            // Apply Pagination
            const from = (page - 1) * limit;
            const to = from + limit - 1;
            query = query.range(from, to).order('created_at', { ascending: false });

            const { data: users, count, error } = await query;
            if (error) throw error;

            return NextResponse.json({
                level: 'users',
                scope,
                parent: { id, name: locationNames[scope] || 'Unknown' },
                pagination: { page, limit, total: count || 0 },
                users,
                location_names: locationNames
            });
        }

        return NextResponse.json({ error: 'Invalid Parameters' }, { status: 400 });

    } catch (err: any) {
        console.error('Location Explorer API Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
