'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Users, Map, List, Globe, LucideIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';
import StatsCards from './StatsCards';
import DashboardFilters from './DashboardFilters';
import UserTable from './UserTable';
import RegionalSummary from './RegionalSummary';
import VerificationModal from './VerificationModal';
import {
  getUserStatus,
  isVerifiedStatus,
  normalizeProfileLocation,
  VerificationUserLike,
} from '@/lib/verification-status';

type VerificationTab = 'users' | 'country' | 'diocese' | 'parish';

interface VerificationUser extends VerificationUserLike {
  id: string;
  full_name?: string | null;
  email?: string | null;
  parish?: string | null;
  country?: string | null;
  diocese?: string | null;
  role?: string | null;
  created_at?: string | null;
}

export default function VerificationManager() {
  const [allUsers, setAllUsers] = useState<VerificationUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<VerificationTab>('users');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    country: '',
    diocese: '',
    parish: '',
    status: 'all',
  });

  const [selectedUser, setSelectedUser] = useState<VerificationUser | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    verified: 0,
    articles: 0,
  });

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          '*, countries:country_id(name), dioceses:diocese_id(name), churches:church_id(name)',
        )
        .order('created_at', { ascending: false });

      if (error) throw error;

      const users = ((data || []) as VerificationUser[]).map(normalizeProfileLocation);
      const pendingCount = users.filter((u) => getUserStatus(u) === 'pending').length;
      const verifiedCount = users.filter((u) =>
        isVerifiedStatus(getUserStatus(u)),
      ).length;

      setAllUsers(users);
      setStats({
        total: users.length,
        pending: pendingCount,
        verified: verifiedCount,
        articles: 0,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error fetching:', err);
      toast.error(`Gagal memuat data: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredUsers = useMemo(() => {
    return allUsers.filter((user) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        (user.full_name || '').toLowerCase().includes(searchLower) ||
        (user.email || '').toLowerCase().includes(searchLower) ||
        (user.parish || '').toLowerCase().includes(searchLower);

      const status = getUserStatus(user);
      const matchesStatus =
        filters.status === 'all' ||
        (filters.status === 'verified'
          ? isVerifiedStatus(status)
          : status === filters.status);

      const matchesCountry = !filters.country || user.country === filters.country;
      const matchesDiocese = !filters.diocese || user.diocese === filters.diocese;
      const matchesParish = !filters.parish || user.parish === filters.parish;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesCountry &&
        matchesDiocese &&
        matchesParish
      );
    });
  }, [allUsers, search, filters]);

  const handleDrillDown = (type: Exclude<VerificationTab, 'users'>, value: string) => {
    setFilters((prev) => ({ ...prev, [type]: value }));
    setActiveTab('users');
    toast.success(`Memfilter berdasarkan ${value}`);
  };

  const tabs: Array<{ id: VerificationTab; label: string; icon: LucideIcon }> = [
    { id: 'users', label: 'Daftar User', icon: Users },
    { id: 'country', label: 'Ringkasan Negara', icon: Globe },
    { id: 'diocese', label: 'Ringkasan Keuskupan', icon: Map },
    { id: 'parish', label: 'Ringkasan Paroki', icon: List },
  ];

  return (
    <div className="space-y-6 pb-20 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Manajemen Data User
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Pusat kendali verifikasi dan pemetaan wilayah user.
          </p>
        </div>
        <button
          onClick={fetchUsers}
          className="text-sm text-action hover:underline font-medium"
        >
          Refresh Data
        </button>
      </div>

      <StatsCards loading={loading} stats={stats} />

      <div className="bg-surface-primary p-4 rounded-xl shadow-sm border border-gray-200 sticky top-4 z-20">
        <DashboardFilters
          users={allUsers}
          search={search}
          setSearch={setSearch}
          filters={filters}
          setFilters={setFilters}
        />
      </div>

      <div className="bg-surface-primary rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px]">
        <div className="flex border-b border-gray-100 bg-surface-secondary px-2 pt-2 overflow-x-auto">
          {tabs.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-surface-primary text-brand-primary border-x border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.02)] relative top-[1px]'
                    : 'text-text-secondary hover:text-text-primary hover:bg-gray-100'
                }`}
              >
                <TabIcon size={16} />
                {tab.label}
                {tab.id === 'users' && (
                  <span className="ml-1 bg-surface-secondary text-text-secondary px-1.5 py-0.5 rounded-full text-xs">
                    {filteredUsers.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-0">
          {activeTab === 'users' ? (
            <UserTable
              data={filteredUsers}
              loading={loading}
              onVerify={(u: VerificationUser) => {
                setSelectedUser(u);
                setIsModalOpen(true);
              }}
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

      <VerificationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        user={selectedUser}
        onSuccess={() => {
          fetchUsers();
          toast.success('Data user berhasil diperbarui');
        }}
      />
    </div>
  );
}
