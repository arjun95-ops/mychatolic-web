'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, ArrowRight, Loader2 } from 'lucide-react';

interface DioceseItem {
    id: string;
    name: string;
    country_id: string;
    churches_count: number;
    users_count: number;
}

export default function DioceseExplorerPage({ params }: { params: Promise<{ countryId: string }> }) {
    const { countryId } = use(params);
    const [dioceses, setDioceses] = useState<DioceseItem[]>([]);
    const [parent, setParent] = useState<{ id: string; name: string } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchDioceses() {
            try {
                const res = await fetch(`/api/admin/location-explorer?level=dioceses&id=${countryId}`);
                const data = await res.json();
                if (data.items) {
                    setDioceses(data.items);
                    setParent(data.parent);
                }
            } finally {
                setLoading(false);
            }
        }
        fetchDioceses();
    }, [countryId]);

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Link href="/dashboard" className="hover:text-action">Dashboard</Link>
                <ChevronRight size={14} />
                <Link href="/dashboard/location" className="hover:text-action">Eksplor Lokasi</Link>
                <ChevronRight size={14} />
                <span className="text-text-primary font-medium">{parent?.name || '...'}</span>
            </div>

            <div className="bg-surface-primary border border-surface-secondary dark:border-surface-secondary/20 rounded-xl overflow-hidden shadow-sm">
                <div className="p-6 border-b border-surface-secondary dark:border-surface-secondary/20 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-text-primary mb-1">{parent?.name || 'Memuat...'}</h1>
                        <p className="text-text-secondary text-sm">Daftar Keuskupan</p>
                    </div>
                    <span className="text-xs bg-brand-primary/10 text-brand-primary px-3 py-1.5 rounded-full font-bold">
                        {dioceses.length} Keuskupan
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-surface-secondary dark:bg-surface-secondary/10 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Nama Keuskupan</th>
                                <th className="px-6 py-4 text-center">Gereja / Paroki</th>
                                <th className="px-6 py-4 text-center">Total User</th>
                                <th className="px-6 py-4 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-secondary dark:divide-surface-secondary/20">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-6 py-4"><div className="h-4 bg-surface-secondary rounded w-48"></div></td>
                                        <td className="px-6 py-4 text-center"><div className="h-4 bg-surface-secondary rounded w-12 mx-auto"></div></td>
                                        <td className="px-6 py-4 text-center"><div className="h-4 bg-surface-secondary rounded w-12 mx-auto"></div></td>
                                        <td className="px-6 py-4 text-right"><div className="h-8 bg-surface-secondary rounded w-24 ml-auto"></div></td>
                                    </tr>
                                ))
                            ) : dioceses.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-text-secondary">Tidak ada data keuskupan.</td>
                                </tr>
                            ) : (
                                dioceses.map((diocese) => (
                                    <tr key={diocese.id} className="group hover:bg-surface-secondary/5 dark:hover:bg-surface-secondary/5 transition-colors">
                                        <td className="px-6 py-4 text-text-primary font-medium">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-xs ring-2 ring-transparent group-hover:ring-brand-primary/20 transition-all">
                                                    {diocese.name.charAt(0)}
                                                </div>
                                                {diocese.name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center text-text-secondary font-medium">{diocese.churches_count}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="bg-action/10 text-action px-2 py-1 rounded-full text-xs font-bold">
                                                {diocese.users_count} User
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Link
                                                href={`/dashboard/location/diocese/${diocese.id}`}
                                                className="inline-flex items-center gap-2 px-4 py-2 text-action hover:bg-action hover:text-text-inverse rounded-lg text-sm font-medium transition-colors"
                                            >
                                                Lihat Paroki <ArrowRight size={14} />
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
