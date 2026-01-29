'use client';

import { Users, Clock, CheckCircle, XCircle, BookOpen, MapPin } from 'lucide-react';

interface StatsData {
    users: {
        total: number;
        pending: number;
        verified: number;
        rejected: number;
    };
    churches?: number;
    articles?: number;
}

interface Props {
    stats?: StatsData; // Direct stats object
    users?: any[]; // Legacy support (calculates stats from array)
    onStatClick?: (status: string) => void;
}

export default function StatsCards({ stats: propStats, users, onStatClick }: Props) {
    // Calculate or use provided stats
    const data = propStats?.users || (users ? {
        total: users.length,
        pending: users.filter(u => u.account_status === 'pending').length,
        verified: users.filter(u => ['verified_catholic', 'verified_pastoral', 'approved'].includes(u.account_status)).length,
        rejected: users.filter(u => u.account_status === 'rejected').length,
    } : { total: 0, pending: 0, verified: 0, rejected: 0 });

    const Card = ({ title, count, icon: Icon, colorClass, bgClass, onClick }: any) => (
        <div
            onClick={onClick}
            className={`bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between transition-all group ${onClick ? 'cursor-pointer hover:-translate-y-1 hover:shadow-md' : ''}`}
        >
            <div>
                <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-1">{title}</p>
                <h3 className={`text-3xl font-extrabold tracking-tight ${colorClass}`}>{count}</h3>
            </div>
            <div className={`p-4 rounded-xl ${bgClass} group-hover:scale-110 transition-transform duration-300`}>
                <Icon size={24} className={colorClass} strokeWidth={2} />
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* User Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card
                    title="Total User"
                    count={data.total}
                    icon={Users}
                    colorClass="text-brand" // #1F5D8C
                    bgClass="bg-brand-50"
                    onClick={() => onStatClick?.('all')}
                />
                <Card
                    title="Pending Verifikasi"
                    count={data.pending}
                    icon={Clock}
                    colorClass="text-pending" // #4A90E2
                    bgClass="bg-pending-light"
                    onClick={() => onStatClick?.('pending')}
                />
                <Card
                    title="Terverifikasi"
                    count={data.verified}
                    icon={CheckCircle}
                    colorClass="text-success"
                    bgClass="bg-success-light"
                    onClick={() => onStatClick?.('verified')}
                />
                <Card
                    title="Ditolak"
                    count={data.rejected}
                    icon={XCircle}
                    colorClass="text-error"
                    bgClass="bg-error-light"
                    onClick={() => onStatClick?.('rejected')}
                />
            </div>

            {/* Optional: Content Stats Row (Only if props provided) */}
            {(propStats?.churches !== undefined || propStats?.articles !== undefined) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                    {propStats.churches !== undefined && (
                        <Card
                            title="Total Gereja"
                            count={propStats.churches}
                            icon={MapPin}
                            colorClass="text-brand"
                            bgClass="bg-brand-50"
                        />
                    )}
                    {propStats.articles !== undefined && (
                        <Card
                            title="Total Artikel/Berita"
                            count={propStats.articles}
                            icon={BookOpen}
                            colorClass="text-action"
                            bgClass="bg-blue-50"
                        />
                    )}
                </div>
            )}
        </div>
    );
}
