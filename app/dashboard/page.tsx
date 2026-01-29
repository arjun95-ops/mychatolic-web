'use client';

import { useEffect, useState } from 'react';
import StatsCards from '@/components/verification/StatsCards';
import RegionalSummary from '@/components/verification/RegionalSummary';
import { Users, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/admin/users')
            .then(res => res.json())
            .then(data => {
                setAllUsers(data.users || []);
                setLoading(false);
            })
            .catch(err => console.error(err));
    }, []);

    return (
        <div className="space-y-8 p-6">
            {/* Header Ringkas */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Dashboard Utama</h1>
                    <p className="text-gray-500 mt-2">Ringkasan aktivitas umat dan wilayah gereja.</p>
                </div>
                <Link
                    href="/dashboard/verification"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition flex items-center gap-2 shadow-sm"
                >
                    Kelola User <ArrowRight size={18} />
                </Link>
            </div>

            {/* 1. Statistik Utama (View Only) */}
            <section>
                <StatsCards users={allUsers} />
            </section>

            {/* 2. Insight Wilayah (Top 5 Only) */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Card Keuskupan */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-6">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Users size={20} /></div>
                        <div>
                            <h3 className="font-bold text-gray-900">Sebaran per Keuskupan</h3>
                            <p className="text-xs text-gray-500">Top 5 Keuskupan dengan user terbanyak</p>
                        </div>
                    </div>
                    {/* Kirim props kosong untuk onDrillDown karena ini view-only */}
                    <RegionalSummary type="diocese" users={allUsers} onDrillDown={() => { }} />
                </div>

                {/* Card Paroki */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-6">
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><Users size={20} /></div>
                        <div>
                            <h3 className="font-bold text-gray-900">Sebaran per Paroki</h3>
                            <p className="text-xs text-gray-500">Top 5 Paroki dengan user terbanyak</p>
                        </div>
                    </div>
                    <RegionalSummary type="parish" users={allUsers} onDrillDown={() => { }} />
                </div>
            </section>
        </div>
    );
}
