import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { format, subDays, startOfMonth, subMonths, eachDayOfInterval, eachMonthOfInterval } from "date-fns";

export const dynamic = 'force-dynamic';

export async function GET() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ error: 'Supabase credentials missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const formatDateKey = (date: Date) => format(date, 'yyyy-MM-dd');
    const formatMonthKey = (date: Date) => format(date, 'yyyy-MM');

    // Helper to fill zero data series
    const fillSeries = (data: any[], interval: { start: Date, end: Date }, type: 'day' | 'month', dateKey: string) => {
        const steps = type === 'day'
            ? eachDayOfInterval(interval)
            : eachMonthOfInterval(interval);

        return steps.map(step => {
            const key = type === 'day' ? formatDateKey(step) : formatMonthKey(step);
            const match = data.find(d => {
                if (type === 'day') return d[dateKey] === key;
                return d[dateKey].substring(0, 7) === key;
            });
            return {
                date: key,
                label: type === 'day' ? format(step, 'dd MMM') : format(step, 'MMM yy'),
                count: match ? match.count : 0
            };
        });
    };

    try {
        const today = new Date();

        // 1. Basic Counts
        const [
            { count: countries_total },
            { count: dioceses_total },
            { count: churches_total },
            { count: articles_total },
            { count: reports_total },
            { count: reports_open_count }
        ] = await Promise.all([
            supabase.from('countries').select('*', { count: 'exact', head: true }),
            supabase.from('dioceses').select('*', { count: 'exact', head: true }),
            supabase.from('churches').select('*', { count: 'exact', head: true }),
            supabase.from('articles').select('*', { count: 'exact', head: true }),
            supabase.from('reports').select('*', { count: 'exact', head: true }),
            supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'OPEN')
        ]);

        // 2. User Stats & Roles
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, role, is_catechumen, account_status, verification_status, country_id, diocese_id, church_id');

        if (profilesError) throw profilesError;

        let users_verified = 0;
        let users_pending = 0;
        let users_rejected = 0;
        let users_unverified = 0;

        const roleMap: Record<string, number> = {};
        const countryMap: Record<string, number> = {};
        const dioceseMap: Record<string, number> = {};
        const churchMap: Record<string, number> = {};

        profiles.forEach(u => {
            // Status calc
            let status = 'unverified';
            if (u.account_status === 'banned') status = 'banned';
            else if (u.account_status === 'rejected' || u.verification_status === 'rejected') status = 'rejected';
            else if (u.verification_status === 'verified_catholic' || u.verification_status === 'verified_pastoral' || u.account_status === 'verified') status = 'verified';
            else if (u.verification_status === 'pending' || u.account_status === 'pending') status = 'pending';

            if (status === 'verified') users_verified++;
            else if (status === 'pending') users_pending++;
            else if (status === 'rejected') users_rejected++;
            else users_unverified++;

            // Role calc
            let r = u.role || 'umat';
            if (u.is_catechumen) r = 'katekumen';
            roleMap[r] = (roleMap[r] || 0) + 1;

            // Location calc
            if (u.country_id) countryMap[u.country_id] = (countryMap[u.country_id] || 0) + 1;
            if (u.diocese_id) dioceseMap[u.diocese_id] = (dioceseMap[u.diocese_id] || 0) + 1;
            if (u.church_id) churchMap[u.church_id] = (churchMap[u.church_id] || 0) + 1;
        });

        const roles = Object.entries(roleMap)
            .map(([role, count]) => ({ role, count }))
            .sort((a, b) => b.count - a.count);

        // 3. DAU
        const { data: dauData, error: dauError } = await supabase
            .from('user_daily_activity')
            .select('activity_date')
            .gte('activity_date', format(subMonths(today, 12), 'yyyy-MM-dd'))
            .order('activity_date', { ascending: true });

        if (dauError) {
            // Table might not exist yet, fallback gracefully
            console.error("Scale DAU Error (table missing?):", dauError);
        }

        const dauMap: Record<string, number> = {};
        let dau_today = 0;
        const todayKey = formatDateKey(today);

        (dauData || []).forEach((row: any) => {
            dauMap[row.activity_date] = (dauMap[row.activity_date] || 0) + 1;
            if (row.activity_date === todayKey) dau_today++;
        });

        const dauCounts = Object.entries(dauMap).map(([date, count]) => ({ date, count }));
        const dauWeek = fillSeries(dauCounts, { start: subDays(today, 6), end: today }, 'day', 'date');
        const dauMonth = fillSeries(dauCounts, { start: subDays(today, 29), end: today }, 'day', 'date');
        const dauYear = fillSeries(dauCounts, { start: subMonths(today, 11), end: today }, 'month', 'date');

        // 4. Reports Trends
        const { data: reportsTrendData, error: rptError } = await supabase
            .from('reports')
            .select('created_at')
            .gte('created_at', format(subDays(today, 7), 'yyyy-MM-dd'))
            .order('created_at');

        if (rptError && rptError.code !== '42P01') console.error("Reports Error:", rptError);

        const rptMap: Record<string, number> = {};
        (reportsTrendData || []).forEach((r: any) => {
            const d = formatDateKey(new Date(r.created_at));
            rptMap[d] = (rptMap[d] || 0) + 1;
        });

        const rptCounts = Object.entries(rptMap).map(([date, count]) => ({ date, count }));
        const rptWeek = fillSeries(rptCounts, { start: subDays(today, 6), end: today }, 'day', 'date');

        // 5. Locations Metadata
        const { data: cData } = await supabase.from('countries').select('id, name');
        const { data: dData } = await supabase.from('dioceses').select('id, name, country_id');
        const { data: chData } = await supabase.from('churches').select('id, name, diocese_id');

        const countryList = (cData || []).map(c => ({
            ...c, count: countryMap[c.id] || 0
        })).filter(c => c.count > 0).sort((a, b) => b.count - a.count);

        const dioceseList = (dData || []).map(d => ({
            ...d, count: dioceseMap[d.id] || 0
        })).filter(d => d.count > 0).sort((a, b) => b.count - a.count);

        const churchList = (chData || [])
            .map(c => ({ ...c, count: churchMap[c.id] || 0 }))
            .filter(c => c.count > 0)
            .sort((a, b) => b.count - a.count);

        return NextResponse.json({
            kpis: {
                countries: countries_total || 0,
                dioceses: dioceses_total || 0,
                churches: churches_total || 0,
                articles: articles_total || 0,
                users_total: profiles.length,
                users_verified,
                users_pending,
                users_rejected,
                users_unverified,
                dau_today,
                reports_total: reports_total || 0,
                reports_open: reports_open_count || 0
            },
            dau: { week: dauWeek, month: dauMonth, year: dauYear },
            reports: { week: rptWeek },
            roles,
            location: {
                countries: countryList,
                dioceses: dioceseList,
                churches: churchList
            }
        });

    } catch (error: any) {
        console.error('Analytics Fatal Error:', error);
        return NextResponse.json({ error: error.message || 'Server Error' }, { status: 500 });
    }
}
