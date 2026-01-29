'use client';

import { Users, Clock, CheckCircle, XCircle } from 'lucide-react';

interface Props {
    users?: any[];
    onStatClick?: (status: string) => void;
}

export default function StatsCards({ users = [], onStatClick }: Props) {
    const safeUsers = Array.isArray(users) ? users : [];

    const stats = {
        total: safeUsers.length,
        pending: safeUsers.filter(u => u.account_status === 'pending').length,
        verified: safeUsers.filter(u => ['verified_catholic', 'verified_pastoral', 'approved'].includes(u.account_status)).length,
        rejected: safeUsers.filter(u => u.account_status === 'rejected').length,
    };

    const Card = ({ title, count, icon: Icon, colorClass, bgClass, filterKey }: any) => (
        <div
            onClick={() => onStatClick?.(filterKey)}
            className={`bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between transition-all group ${onStatClick ? 'cursor-pointer hover:-translate-y-1 hover:shadow-md' : ''}`}
        >
            <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 group-hover:text-gray-600 transition-colors">{title}</p>
                <h3 className={`text-4xl font-extrabold tracking-tight ${colorClass}`}>{count}</h3>
            </div>
            <div className={`p-4 rounded-xl ${bgClass} group-hover:scale-110 transition-transform duration-300`}>
                <Icon size={28} className={colorClass} strokeWidth={2} />
            </div>
        </div>
    );

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card
                title="Total User"
                count={stats.total}
                icon={Users}
                colorClass="text-brand"
                bgClass="bg-brand-50"
                filterKey="all"
            />
            <Card
                title="Menunggu"
                count={stats.pending}
                icon={Clock}
                colorClass="text-pending"
                bgClass="bg-pending-light"
                filterKey="pending"
            />
            <Card
                title="Terverifikasi"
                count={stats.verified}
                icon={CheckCircle}
                colorClass="text-success"
                bgClass="bg-success-light"
                filterKey="verified"
            />
            <Card
                title="Ditolak"
                count={stats.rejected}
                icon={XCircle}
                colorClass="text-error"
                bgClass="bg-error-light"
                filterKey="rejected"
            />
        </div>
    );
}
