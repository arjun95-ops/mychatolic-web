"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import UserTable from "@/components/verification/UserTable";
// Re-using VerificationModal since logic is identical
import VerificationModal from "@/components/verification/VerificationModal";
import { useToast } from "@/components/ui/Toast";
import { Users, UserCheck, Clock, ShieldAlert } from "lucide-react";

export default function MitraManager() {
    const { showToast } = useToast();

    // Stats State
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        pastors: 0,
        sisters: 0
    });

    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");

    // Modal State
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    // Fetch Stats
    const fetchStats = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('role, verification_status')
                .in('role', ['pastor', 'suster', 'frater', 'bruder']);

            if (data) {
                setStats({
                    total: data.length,
                    pending: data.filter(u => u.verification_status === 'pending').length,
                    pastors: data.filter(u => u.role === 'pastor').length,
                    sisters: data.filter(u => u.role === 'suster').length
                });
            }
        } catch (e) {
            console.error("Error stats:", e);
        }
    };

    // Fetch Users
    const fetchUsers = async () => {
        setLoading(true);
        let query = supabase
            .from('profiles')
            .select('*')
            .in('role', ['pastor', 'suster', 'frater', 'bruder'])
            .order('created_at', { ascending: false });

        if (roleFilter !== 'all') {
            query = query.eq('role', roleFilter);
        }

        if (search) {
            query = query.ilike('full_name', `%${search}%`);
        }

        const { data, error } = await query;
        if (error) {
            showToast("Gagal memuat data mitra", "error");
        } else {
            setUsers(data || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchStats();
    }, []);

    useEffect(() => {
        const delay = setTimeout(fetchUsers, 500);
        return () => clearTimeout(delay);
    }, [search, roleFilter]);

    // Handlers
    const handleDetail = (user: any) => {
        setSelectedUser(user);
        setIsModalOpen(true);
    };

    const handleVerify = async (status: 'approved' | 'rejected') => {
        if (!selectedUser) return;
        setIsUpdating(true);

        try {
            const updates: any = {
                verification_status: status
            };

            if (status === 'approved') {
                updates.is_approved_role = true;
            }

            const { error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', selectedUser.id);

            if (error) throw error;

            showToast(`Mitra berhasil di-${status === 'approved' ? 'terima' : 'tolak'}`, "success");
            setIsModalOpen(false);
            fetchUsers();
            fetchStats();
        } catch (e: any) {
            showToast("Error: " + e.message, "error");
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 tracking-tight">Mitra Pastoral</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Verifikasi Pastor, Suster, Frater, dan Bruder.</p>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard title="Total Mitra" value={stats.total} icon={Users} color="bg-blue-500" />
                <StatCard title="Perlu Verifikasi" value={stats.pending} icon={Clock} color="bg-amber-500" />
                <StatCard title="Pastor" value={stats.pastors} icon={UserCheck} color="bg-purple-500" />
                <StatCard title="Suster" value={stats.sisters} icon={UserCheck} color="bg-pink-500" />
            </div>

            {/* Re-using UserTable but we might want to customize role tabs */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-6">
                <div className="mb-6 flex flex-col md:flex-row justify-between gap-4">
                    {/* Role Filter Override for Mitra */}
                    <div className="flex bg-slate-50 dark:bg-slate-800 p-1.5 rounded-xl w-fit">
                        {['all', 'pastor', 'suster', 'frater'].map(role => (
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

                    {/* Search */}
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

                {/* Using UserTable but ignoring its internal header controls by reusing the table part logic if possible, 
                    OR just rendering UserTable normally but passing filtered 'roles' props would be cleaner if UserTable supported it.
                    Since UserTable has hardcoded roles, let's just use it to display the list, 
                    BUT UserTable has its own internal controls (search/tabs) which conflicts with our custom ones above.
                    
                    BETTER APPROACH: Let's create a simplified Table view here since we already fetched data.
                */}

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
                                    <td className="p-4 font-semibold text-slate-900 dark:text-white">{user.full_name}</td>
                                    <td className="p-4 capitalize">
                                        <div className="flex flex-col">
                                            <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-xs font-bold w-fit">{user.role}</span>
                                            {user.pastoral_order && (
                                                <span className="text-[10px] text-slate-500 mt-1 font-medium">{user.pastoral_order}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <StatusBadge status={user.verification_status} />
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
                                    <td colSpan={4} className="p-8 text-center text-slate-400">Tidak ada data.</td>
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
                onVerify={handleVerify}
                isUpdating={isUpdating}
            />
        </div>
    );
}

function StatCard({ title, value, icon: Icon, color }: any) {
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
    if (status === 'approved') return <span className="text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs font-bold">Verified</span>;
    if (status === 'rejected') return <span className="text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs font-bold">Rejected</span>;
    return <span className="text-amber-600 bg-amber-50 px-2 py-1 rounded-full text-xs font-bold">Pending</span>;
}
