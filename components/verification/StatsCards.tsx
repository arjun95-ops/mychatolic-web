'use client';

import { Users, Clock, CheckCircle, FileText } from 'lucide-react';

interface StatsProps {
    loading: boolean;
    stats: {
        total: number;
        pending: number;
        verified: number;
        articles: number;
    };
}

export default function StatsCards({ loading, stats }: StatsProps) {

    const Card = ({ title, count, icon: Icon, colorClass, iconBg }: any) => (
        <div className="bg-surface-primary dark:bg-surface-inverse p-6 rounded-2xl border border-surface-secondary dark:border-surface-secondary/20 shadow-sm flex items-center justify-between transition-all hover:shadow-md hover:-translate-y-1">
            <div>
                <p className="text-xs font-bold text-text-secondary dark:text-text-secondary/80 uppercase tracking-widest mb-2">{title}</p>
                {loading ? (
                    <div className="h-8 w-24 bg-surface-secondary dark:bg-surface-secondary/20 animate-pulse rounded"></div>
                ) : (
                    <h3 className={`text-3xl font-extrabold tracking-tight ${colorClass}`}>{count}</h3>
                )}
            </div>
            <div className={`p-4 rounded-xl ${iconBg}`}>
                <Icon size={24} className={colorClass} strokeWidth={2.5} />
            </div>
        </div>
    );

    return (
        <>
            <Card
                title="Total User"
                count={stats.total}
                icon={Users}
                colorClass="text-brand-primary"
                iconBg="bg-brand-primary/10"
            />
            <Card
                title="Menunggu Verifikasi"
                count={stats.pending}
                icon={Clock}
                colorClass="text-status-pending"
                iconBg="bg-status-pending/10"
            />
            <Card
                title="User Terverifikasi"
                count={stats.verified}
                icon={CheckCircle}
                colorClass="text-status-success"
                iconBg="bg-status-success/10"
            />
            <Card
                title="Total Artikel"
                count={stats.articles}
                icon={FileText}
                colorClass="text-action"
                iconBg="bg-action/10"
            />
        </>
    );
}
