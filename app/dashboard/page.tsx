'use client';

import { useEffect, useState } from 'react';
import StatsCards from '@/components/verification/StatsCards';
import RegionalSummary from '@/components/verification/RegionalSummary';
import { LayoutDashboard, ArrowRight, Users, MapPin } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Fetch data dari API Route (Server-side bypass RLS)
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
        <div className="space-y-8 p-6 lg:p-8 max-w-[1600px] mx-auto">
            {/* HEADER SECTION */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-brand-50 rounded-xl text-brand shadow-sm border border-brand-100">
                        <LayoutDashboard size={32} strokeWidth={1.5} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Dashboard Utama</h1>
                        <p className="text-gray-500 mt-1">Ringkasan aktivitas umat dan statistik wilayah.</p>
                    </div>
                </div>

                <Link
                    href="/dashboard/verification"
                    className="group bg-action hover:bg-action-hover text-white px-6 py-3 rounded-xl font-medium shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                >
                    <span>Kelola & Verifikasi User</span>
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </Link>
            </div>

            {/* 1. STATISTIK UTAMA */}
            <section>
                <StatsCards users={allUsers} />
            </section>

            {/* 2. REGIONAL INSIGHTS (Grid 2 Kolom) */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Card Keuskupan */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-purple-50 text-purple-600 rounded-lg border border-purple-100">
                            <MapPin size={22} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 text-lg">Top Keuskupan</h3>
                            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Basis User Terbesar</p>
                        </div>
                    </div>
                    <RegionalSummary type="diocese" users={allUsers} onDrillDown={() => { }} />
                </div>

                {/* Card Paroki */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-orange-50 text-orange-600 rounded-lg border border-orange-100">
                            <Users size={22} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 text-lg">Top Paroki</h3>
                            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Gereja Paling Aktif</p>
                        </div>
                    </div>
                    <RegionalSummary type="parish" users={allUsers} onDrillDown={() => { }} />
                </div>
            </section>
        </div>
    );
}
