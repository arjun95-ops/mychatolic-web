'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import StatsCards from '@/components/verification/StatsCards';
import { UserCheck, PenTool } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

export default function DashboardOverview() {
    const [stats, setStats] = useState({
        totalUsers: 0,
        pendingUsers: 0,
        totalArticles: 0,
        verifiedUsers: 0,
    });
    const [loading, setLoading] = useState(true);

    // Supabase Client
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        async function fetchStats() {
            try {
                setLoading(true);

                // 1. Total User
                const { count: totalUsers } = await supabase
                    .from('profiles')
                    .select('*', { count: 'exact', head: true });

                // 2. Pending Verification
                const { count: pendingUsers } = await supabase
                    .from('profiles')
                    .select('*', { count: 'exact', head: true })
                    .eq('account_status', 'pending');

                // 3. Verified Users
                const { count: verifiedUsers } = await supabase
                    .from('profiles')
                    .select('*', { count: 'exact', head: true })
                    .in('account_status', ['verified_catholic', 'verified_pastoral', 'approved']);

                // 4. Articles
                const { count: totalArticles } = await supabase
                    .from('articles')
                    .select('*', { count: 'exact', head: true });

                setStats({
                    totalUsers: totalUsers || 0,
                    pendingUsers: pendingUsers || 0,
                    verifiedUsers: verifiedUsers || 0,
                    totalArticles: totalArticles || 0,
                });
            } catch (error) {
                console.error("Error fetching dashboard stats:", error);
            } finally {
                setLoading(false);
            }
        }

        fetchStats();
    }, [supabase]);

    const today = format(new Date(), 'EEEE, d MMMM yyyy', { locale: id });

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-text-primary tracking-tight">
                        Dashboard Overview
                    </h1>
                    <p className="text-text-secondary mt-1 text-sm font-medium">
                        {today}
                    </p>
                </div>

                <div className="flex gap-3">
                    <Link
                        href="/dashboard/verification"
                        className="flex items-center gap-2 bg-brand-primary text-white px-5 py-2.5 rounded-lg hover:bg-brand-primary/90 transition shadow-sm font-medium text-sm"
                    >
                        <UserCheck size={18} />
                        Verifikasi User
                    </Link>
                    {/* Fallback button if articles page not exists yet, keeps layout intact */}
                    <button
                        className="flex items-center gap-2 bg-surface-primary text-text-primary border border-gray-200 px-5 py-2.5 rounded-lg hover:bg-gray-50 transition shadow-sm font-medium text-sm opacity-50 cursor-not-allowed"
                        title="Fitur belum tersedia"
                    >
                        <PenTool size={18} />
                        Tulis Artikel
                    </button>
                </div>
            </div>

            {/* STATS SECTION */}
            <section>
                <StatsCards
                    loading={loading}
                    stats={{
                        total: stats.totalUsers,
                        pending: stats.pendingUsers,
                        verified: stats.verifiedUsers,
                        articles: stats.totalArticles
                    }}
                />
            </section>

            {/* ADDITIONAL INFO / EMPTY STATE */}
            <section className="bg-surface-primary border border-gray-100 rounded-xl p-8 text-center">
                <div className="max-w-md mx-auto">
                    <h3 className="text-lg font-semibold text-text-primary mb-2">Aktivitas Terbaru</h3>
                    <p className="text-text-secondary text-sm">
                        Belum ada aktivitas terbaru yang tercatat hari ini. Silakan cek menu Verifikasi User untuk melihat permintaan yang masuk.
                    </p>
                </div>
            </section>
        </div>
    );
}
