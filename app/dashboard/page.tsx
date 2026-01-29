'use client';

import { useEffect, useState } from 'react';
import StatsCards from '@/components/verification/StatsCards';
import RegionalSummary from '@/components/verification/RegionalSummary';
import { LayoutDashboard, ArrowRight, MapPin, Users } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
    const [allUsers, setAllUsers] = useState<any[]>([]);

    useEffect(() => {
        fetch('/api/admin/users')
            .then(res => res.json())
            .then(data => setAllUsers(data.users || []))
            .catch(err => console.error(err));
    }, []);

    return (
        <div className="space-y-8 p-6 bg-surface-gray min-h-screen">
            {/* HEADER */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-brand-50 rounded-xl text-brand">
                        <LayoutDashboard size={32} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Dashboard Utama</h1>
                        <p className="text-gray-500 mt-1">Ringkasan aktivitas dan statistik.</p>
                    </div>
                </div>

                <Link
                    href="/dashboard/verification"
                    className="bg-action hover:bg-action-hover text-white px-6 py-3 rounded-xl font-medium shadow-md transition-all flex items-center gap-2"
                >
                    Kelola User <ArrowRight size={18} />
                </Link>
            </div>

            {/* STATISTIK */}
            <section>
                <StatsCards users={allUsers} />
            </section>

            {/* WILAYAH (Top 5) */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><MapPin size={22} /></div>
                        <h3 className="font-bold text-gray-900 text-lg">Top Keuskupan</h3>
                    </div>
                    <RegionalSummary type="diocese" users={allUsers} onDrillDown={() => { }} />
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><Users size={22} /></div>
                        <h3 className="font-bold text-gray-900 text-lg">Top Paroki</h3>
                    </div>
                    <RegionalSummary type="parish" users={allUsers} onDrillDown={() => { }} />
                </div>
            </section>
        </div>
    );
}
