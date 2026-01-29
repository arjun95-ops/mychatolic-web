/* eslint-disable @typescript-eslint/no-explicit-any */
import { Users, Clock, CheckCircle2, XCircle } from "lucide-react";
import { UserProfile } from "./UserDashboard";

interface Props {
    users: UserProfile[];
    onStatClick: (status: string) => void;
    currentFilter: string;
}

export default function DashboardStats({ users, onStatClick, currentFilter }: Props) {

    // Calculate stats in real-time based on ALL users (not filtered)
    const total = users.length;
    const pending = users.filter(u => ['pending'].includes(u.verification_status || u.account_status)).length;
    const verified = users.filter(u => ['verified_catholic', 'verified_pastoral', 'approved', 'verified'].includes(u.verification_status || u.account_status)).length;
    const rejected = users.filter(u => ['rejected'].includes(u.verification_status || u.account_status)).length;

    const cards = [
        {
            label: "Total User",
            value: total,
            icon: Users,
            color: "text-blue-600",
            bg: "bg-blue-50",
            borderColor: "border-blue-200",
            filterKey: "all"
        },
        {
            label: "Menunggu Verifikasi",
            value: pending,
            icon: Clock,
            color: "text-amber-600",
            bg: "bg-amber-50",
            borderColor: "border-amber-200",
            filterKey: "pending"
        },
        {
            label: "Terverifikasi",
            value: verified,
            icon: CheckCircle2,
            color: "text-emerald-600",
            bg: "bg-emerald-50",
            borderColor: "border-emerald-200",
            filterKey: "verified_catholic"
        },
        {
            label: "Ditolak",
            value: rejected,
            icon: XCircle,
            color: "text-red-600",
            bg: "bg-red-50",
            borderColor: "border-red-200",
            filterKey: "rejected"
        },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((card, idx) => {
                const isActive = currentFilter === card.filterKey;

                return (
                    <div
                        key={idx}
                        onClick={() => onStatClick(card.filterKey)}
                        className={`
                            relative overflow-hidden
                            bg-white p-5 rounded-xl border-2 shadow-sm flex items-center justify-between 
                            cursor-pointer transition-all duration-200
                            hover:shadow-md hover:scale-[1.02] active:scale-[0.98]
                            ${isActive ? `${card.borderColor} ${card.bg}` : 'border-transparent hover:border-gray-200'}
                        `}
                    >
                        {/* Active Indicator Strip */}
                        {isActive && (
                            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${card.color.replace('text-', 'bg-')}`}></div>
                        )}

                        <div>
                            <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${isActive ? card.color : 'text-gray-500'}`}>
                                {card.label}
                            </p>
                            <h3 className={`text-2xl font-bold ${isActive ? 'text-gray-900' : 'text-gray-800'}`}>
                                {card.value}
                            </h3>
                        </div>
                        <div className={`p-3 rounded-lg ${isActive ? 'bg-white' : card.bg} ${card.color}`}>
                            <card.icon size={24} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
