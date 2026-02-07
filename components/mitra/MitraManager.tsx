"use client";

import { ComponentType, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import VerificationModal from "@/components/verification/VerificationModal";
import { useToast } from "@/components/ui/Toast";
import { Users, UserCheck, Clock } from "lucide-react";
import {
    getUserStatus,
    statusCategory,
    normalizeProfileLocation,
    VerificationUserLike,
} from "@/lib/verification-status";

interface MitraUser extends VerificationUserLike {
    id: string;
    full_name?: string | null;
    role?: string | null;
    pastoral_order?: string | null;
}

interface StatCardProps {
    title: string;
    value: number;
    icon: ComponentType<{ className?: string }>;
    color: string;
}

export default function MitraManager() {
    const { showToast } = useToast();

    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        pastors: 0,
        sisters: 0,
    });

    const [users, setUsers] = useState<MitraUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");

    const [selectedUser, setSelectedUser] = useState<MitraUser | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const clergyRoles = ['pastor', 'suster', 'frater', 'bruder'];

    const fetchStats = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('role, account_status, verification_status')
                .in('role', clergyRoles);

            if (error) throw error;
            const rows = data || [];

            setStats({
                total: rows.length,
                pending: rows.filter((u) => getUserStatus(u) === 'pending').length,
                pastors: rows.filter((u) => u.role === 'pastor').length,
                sisters: rows.filter((u) => u.role === 'suster').length,
            });
        } catch (e) {
            console.error("Error stats:", e);
        }
    };

    const fetchUsers = async () => {
        setLoading(true);

        try {
            let query = supabase
                .from('profiles')
                .select('*, countries:country_id(name), dioceses:diocese_id(name), churches:church_id(name)')
                .in('role', clergyRoles)
                .order('created_at', { ascending: false });

            if (roleFilter !== 'all') {
                query = query.eq('role', roleFilter);
            }

            if (search.trim()) {
                query = query.ilike('full_name', `%${search.trim()}%`);
            }

            const { data, error } = await query;
            if (error) throw error;

            setUsers(((data || []) as MitraUser[]).map(normalizeProfileLocation));
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : "Unknown error";
            showToast(`Gagal memuat data mitra: ${message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const delay = setTimeout(fetchUsers, 400);
        return () => clearTimeout(delay);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, roleFilter]);

    const handleDetail = (user: MitraUser) => {
        setSelectedUser(user);
        setIsModalOpen(true);
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 tracking-tight">
                    Mitra Pastoral
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                    Verifikasi Pastor, Suster, Frater, dan Bruder.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard title="Total Mitra" value={stats.total} icon={Users} color="bg-blue-500" />
                <StatCard title="Perlu Verifikasi" value={stats.pending} icon={Clock} color="bg-amber-500" />
                <StatCard title="Pastor" value={stats.pastors} icon={UserCheck} color="bg-purple-500" />
                <StatCard title="Suster" value={stats.sisters} icon={UserCheck} color="bg-pink-500" />
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-6">
                <div className="mb-6 flex flex-col md:flex-row justify-between gap-4">
                    <div className="flex bg-slate-50 dark:bg-slate-800 p-1.5 rounded-xl w-fit">
                        {['all', 'pastor', 'suster', 'frater', 'bruder'].map((role) => (
                            <button
                                key={role}
                                onClick={() => setRoleFilter(role)}
                                className={`px-4 py-2 text-sm font-semibold rounded-lg capitalize transition-all ${roleFilter === role
                                        ? 'bg-purple-600 text-white shadow-md'
                                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                                    }`}
                            >
                                {role === 'all' ? 'Semua' : role}
                            </button>
                        ))}
                    </div>

                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Cari Nama..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-4 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-purple-500 w-full md:w-64"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 uppercase tracking-wider text-xs font-bold text-slate-700 dark:text-slate-400">
                            <tr>
                                <th className="p-4">Nama Lengkap</th>
                                <th className="p-4">Role</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {users.map((user) => (
                                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                    <td className="p-4 font-semibold text-slate-900 dark:text-white">
                                        {user.full_name}
                                    </td>
                                    <td className="p-4 capitalize">
                                        <div className="flex flex-col">
                                            <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-xs font-bold w-fit">
                                                {user.role}
                                            </span>
                                            {user.pastoral_order && (
                                                <span className="text-[10px] text-slate-500 mt-1 font-medium">
                                                    {user.pastoral_order}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <StatusBadge status={getUserStatus(user)} />
                                    </td>
                                    <td className="p-4 text-center">
                                        <button
                                            onClick={() => handleDetail(user)}
                                            className="text-purple-600 hover:text-purple-700 font-bold text-xs border border-purple-200 rounded-lg px-3 py-1.5 hover:bg-purple-50 transition-all"
                                        >
                                            Review
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-slate-400">
                                        Tidak ada data.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <VerificationModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                user={selectedUser}
                onSuccess={() => {
                    setIsModalOpen(false);
                    fetchUsers();
                    fetchStats();
                    showToast("Status mitra berhasil diperbarui", "success");
                }}
            />
        </div>
    );
}

function StatCard({ title, value, icon: Icon, color }: StatCardProps) {
    return (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className={`p-3 rounded-xl ${color} text-white shadow-lg shadow-purple-900/10`}>
                <Icon className="w-6 h-6" />
            </div>
            <div>
                <p className="text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">{title}</p>
                <h3 className="text-2xl font-bold text-slate-800 dark:text-white">{value}</h3>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const category = statusCategory(status);

    if (category === 'verified') {
        return (
            <span className="text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs font-bold">
                Terverifikasi
            </span>
        );
    }
    if (category === 'rejected') {
        return (
            <span className="text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs font-bold">
                Ditolak
            </span>
        );
    }
    if (category === 'pending') {
        return (
            <span className="text-amber-600 bg-amber-50 px-2 py-1 rounded-full text-xs font-bold">
                Pending
            </span>
        );
    }
    return (
        <span className="text-slate-600 bg-slate-100 px-2 py-1 rounded-full text-xs font-bold">
            Belum Verifikasi
        </span>
    );
}
