'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, ArrowRight, Loader2 } from 'lucide-react';

interface ChurchItem {
    id: string;
    name: string;
    diocese_id: string;
    users_count: number;
}

export default function ChurchExplorerPage({ params }: { params: Promise<{ dioceseId: string }> }) {
    const { dioceseId } = use(params);
    const [churches, setChurches] = useState<ChurchItem[]>([]);
    const [parent, setParent] = useState<{ id: string; name: string; country_id: string; country_name?: string } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchChurches() {
            try {
                const res = await fetch(`/api/admin/location-explorer?level=churches&id=${dioceseId}`);
                const data = await res.json();
                if (data.items) {
                    setChurches(data.items);
                    setParent(data.parent);
                }
            } finally {
                setLoading(false);
            }
        }
        fetchChurches();
    }, [dioceseId]);

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Link href="/dashboard" className="hover:text-action">Dashboard</Link>
                <ChevronRight size={14} />
                <Link href="/dashboard/location" className="hover:text-action">Eksplor Lokasi</Link>
                <ChevronRight size={14} />
                <Link href={`/dashboard/location/country/${parent?.country_id}`} className="hover:text-action">{parent?.country_name || '...'}</Link>
                <ChevronRight size={14} />
                <span className="text-text-primary font-medium">{parent?.name || '...'}</span>
            </div>

            <div className="bg-surface-primary border border-surface-secondary dark:border-surface-secondary/20 rounded-xl overflow-hidden shadow-sm">
                <div className="p-6 border-b border-surface-secondary dark:border-surface-secondary/20 flex justify-between items-center bg-surface-secondary/5">
                    <div>
                        <h1 className="text-2xl font-bold text-text-primary mb-1">{parent?.name || 'Memuat...'}</h1>
                        <p className="text-text-secondary text-sm">Daftar Gereja / Paroki</p>
                    </div>
                    <span className="text-xs bg-brand-primary/10 text-brand-primary px-3 py-1.5 rounded-full font-bold border border-brand-primary/20">
                        {churches.length} Paroki
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-surface-secondary dark:bg-surface-secondary/10 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Nama Paroki</th>
                                <th className="px-6 py-4 text-center">Total User</th>
                                <th className="px-6 py-4 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-secondary dark:divide-surface-secondary/20">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-6 py-4"><div className="h-4 bg-surface-secondary rounded w-64"></div></td>
                                        <td className="px-6 py-4 text-center"><div className="h-4 bg-surface-secondary rounded w-12 mx-auto"></div></td>
                                        <td className="px-6 py-4 text-right"><div className="h-8 bg-surface-secondary rounded w-24 ml-auto"></div></td>
                                    </tr>
                                ))
                            ) : churches.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-12 text-center text-text-secondary">Tidak ada data gereja/paroki.</td>
                                </tr>
                            ) : (
                                churches.map((church) => (
                                    <tr key={church.id} className="group hover:bg-surface-secondary/5 dark:hover:bg-surface-secondary/5 transition-colors">
                                        <td className="px-6 py-4 text-text-primary font-medium">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-xs ring-2 ring-transparent group-hover:ring-brand-primary/20 transition-all">
                                                    P
                                                </div>
                                                {church.name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="bg-action/10 text-action px-2 py-1 rounded-full text-xs font-bold">
                                                {church.users_count} User
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Link
                                                href={`/dashboard/location/church/${church.id}`}
                                                className="inline-flex items-center gap-2 px-4 py-2 bg-action text-text-inverse hover:bg-action/90 rounded-lg text-sm font-medium transition-all shadow-md shadow-action/20"
                                            >
                                                Lihat User <ArrowRight size={14} />
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
