'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Users, Clock, CheckCircle, XCircle, Map, Globe, Church } from 'lucide-react';

export default function StatsCards() {
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        verified: 0,
        rejected: 0,
        byCountry: [] as { name: string; count: number; users: string[] }[],
        byDiocese: [] as { name: string; count: number; users: string[] }[],
        byParish: [] as { name: string; count: number; users: string[] }[],
    });
    const [loading, setLoading] = useState(true);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        async function fetchStats() {
            try {
                // FIXED: Tambahkan full_name ke select
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, full_name, account_status, verification_status, country, diocese, parish');

                if (error) throw error;
                if (!data) return;

                // 1. Hitung Status (Sama seperti sebelumnya)
                const pending = data.filter(u => u.account_status === 'pending' || u.verification_status === 'pending').length;
                const verified = data.filter(u => ['verified_catholic', 'verified_pastoral', 'approved'].includes(u.account_status)).length;
                const rejected = data.filter(u => u.account_status === 'rejected' || u.verification_status === 'rejected').length;

                // 2. Helper untuk Grouping & Sorting + Collect Names
                const getTop5 = (field: 'country' | 'diocese' | 'parish') => {
                    const groups: Record<string, { count: number; users: string[] }> = {};

                    data.forEach(u => {
                        const val = u[field] || 'Belum Diisi';

                        if (!groups[val]) {
                            groups[val] = { count: 0, users: [] };
                        }

                        groups[val].count += 1;
                        groups[val].users.push(u.full_name || 'Tanpa Nama');
                    });

                    return Object.entries(groups)
                        .map(([name, info]) => ({
                            name,
                            count: info.count,
                            users: info.users
                        }))
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 5); // Ambil Top 5 Lokasi
                };

                setStats({
                    total: data.length,
                    pending,
                    verified,
                    rejected,
                    byCountry: getTop5('country'),
                    byDiocese: getTop5('diocese'),
                    byParish: getTop5('parish'),
                });
            } catch (err) {
                console.error('Gagal memuat statistik:', err);
            } finally {
                setLoading(false);
            }
        }

        fetchStats();
    }, [supabase]);

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-24 bg-gray-100 rounded-xl"></div>
                ))}
            </div>
        );
    }

    // --- UI COMPONENTS ---
    const StatCard = ({ title, value, icon: Icon, colorClass, bgClass }: any) => (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
                <p className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">{title}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
            </div>
            <div className={`p-3 rounded-full ${bgClass} ${colorClass}`}>
                <Icon size={24} />
            </div>
        </div>
    );

    const DistributionCard = ({ title, icon: Icon, data }: any) => (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm flex flex-col h-full">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-50 dark:border-slate-800">
                <Icon size={18} className="text-gray-400 dark:text-slate-500" />
                <h3 className="font-bold text-gray-700 dark:text-slate-200 text-sm uppercase">{title}</h3>
            </div>
            <div className="space-y-4 flex-1">
                {data.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-slate-600 italic">Belum ada data lokasi.</p>
                ) : (
                    data.map((item: any, idx: number) => (
                        <div key={idx} className="group border-b border-gray-50 dark:border-slate-800 last:border-0 pb-2 last:pb-0">
                            {/* Header: Nama Lokasi & Count */}
                            <div className="flex justify-between items-center text-sm mb-1">
                                <span className="text-gray-800 dark:text-slate-300 font-semibold truncate max-w-[70%]">
                                    {idx + 1}. {item.name}
                                </span>
                                <span className="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-md text-xs">
                                    {item.count} User
                                </span>
                            </div>

                            {/* Body: List Nama User */}
                            <div className="pl-4 border-l-2 border-gray-100 dark:border-slate-800 ml-1">
                                <p className="text-xs text-gray-500 dark:text-slate-500 leading-relaxed">
                                    {item.users.slice(0, 5).join(', ')}
                                    {item.users.length > 5 && (
                                        <span className="text-gray-400 dark:text-slate-600 italic ml-1">
                                            (+{item.users.length - 5} lainnya)
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* BARIS 1: STATUS UTAMA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Total User" value={stats.total} icon={Users} colorClass="text-blue-600" bgClass="bg-blue-50" />
                <StatCard title="Pending" value={stats.pending} icon={Clock} colorClass="text-yellow-600" bgClass="bg-yellow-50" />
                <StatCard title="Terverifikasi" value={stats.verified} icon={CheckCircle} colorClass="text-green-600" bgClass="bg-green-50" />
                <StatCard title="Ditolak" value={stats.rejected} icon={XCircle} colorClass="text-red-600" bgClass="bg-red-50" />
            </div>

            {/* BARIS 2: DISTRIBUSI LOKASI DENGAN NAMA */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <DistributionCard title="Top Negara" icon={Globe} data={stats.byCountry} />
                <DistributionCard title="Top Keuskupan" icon={Map} data={stats.byDiocese} />
                <DistributionCard title="Top Paroki" icon={Church} data={stats.byParish} />
            </div>
        </div>
    );
}
