'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronRight, ArrowRight } from 'lucide-react';

interface CountryItem {
    id: string;
    name: string;
    dioceses_count: number;
    churches_count: number;
    users_count: number;
}

export default function LocationExplorerPage() {
    const [countries, setCountries] = useState<CountryItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchCountries() {
            try {
                const res = await fetch('/api/admin/location-explorer?level=countries');
                const data = await res.json();
                if (data.items) setCountries(data.items);
            } finally {
                setLoading(false);
            }
        }
        fetchCountries();
    }, []);

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Link href="/dashboard" className="hover:text-action">Dashboard</Link>
                <ChevronRight size={14} />
                <span className="text-text-primary font-medium">Eksplor Lokasi</span>
            </div>

            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-text-primary">Eksplor Lokasi: Negara</h1>
            </div>

            <div className="bg-surface-primary border border-surface-secondary dark:border-surface-secondary/20 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <thead className="bg-surface-secondary dark:bg-surface-secondary/10 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                        <tr>
                            <th className="px-6 py-4">Nama Negara</th>
                            <th className="px-6 py-4 text-center">Keuskupan</th>
                            <th className="px-6 py-4 text-center">Gereja / Paroki</th>
                            <th className="px-6 py-4 text-center">Total User</th>
                            <th className="px-6 py-4 text-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-secondary dark:divide-surface-secondary/20">
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td className="px-6 py-4"><div className="h-4 bg-surface-secondary rounded w-32"></div></td>
                                    <td className="px-6 py-4 text-center"><div className="h-4 bg-surface-secondary rounded w-8 mx-auto"></div></td>
                                    <td className="px-6 py-4 text-center"><div className="h-4 bg-surface-secondary rounded w-8 mx-auto"></div></td>
                                    <td className="px-6 py-4 text-center"><div className="h-4 bg-surface-secondary rounded w-8 mx-auto"></div></td>
                                    <td className="px-6 py-4 text-right"><div className="h-8 bg-surface-secondary rounded w-20 ml-auto"></div></td>
                                </tr>
                            ))
                        ) : countries.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-text-secondary">Tidak ada data negara.</td>
                            </tr>
                        ) : (
                            countries.map((country) => (
                                <tr key={country.id} className="group hover:bg-surface-secondary/5 dark:hover:bg-surface-secondary/5 transition-colors">
                                    <td className="px-6 py-4 text-text-primary font-medium">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">🌍</span> {country.name}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center text-text-secondary font-medium">{country.dioceses_count}</td>
                                    <td className="px-6 py-4 text-center text-text-secondary font-medium">{country.churches_count}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="bg-action/10 text-action px-2 py-1 rounded-full text-xs font-bold">
                                            {country.users_count} User
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Link
                                            href={`/dashboard/location/country/${country.id}`}
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-surface-primary border border-action/30 text-action hover:bg-action hover:text-text-inverse rounded-lg text-sm font-medium transition-all shadow-sm"
                                        >
                                            Detail <ArrowRight size={14} />
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
