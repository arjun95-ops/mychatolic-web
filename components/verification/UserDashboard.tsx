/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useMemo } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Users, Map, Globe, Church } from "lucide-react";
import DashboardStats from "./DashboardStats";
import DashboardFilters from "./DashboardFilters";
import UserTable from "./UserTable";
import RegionalSummary from "./RegionalSummary";
import VerificationModal from "./VerificationModal";
import { Toaster } from "react-hot-toast";

// --- TYPES ---
export interface UserProfile {
    id: string;
    full_name: string;
    email: string;
    role: string;
    country: string;
    diocese: string;
    parish: string;
    account_status: string;
    verification_status: string;
    created_at: string;
    avatar_url?: string;
}

export type FilterState = {
    search: string;
    role: string;
    country: string;
    diocese: string;
    parish: string;
    status: string;
};

// --- COMPONENT ---
export default function UserDashboard() {
    const [loading, setLoading] = useState(true);
    const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
    const [activeTab, setActiveTab] = useState<"users" | "country" | "diocese" | "parish">("users");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

    // Filter State
    const [filters, setFilters] = useState<FilterState>({
        search: "",
        role: "all",
        country: "all",
        diocese: "all",
        parish: "all",
        status: "all",
    });

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // 1. FETCH DATA
    const fetchData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("profiles")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            setAllUsers(data || []);
        } catch (err) {
            console.error("Fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // 2. FILTER LOGIC
    const filteredUsers = useMemo(() => {
        return allUsers.filter((user) => {
            // Search
            const searchMatch = !filters.search ||
                (user.full_name?.toLowerCase().includes(filters.search.toLowerCase()) ||
                    user.email?.toLowerCase().includes(filters.search.toLowerCase()));

            // Role
            const roleMatch = filters.role === "all" || user.role === filters.role;

            // Status
            const userStatus = user.verification_status || user.account_status;
            const statusMatch = filters.status === "all" || userStatus && (
                filters.status === 'verified_catholic' ? ['verified_catholic', 'verified_pastoral', 'approved', 'verified'].includes(userStatus) :
                    userStatus === filters.status
            );

            // Location
            const countryMatch = filters.country === "all" || user.country === filters.country;
            const dioceseMatch = filters.diocese === "all" || user.diocese === filters.diocese;
            const parishMatch = filters.parish === "all" || user.parish === filters.parish;

            return searchMatch && roleMatch && statusMatch && countryMatch && dioceseMatch && parishMatch;
        });
    }, [allUsers, filters]);

    // 3. ACTIONS
    const handleStatClick = (statusType: string) => {
        setFilters(prev => ({ ...prev, status: statusType }));
    };

    const handleDrillDown = (type: "country" | "diocese" | "parish", value: string) => {
        setFilters(prev => ({
            ...prev,
            [type]: value,
            // Reset sub-levels if going up
            ...(type === 'country' ? { diocese: 'all', parish: 'all' } : {}),
            ...(type === 'diocese' ? { parish: 'all' } : {})
        }));
        setActiveTab("users");
    };

    const handleDetail = (user: UserProfile) => {
        setSelectedUser(user);
        setIsModalOpen(true);
    };

    const handleSuccessUpdate = () => {
        fetchData();
        setIsModalOpen(false);
    };

    const tabs = [
        { id: "users", label: "Daftar User", icon: Users },
        { id: "country", label: "Negara", icon: Globe },
        { id: "diocese", label: "Keuskupan", icon: Map },
        { id: "parish", label: "Paroki", icon: Church },
    ];

    return (
        <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-8 font-sans">
            <Toaster position="top-right" />

            {/* HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard User</h1>
                    <p className="text-gray-500 text-sm mt-1">Kelola data umat, validasi, dan pantau sebaran wilayah.</p>
                </div>
                <button
                    onClick={fetchData}
                    className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition shadow-sm"
                >
                    Refresh Data
                </button>
            </div>

            {/* STATISTIK (Clickable) */}
            <DashboardStats
                users={allUsers} // Pass ALL users for global stats
                onStatClick={handleStatClick}
                currentFilter={filters.status}
            />

            {/* MAIN CONTENT AREA */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

                {/* TABS & FILTERS */}
                <div className="border-b border-gray-200">
                    <div className="flex overflow-x-auto">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap outline-none ${activeTab === tab.id
                                        ? "border-blue-600 text-blue-600 bg-blue-50/30"
                                        : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                                    }`}
                            >
                                <tab.icon size={16} />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* MAIN FILTERS (Always visible/contextual) */}
                    <div className="p-4 bg-gray-50/50 border-t border-gray-100">
                        <DashboardFilters
                            filters={filters}
                            setFilters={setFilters}
                            users={allUsers}
                        />
                    </div>
                </div>

                {/* CONTENT */}
                <div className="p-0">
                    {activeTab === "users" && (
                        <UserTable
                            users={filteredUsers}
                            loading={loading}
                            onViewDetail={handleDetail}
                        />
                    )}

                    {activeTab !== "users" && (
                        <RegionalSummary
                            type={activeTab as any}
                            data={allUsers} // Pass ALL data, filtering happens inside
                            onDrillDown={(val) => handleDrillDown(activeTab as any, val)}
                        />
                    )}
                </div>
            </div>

            {/* MODAL */}
            <VerificationModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                user={selectedUser}
                onSuccess={handleSuccessUpdate}
            />
        </div>
    );
}
