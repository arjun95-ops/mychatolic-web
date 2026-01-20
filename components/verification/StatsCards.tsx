import { Users, UserCheck, Newspaper, Clock } from "lucide-react";

interface StatsCardsProps {
    stats: {
        totalUmat: number;
        pendingVerification: number;
        totalMitra: number;
        totalArticles: number;
    };
}

export default function StatsCards({ stats }: StatsCardsProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl">
                    <Users className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">Total Umat</p>
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-white">{stats.totalUmat}</h3>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl">
                    <Clock className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">Perlu Verifikasi</p>
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-white">{stats.pendingVerification}</h3>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-xl">
                    <UserCheck className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">Mitra Pastoral</p>
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-white">{stats.totalMitra}</h3>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 rounded-xl">
                    <Newspaper className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">Total Artikel</p>
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-white">{stats.totalArticles}</h3>
                </div>
            </div>
        </div>
    );
}
