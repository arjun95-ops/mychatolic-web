"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import StatsCards from "./StatsCards";
import UserTable from "./UserTable";
import VerificationModal from "./VerificationModal";
import { useToast } from "@/components/ui/Toast";

export default function VerificationManager() {
    const { showToast } = useToast();

    // State
    const [stats, setStats] = useState({
        totalUmat: 0,
        pendingVerification: 0,
        totalChurches: 0,
        totalDioceses: 0
    });
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("umat");

    // Modal State
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // NOTE: isUpdating tidak lagi dibutuhkan di Parent karena loading ditangani di dalam Modal
    // const [isUpdating, setIsUpdating] = useState(false);

    // Initial Stats Fetch
    const fetchStats = async () => {
        try {
            // Parallel requests for efficiency
            const [usersRes, pendingRes, churchesRes, diocesesRes] = await Promise.all([
                supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'umat'),
                supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('verification_status', 'pending'),
                supabase.from('churches').select('id', { count: 'exact', head: true }),
                supabase.from('dioceses').select('id', { count: 'exact', head: true })
            ]);

            setStats({
                totalUmat: usersRes.count || 0,
                pendingVerification: pendingRes.count || 0,
                totalChurches: churchesRes.count || 0,
                totalDioceses: diocesesRes.count || 0
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
            showToast("Gagal memuat data user", "error");
        } else {
            setUsers(data || []);
        }
        setLoading(false);
    };

    // Effects
    useEffect(() => {
        fetchStats();
    }, []); // Only once on mount

    useEffect(() => {
        const delay = setTimeout(fetchUsers, 500);
        return () => clearTimeout(delay);
    }, [search, roleFilter]);

    // Handlers
    const handleDetail = (user: any) => {
        setSelectedUser(user);
        setIsModalOpen(true);
    };

    // Callback ketika modal sukses melakukan update
    const handleSuccessUpdate = () => {
        fetchUsers(); // Refresh tabel data
        fetchStats(); // Update statistik (pending count berkurang)
        setIsModalOpen(false); // Tutup modal (meskipun di dalam modal sudah ada, ini safety)
    };

    return (
        <div className="p-6 md:p-8 space-y-8 bg-gray-50 min-h-screen">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Verifikasi Pendaftaran</h1>
                <span className="text-sm text-gray-500 bg-white px-3 py-1 rounded-full border border-gray-200">
                    MyCatholic Admin
                </span>
            </div>

            {/* Stats */}
            <StatsCards stats={stats} />

            {/* Main Table */}
            <UserTable
                users={users}
                loading={loading}
                search={search}
                setSearch={setSearch}
                roleFilter={roleFilter}
                setRoleFilter={setRoleFilter}
                onViewDetail={handleDetail}
            />

            {/* Detail Modal */}
            <VerificationModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                user={selectedUser}
                onSuccess={handleSuccessUpdate} // CONNECTED: Sinyal sukses memicu refresh
            />
        </div>
    );
}
