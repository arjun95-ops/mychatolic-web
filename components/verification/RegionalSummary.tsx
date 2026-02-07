'use client';

import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';

interface RegionalUser {
    country?: string | null;
    diocese?: string | null;
    parish?: string | null;
}

interface Props {
    type: 'country' | 'diocese' | 'parish';
    users: RegionalUser[];
    onDrillDown: (type: 'country' | 'diocese' | 'parish', value: string) => void;
}

export default function RegionalSummary({ type, users, onDrillDown }: Props) {
    const data = useMemo(() => {
        const groups: Record<string, { total: number }> = {};
        users.forEach(u => {
            const key = u[type] || 'Tidak Diketahui';
            if (!groups[key]) groups[key] = { total: 0 };
            groups[key].total++;
        });
        return Object.entries(groups)
            .map(([name, stats]) => ({ name, ...stats }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);
    }, [users, type]);

    if (data.length === 0) return <div className="text-gray-400 text-sm italic">Belum ada data.</div>;

    return (
        <div className="space-y-3">
            {data.map((row, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-brand-50 transition cursor-pointer" onClick={() => onDrillDown(type, row.name)}>
                    <div className="flex items-center gap-3">
                        <span className="w-6 h-6 flex items-center justify-center bg-gray-100 text-gray-500 text-xs font-bold rounded-full">{idx + 1}</span>
                        <span className="text-sm font-semibold text-gray-900 truncate max-w-[200px]">{row.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="bg-brand-50 text-brand font-bold px-2 py-1 rounded text-xs">{row.total}</span>
                        <ChevronRight size={16} className="text-gray-300" />
                    </div>
                </div>
            ))}
        </div>
    );
}
