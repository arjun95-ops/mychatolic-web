"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import StatsCards from "@/components/verification/StatsCards";
import UserTable from "@/components/verification/UserTable";
import VerificationModal from "@/components/verification/VerificationModal";

// Interface for Type Safety
interface UserProfile {
    id: string;
    full_name: string;
    email: string;
    role: string;
    verification_status: string;
    created_at: string;
    verification_doc_url?: string;
    birth_date?: string;
    is_approved_role?: boolean;
    // Add other fields as necessary
}

export default function DashboardPage() {
    const { showToast } = useToast();

    // State
    const [stats, setStats] = useState({
        totalUmat: 0,
        pendingVerification: 0,
        totalMitra: 0,
        totalArticles: 0
    });
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("umat");

    // Modal State
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    // Initial Stats Fetch
    const fetchStats = async () => {
        try {
            // Parallel requests for efficiency
            const [umatRes, pendingRes, mitraRes, articlesRes] = await Promise.all([
                supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'umat'),
                supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('verification_status', 'pending'),
                supabase.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['pastor', 'suster', 'bruder', 'frater']),
                supabase.from('articles').select('id', { count: 'exact', head: true })
            ]);

            setStats({
                totalUmat: umatRes.count || 0,
                pendingVerification: pendingRes.count || 0,
                totalMitra: mitraRes.count || 0,
                totalArticles: articlesRes.count || 0
            });
        } catch (e) {
            console.error("Error fetching stats:", e);
        }
    };

    // User Data Fetch
    const fetchUsers = async () => {
        setLoading(true);

        let query = supabase
            .from('profiles')
            .select('*')
            .eq('role', roleFilter)
            .order('created_at', { ascending: false });

        if (search) {
            query = query.ilike('full_name', `%${search}%`);
        }

        const { data, error } = await query;
        if (error) {
            console.error("Fetch users error:", error);
            showToast(`Gagal memuat data: ${error.message}`, "error");
        } else {
            setUsers(data || []);
        }
        setLoading(false);
    };

    // Effects
    useEffect(() => {
        fetchStats();
    }, []);

    useEffect(() => {
        const delay = setTimeout(fetchUsers, 500);
        return () => clearTimeout(delay);
    }, [search, roleFilter]);

    // Handlers
    const handleDetail = (user: UserProfile) => {
        setSelectedUser(user);
        setIsModalOpen(true);
    };

    const handleVerify = async (status: 'approved' | 'rejected') => {
        if (!selectedUser) return;
        setIsUpdating(true);

        try {
            const updates: Partial<UserProfile> = {
                verification_status: status
            };

            // If approved, verify the role
            if (status === 'approved') {
                updates.is_approved_role = true;
            }

            const { error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', selectedUser.id);

            if (error) throw error;

            showToast(`User berhasil di-${status === 'approved' ? 'terima' : 'tolak'}`, "success");
            setIsModalOpen(false);

            // Refresh data
            fetchUsers();
            fetchStats(); // Update pending count
        } catch (e: any) {
            showToast("Gagal update status: " + (e.message || "Unknown error"), "error");
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 tracking-tight">Dashboard Overview</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Monitoring status dan verifikasi pendaftaran.</p>
                </div>
            </div>

            {/* Stats Cards */}
            <StatsCards stats={stats} />

            {/* Main Table */}
            <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-purple-600 rounded-full inline-block"></span>
                    Data Verifikasi User
                </h2>
                <UserTable
                    users={users}
                    loading={loading}
                    search={search}
                    setSearch={setSearch}
                    roleFilter={roleFilter}
                    setRoleFilter={setRoleFilter}
                    onViewDetail={handleDetail}
                />
            </div>

            {/* Modal */}
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
