'use client';

import { Users, Clock, CheckCircle, XCircle } from 'lucide-react';

interface Props {
    users?: any[]; // FIXED: Optional agar tidak strict
    onStatClick?: (status: string) => void; // FIXED: Optional juga
}

export default function StatsCards({ users = [], onStatClick }: Props) {
    // SAFE GUARD: Pastikan users selalu array
    const safeUsers = Array.isArray(users) ? users : [];

    const stats = {
        total: safeUsers.length,
        pending: safeUsers.filter(u => u.account_status === 'pending').length,
        verified: safeUsers.filter(u => ['verified_catholic', 'verified_pastoral', 'approved'].includes(u.account_status)).length,
        rejected: safeUsers.filter(u => u.account_status === 'rejected').length,
    };

    const handleClick = (key: string) => {
        if (onStatClick) {
            onStatClick(key);
        }
    };

    const Card = ({ title, count, icon: Icon, color, bg, filterKey }: any) => (
        <div
            onClick={() => handleClick(filterKey)}
            className={`bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between transition-all group ${onStatClick ? 'cursor-pointer hover:shadow-md hover:scale-[1.02]' : ''}`}
        >
            <div>
                <p className="text-sm font-medium text-gray-500 uppercase group-hover:text-gray-700 transition-colors">{title}</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">{count}</h3>
            </div>
            <div className={`p-3 rounded-full ${bg} group-hover:bg-opacity-80 transition`}>
                <Icon size={24} className={color} />
            </div>
        </div>
    );

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card title="Total User" count={stats.total} icon={Users} color="text-blue-600" bg="bg-blue-50" filterKey="all" />
            <Card title="Pending" count={stats.pending} icon={Clock} color="text-yellow-600" bg="bg-yellow-50" filterKey="pending" />
            <Card title="Terverifikasi" count={stats.verified} icon={CheckCircle} color="text-green-600" bg="bg-green-50" filterKey="verified" />
            <Card title="Ditolak" count={stats.rejected} icon={XCircle} color="text-red-600" bg="bg-red-50" filterKey="rejected" />
        </div>
    );
}
