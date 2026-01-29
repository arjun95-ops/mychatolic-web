'use client';

import { useEffect, useState } from 'react';
import StatsCards from '@/components/verification/StatsCards';
import { LayoutDashboard } from 'lucide-react';

export default function DashboardPage() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/admin/stats')
            .then(res => res.json())
            .then(data => {
                setStats(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch stats:", err);
                setLoading(false);
            });
    }, []);

    return (
        <div className="space-y-8 p-6 lg:p-8 max-w-[1600px] mx-auto">
            {/* HEADER SECTION */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-brand-50 rounded-xl text-brand shadow-sm border border-brand-100">
                        <LayoutDashboard size={32} strokeWidth={1.5} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Executive Dashboard</h1>
                        <p className="text-text-secondary mt-1">Real-time platform overview & statistics.</p>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="h-60 flex items-center justify-center text-text-secondary animate-pulse">
                    Memuat statistik...
                </div>
            ) : (
                /* 1. STATISTIK UTAMA (Include Churches & Articles) */
                <section>
                    <StatsCards stats={stats} />
                </section>
            )}

            {!loading && stats && (
                <div className="p-6 bg-surface-light border border-gray-100 rounded-2xl shadow-sm text-center text-text-secondary py-12">
                    <p>Pilih menu <strong>Verifikasi User</strong> di sidebar untuk mengelola data umat.</p>
                </div>
            )}
        </div>
    );
}
