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

    // Grouping Data Logic
    const data = useMemo(() => {
        const groups: Record<string, { total: number; pending: number; verified: number; rejected: number }> = {};

        users.forEach(u => {
            const key = u[type] || 'Tidak Diketahui';
            if (!groups[key]) groups[key] = { total: 0, pending: 0, verified: 0, rejected: 0 };

            groups[key].total++;
            if (u.account_status === 'pending') groups[key].pending++;
            if (['verified_catholic', 'verified_pastoral', 'approved'].includes(u.account_status)) groups[key].verified++;
            if (u.account_status === 'rejected') groups[key].rejected++;
        });

        return Object.entries(groups)
            .map(([name, stats]) => ({ name, ...stats }))
            .filter(item => item.name.toLowerCase().includes(localSearch.toLowerCase())) // Local Search Filter
            .sort((a, b) => b.total - a.total);
    }, [users, type, localSearch]);

    const headers = {
        country: 'Negara',
        diocese: 'Keuskupan',
        parish: 'Paroki / Gereja'
    };

    return (
        <div>
            {/* LOCAL SEARCH BAR */}
            <div className="p-4 border-b border-gray-100 bg-gray-50/30">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                        type="text"
                        placeholder={`Cari nama ${headers[type]}...`}
                        value={localSearch}
                        onChange={(e) => setLocalSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                            <th className="px-6 py-4">{headers[type]}</th>
                            <th className="px-6 py-4 text-center">Total User</th>
                            <th className="px-6 py-4 text-center">Pending</th>
                            <th className="px-6 py-4 text-center">Verified</th>
                            <th className="px-6 py-4 text-center">Rejected</th>
                            <th className="px-6 py-4 text-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {data.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-400">Tidak ada data ditemukan.</td>
                            </tr>
                        ) : (
                            data.map((row) => (
                                <tr
                                    key={row.name}
                                    className="hover:bg-blue-50/50 transition cursor-pointer group"
                                    onClick={() => onDrillDown(type, row.name)}
                                    title="Klik untuk melihat detail user di wilayah ini"
                                >
                                    <td className="px-6 py-4 font-medium text-gray-900">{row.name}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full text-xs font-bold">{row.total}</span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {row.pending > 0 ? <span className="bg-yellow-100 text-yellow-700 px-2.5 py-1 rounded-full text-xs font-bold">{row.pending}</span> : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {row.verified > 0 ? <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-bold">{row.verified}</span> : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {row.rejected > 0 ? <span className="bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold">{row.rejected}</span> : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-blue-600 hover:text-blue-800 text-xs font-semibold flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition">
                                            Lihat Daftar <ChevronRight size={14} />
                                        </button>
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
