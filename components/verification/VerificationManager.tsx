"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import StatsCards from "./StatsCards";
import UserTable from "./UserTable";
import VerificationModal from "./VerificationModal";
import { useToast } from "@/components/ui/Toast";

export default function VerificationManager() {
    const { showToast } = useToast();

    // Inisialisasi Supabase Client
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // State
    const [stats, setStats] = useState({
        totalUmat: 0,
        pendingVerification: 0,
        totalChurches: 0,
        totalDioceses: 0
    });

    // Refresh Key Trigger
    const [refreshKey, setRefreshKey] = useState(0);

    // Modal State
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

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

    // Effects
    useEffect(() => {
        fetchStats();
    }, [refreshKey]); // Update stats when refreshKey changes

    // Handlers
    const handleDetail = (user: any) => {
        setSelectedUser(user);
        setIsModalOpen(true);
    };

    // Callback ketika modal sukses melakukan update
    const handleSuccessUpdate = () => {
        setRefreshKey(prev => prev + 1); // Trigger refresh
        setIsModalOpen(false);
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

            {/* Main Table - Menerima refreshTrigger */}
            <UserTable
                refreshTrigger={refreshKey}
                onViewDetail={handleDetail}
            />

            {/* Detail Modal */}
            <VerificationModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                user={selectedUser}
                onSuccess={handleSuccessUpdate}
            />
        </div>
    );
}
