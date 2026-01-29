'use client';

import { ChevronRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

interface Props {
    type: 'country' | 'diocese' | 'parish';
    users: any[];
    onDrillDown: (type: 'country' | 'diocese' | 'parish', value: string) => void;
}

export default function RegionalSummary({ type, users, onDrillDown }: Props) {
    const [localSearch, setLocalSearch] = useState('');

    const data = useMemo(() => {
        const groups: Record<string, { total: number; pending: number; verified: number }> = {};
        users.forEach(u => {
            const key = u[type] || 'Tidak Diketahui';
            if (!groups[key]) groups[key] = { total: 0, pending: 0, verified: 0 };
            groups[key].total++;
            if (u.account_status === 'pending') groups[key].pending++;
            if (['verified_catholic', 'verified_pastoral', 'approved'].includes(u.account_status)) groups[key].verified++;
        });

        return Object.entries(groups)
            .map(([name, stats]) => ({ name, ...stats }))
            .filter(item => item.name.toLowerCase().includes(localSearch.toLowerCase()))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5); // LIMIT TOP 5 UNTUK DASHBOARD
    }, [users, type, localSearch]);

    const headers = { country: 'Negara', diocese: 'Keuskupan', parish: 'Paroki' };

    return (
        <div className="space-y-4">
            {/* Local Search (Optional di Dashboard View) */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                    type="text"
                    placeholder={`Cari ${headers[type]}...`}
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-100 bg-gray-50 focus:bg-white transition-all"
                />
            </div>

            <div className="flex flex-col gap-2">
                {data.length === 0 ? (
                    <div className="p-4 text-center text-gray-400 text-sm bg-gray-50 rounded-lg border border-dashed border-gray-200">
                        Tidak ada data.
                    </div>
                ) : (
                    data.map((row, idx) => (
                        <div
                            key={row.name}
                            className="group flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-brand-100 hover:bg-brand-50/30 transition-all cursor-pointer"
                            onClick={() => onDrillDown(type, row.name)}
                        >
                            <div className="flex items-center gap-3 overflow-hidden">
                                <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-gray-100 text-gray-500 text-xs font-bold rounded-full">
                                    {idx + 1}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 truncate">{row.name}</p>
                                    <div className="flex gap-2 text-xs text-gray-500">
                                        <span className="text-success">{row.verified} Verif</span>
                                        <span>•</span>
                                        <span className="text-pending">{row.pending} Pending</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="font-bold text-brand bg-brand-50 px-2 py-1 rounded text-xs">
                                    {row.total}
                                </span>
                                <ChevronRight size={16} className="text-gray-300 group-hover:text-brand transition-colors" />
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
