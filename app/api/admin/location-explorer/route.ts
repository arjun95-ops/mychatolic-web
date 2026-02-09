// import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from "next/server"; // Added NextRequest
import { requireApprovedAdmin } from "@/lib/admin-guard"; // Added guard

export const dynamic = 'force-dynamic';

type ApiResponseBody = Record<string, unknown>;
type CountryRow = { id: string; name: string };
type DioceseRow = { id: string; name: string; country_id: string };
type ChurchRow = { id: string; name: string; diocese_id: string };

export async function GET(req: NextRequest) {
    // 1. Guard: Authentication & Authorization
    const ctx = await requireApprovedAdmin(req);

    if (ctx instanceof NextResponse) {
        return ctx;
    }

    const { supabaseAdminClient: supabase, setCookiesToResponse } = ctx;

    const { searchParams } = req.nextUrl;
    const level = searchParams.get('level'); // countries, dioceses, churches, users
    const id = searchParams.get('id');       // parent id or current level id context
    const scope = searchParams.get('scope'); // country, diocese, church (for users)
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || searchParams.get('limit') || '25'), 100);
    const q = searchParams.get('q') || '';
    const status = searchParams.get('status');
    const role = searchParams.get('role');

    // Helper to reply with cookie update
    const reply = (body: ApiResponseBody, init?: ResponseInit) => {
        const res = NextResponse.json(body, init);
        setCookiesToResponse(res);
        return res;
    };

    // Remove manual client creation


    try {
        if (level === 'countries') {
            // 1. Get Countries with counts
            let countriesQuery = supabase
                .from('countries')
                .select('*')
                .order('name');

            if (q) {
                countriesQuery = countriesQuery.ilike('name', `%${q}%`);
            }

            const { data: countries, error } = await countriesQuery;

            if (error) throw error;

            // For counts, we can do aggregated queries or just count profiles if feasible. 
            // Optimized approach: fetch exact counts side-by-side or use a view.
            // Here we will do parallel counts for UX simplicity, assuming < 200 countries.
            // Fetch dioceses count, churches count, users count per country

            const countryRows = (countries || []) as CountryRow[];
            const items = await Promise.all(countryRows.map(async (c: CountryRow) => {
                const { count: dCount } = await supabase.from('dioceses').select('*', { count: 'exact', head: true }).eq('country_id', c.id);
                const { count: uCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('country_id', c.id);

                // Fetch recursively is expensive. Let's do basic counts.
                // For distinct churches count in country:
                // We can query dioceses in this country first.
                const { data: diocesesInCountry } = await supabase.from('dioceses').select('id').eq('country_id', c.id);
                const dioceseIds = (diocesesInCountry || []).map((d: { id: string }) => d.id);
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

            return reply({ level: 'countries', items });
        }

        if (level === 'dioceses' && id) {
            // Parent: Country
            const { data: parent } = await supabase.from('countries').select('id, name').eq('id', id).single();

            let diocesesQuery = supabase
                .from('dioceses')
                .select('*')
                .eq('country_id', id)
                .order('name');

            if (q) {
                diocesesQuery = diocesesQuery.ilike('name', `%${q}%`);
            }

            const { data: dioceses, error } = await diocesesQuery;

            if (error) throw error;

            const dioceseRows = (dioceses || []) as DioceseRow[];
            const items = await Promise.all(dioceseRows.map(async (d: DioceseRow) => {
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

            return reply({
                level: 'dioceses',
                parent,
                items
            });
        }

        if (level === 'churches' && id) {
            // Parent: Diocese
            // We also want Country ID/Name for breadcrumbs if possible, fetch via Diocese
            const { data: diocese } = await supabase.from('dioceses').select('id, name, country_id').eq('id', id).single();
            let parentData: { id: string; name: string; country_id: string; country_name?: string } | null = diocese;
            if (diocese) {
                const { data: country } = await supabase.from('countries').select('name').eq('id', diocese.country_id).single();
                parentData = { ...diocese, country_name: country?.name || '' };
            }

            let churchesQuery = supabase
                .from('churches')
                .select('*')
                .eq('diocese_id', id)
                .order('name');

            if (q) {
                churchesQuery = churchesQuery.ilike('name', `%${q}%`);
            }

            const { data: churches, error } = await churchesQuery;

            if (error) throw error;

            const churchRows = (churches || []) as ChurchRow[];
            const items = await Promise.all(churchRows.map(async (c: ChurchRow) => {
                const { count: uCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('church_id', c.id);
                return {
                    id: c.id,
                    name: c.name,
                    diocese_id: c.diocese_id,
                    users_count: uCount || 0
                };
            }));

            return reply({
                level: 'churches',
                parent: parentData,
                items
            });
        }

        if (level === 'users') {
            // Scope: country | diocese | church
            if (!scope || !id) {
                return reply({ error: 'Scope and ID required for users level' }, { status: 400 });
            }

            // 1. Resolve Parent & Breadcrumb Names
            const locationNames: Record<string, string> = {};
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
        verification_ktp_url, verification_document_url, baptism_certificate_url, baptism_document_url, chrism_document_url
      `, { count: 'exact' });

            // Apply Scope
            query = query.eq(filterColumn, id);

            // Apply Filters
            if (q) {
                query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`); // Added email search if possible, else fallback to just name
            }

            if (role && role !== 'all' && role !== 'semua' && role !== 'Semua Role') {
                if (role.toLowerCase() === 'katekumen') {
                    query = query.eq('is_catechumen', true);
                } else {
                    query = query.eq('role', role);
                    // Optional: ensuring is_catechumen is false if that helps data cleanliness, but keeping it simple as requested
                }
            }

            if (status && status !== 'all' && status !== 'semua' && status !== 'Semua Status') {
                if (status === 'banned') {
                    query = query.eq('account_status', 'banned');
                } else if (status === 'rejected') {
                    query = query.or('account_status.eq.rejected,verification_status.eq.rejected');
                } else if (status === 'verified') {
                    query = query.or('verification_status.eq.verified_catholic,verification_status.eq.verified_pastoral,account_status.eq.verified');
                } else if (status === 'pending') {
                    query = query.or('verification_status.eq.pending,account_status.eq.pending');
                } else if (status === 'unverified') {
                    // Sisanya (NULL/other) - Exclude all known defined statuses
                    query = query.neq('account_status', 'banned')
                        .neq('account_status', 'rejected')
                        .neq('verification_status', 'rejected')
                        .neq('verification_status', 'verified_catholic')
                        .neq('verification_status', 'verified_pastoral')
                        .neq('verification_status', 'verified')
                        .neq('verification_status', 'pending')
                        .neq('account_status', 'pending')
                        .neq('account_status', 'verified');
                }
            }

            // Apply Pagination
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;

            // NOTE: We select specific columns to avoid errors if some columns are missing in profiles
            // But per request "Query ke profiles", we assume the schema supports these common fields.
            // If email is in auth.users only, this query might fail on 'email' select if strict. 
            // We'll trust the requested 'profiles' logic.
            query = query.range(from, to).order('created_at', { ascending: false });

            const { data, count, error } = await query;

            if (error) {
                console.error("Query Error:", error);
                throw error;
            }

            return reply({
                scope,
                id,
                page,
                pageSize,
                total: count || 0,
                items: data || [],
                parent: { id, name: locationNames[scope] || 'Unknown' }, // Keeping this for UI breadcrumbs
                location_names: locationNames
            });
        }

        return reply({ error: 'Invalid Parameters' }, { status: 400 });

    } catch (err: unknown) {
        console.error('Location Explorer API Error:', err);
        const message = err instanceof Error ? err.message : 'Server Error';
        return reply({ error: message }, { status: 500 });
    }
}
