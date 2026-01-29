'use client';

import { useEffect, useState, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Users, Map, List, Globe } from 'lucide-react';
import { toast } from 'react-hot-toast'; // Replaced custom useToast with react-hot-toast
import StatsCards from './StatsCards';
import DashboardFilters from './DashboardFilters';
import UserTable from './UserTable';
import RegionalSummary from './RegionalSummary';
import VerificationModal from './VerificationModal';

export default function VerificationManager() {
    // --- STATE DATA ---
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // --- STATE FILTER & UI ---
    const [activeTab, setActiveTab] = useState<'users' | 'country' | 'diocese' | 'parish'>('users');
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState({
        country: '',
        diocese: '',
        parish: '',
        status: 'all' // all, pending, verified, rejected
    });

    // --- STATE MODAL ---
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Stats for Card
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        verified: 0,
        articles: 0
    });

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // 1. FETCH DATA (Sekali saat mount)
    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            const users = data || [];
            setAllUsers(users);

            setStats({
                total: users.length,
                pending: users.filter(u => u.account_status === 'pending').length,
                verified: users.filter(u => ['verified_catholic', 'verified_pastoral', 'approved'].includes(u.account_status)).length,
                articles: 0
            });

        } catch (err: any) {
            console.error('Error fetching:', err);
            toast.error("Gagal memuat data: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    // 2. FILTERING LOGIC (Real-time)
    const filteredUsers = useMemo(() => {
        return allUsers.filter(user => {
            // Filter Search Global
            const searchLower = search.toLowerCase();
            const matchesSearch =
                !search ||
                user.full_name?.toLowerCase().includes(searchLower) ||
                user.email?.toLowerCase().includes(searchLower) ||
                user.parish?.toLowerCase().includes(searchLower);

            // Filter Status
            const matchesStatus =
                filters.status === 'all' ||
                (filters.status === 'verified' && ['verified_catholic', 'verified_pastoral', 'approved'].includes(user.account_status)) ||
                (filters.status === 'pending' && user.account_status === 'pending') ||
                (filters.status === 'rejected' && user.account_status === 'rejected');

            // Filter Wilayah
            const matchesCountry = !filters.country || user.country === filters.country;
            const matchesDiocese = !filters.diocese || user.diocese === filters.diocese;
            const matchesParish = !filters.parish || user.parish === filters.parish;

            return matchesSearch && matchesStatus && matchesCountry && matchesDiocese && matchesParish;
        });
    }, [allUsers, search, filters]);

    // 3. HANDLERS (DRILL DOWN LOGIC)
    const handleDrillDown = (type: 'country' | 'diocese' | 'parish', value: string) => {
        // Pindah ke tab User dan set filter otomatis
        setFilters(prev => ({ ...prev, [type]: value }));
        setActiveTab('users');
        toast.success(`Memfilter berdasarkan ${value}`);
    };

    return (
        <div className="space-y-6 pb-20 p-6">
            {/* HEADER */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary tracking-tight">Manajemen Data User</h1>
                    <p className="text-sm text-text-secondary mt-1">Pusat kendali verifikasi dan pemetaan wilayah user.</p>
                </div>
                <button onClick={fetchUsers} className="text-sm text-action hover:underline font-medium">
                    Refresh Data
                </button>
            </div>

            {/* STATISTIK CARDS */}
            <StatsCards
                loading={loading}
                stats={stats}
            />

            {/* CONTROL BAR (FILTER & SEARCH) */}
            <div className="bg-surface-primary p-4 rounded-xl shadow-sm border border-gray-200 sticky top-4 z-20">
                <DashboardFilters
                    users={allUsers}
                    search={search}
                    setSearch={setSearch}
                    filters={filters}
                    setFilters={setFilters}
                />
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="bg-surface-primary rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px]">
                {/* TABS NAVIGATION */}
                <div className="flex border-b border-gray-100 bg-surface-secondary px-2 pt-2 overflow-x-auto">
                    {[
                        { id: 'users', label: 'Daftar User', icon: Users },
                        { id: 'country', label: 'Ringkasan Negara', icon: Globe },
                        { id: 'diocese', label: 'Ringkasan Keuskupan', icon: Map },
                        { id: 'parish', label: 'Ringkasan Paroki', icon: List },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === tab.id
                                    ? 'bg-surface-primary text-brand-primary border-x border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.02)] relative top-[1px]'
                                    : 'text-text-secondary hover:text-text-primary hover:bg-gray-100'
                                }`}
                        >
                            <tab.icon size={16} />
                            {tab.label}
                            {tab.id === 'users' && (
                                <span className="ml-1 bg-surface-secondary text-text-secondary px-1.5 py-0.5 rounded-full text-xs">
                                    {filteredUsers.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* TAB CONTENT */}
                <div className="p-0">
                    {activeTab === 'users' ? (
                        <UserTable
                            data={filteredUsers}
                            loading={loading}
                            onVerify={(u) => { setSelectedUser(u); setIsModalOpen(true); }}
                        />
                    ) : (
                        <RegionalSummary
                            type={activeTab}
                            users={filteredUsers}
                            onDrillDown={handleDrillDown}
                        />
                    )}
                </div>
            </div>

            {/* MODAL VERIFIKASI */}
            <VerificationModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                user={selectedUser}
                onSuccess={() => {
                    fetchUsers();
                    toast.success("Data user berhasil diperbarui");
                }}
            />
        </div>
    );
}