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

    const Card = ({ title, count, icon: Icon, colorClass, bgClass, onClick }: any) => (
        <div
            onClick={onClick}
            className={`bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between transition-all group ${onClick ? 'cursor-pointer hover:shadow-md' : ''}`}
        >
            <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">{title}</p>
                <h3 className={`text-4xl font-bold ${colorClass}`}>{count}</h3>
            </div>
            <div className={`p-4 rounded-xl ${bgClass}`}>
                <Icon size={28} className={colorClass} />
            </div>
        </div>
    );

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card title="Total User" count={stats.total} icon={Users} colorClass="text-brand" bgClass="bg-brand-50" onClick={() => onStatClick?.('all')} />
            <Card title="Pending" count={stats.pending} icon={Clock} colorClass="text-pending" bgClass="bg-blue-50" onClick={() => onStatClick?.('pending')} />
            <Card title="Verified" count={stats.verified} icon={CheckCircle} colorClass="text-success" bgClass="bg-green-50" onClick={() => onStatClick?.('verified')} />
            <Card title="Rejected" count={stats.rejected} icon={XCircle} colorClass="text-error" bgClass="bg-red-50" onClick={() => onStatClick?.('rejected')} />
        </div>
    );
}
