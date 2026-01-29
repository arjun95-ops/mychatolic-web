'use client';

import { useEffect, useState, useMemo } from 'react';
import { Users, Map, List } from 'lucide-react';
import StatsCards from './StatsCards';
import DashboardFilters from './DashboardFilters';
import UserTable from './UserTable';
import RegionalSummary from './RegionalSummary';
import VerificationModal from './VerificationModal';
import toast from 'react-hot-toast'; 

export default function VerificationManager() {
  // --- STATE ---
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // State Filter & UI
  const [activeTab, setActiveTab] = useState<'users' | 'country' | 'diocese' | 'parish'>('users');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    country: '',
    diocese: '',
    parish: '',
    status: 'all'
  });
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // --- 1. FETCH DATA (VIA API ROUTE) ---
  const fetchUsers = async () => {
    setLoading(true);
    console.log("🔄 Frontend: Fetching users from API...");
    try {
      // Panggil API Route yang baru dibuat
      const res = await fetch('/api/admin/users');
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Gagal mengambil data dari server');
      }
      
      console.log("✅ Frontend: Data received", result.users?.length);
      setAllUsers(result.users || []);
    } catch (err: any) {
      console.error('Frontend Error:', err);
      toast.error("Gagal memuat data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // --- 2. FILTERING LOGIC ---
  const filteredUsers = useMemo(() => {
    const users = Array.isArray(allUsers) ? allUsers : []; // Safe guard
    return users.filter(user => {
      // Search
      const searchLower = search.toLowerCase();
      const matchesSearch = 
        !search || 
        (user.full_name || '').toLowerCase().includes(searchLower) ||
        (user.email || '').toLowerCase().includes(searchLower) ||
        (user.parish || '').toLowerCase().includes(searchLower);

      // Status
      const matchesStatus = 
        filters.status === 'all' || 
        (filters.status === 'verified' && ['verified_catholic', 'verified_pastoral', 'approved'].includes(user.account_status)) ||
        (filters.status === 'pending' && user.account_status === 'pending') ||
        (filters.status === 'rejected' && user.account_status === 'rejected');

      // Wilayah
      const matchesCountry = !filters.country || user.country === filters.country;
      const matchesDiocese = !filters.diocese || user.diocese === filters.diocese;
      const matchesParish = !filters.parish || user.parish === filters.parish;

      return matchesSearch && matchesStatus && matchesCountry && matchesDiocese && matchesParish;
    });
  }, [allUsers, search, filters]);

  // Handlers
  const handleDrillDown = (type: 'country' | 'diocese' | 'parish', value: string) => {
    setFilters(prev => ({ ...prev, [type]: value }));
    setActiveTab('users');
    toast.success(`Filter: ${value}`);
  };

  const handleStatClick = (status: string) => {
    setFilters(prev => ({ ...prev, status }));
    setActiveTab('users');
    toast.success(`Filter Status: ${status}`);
  };

  // Icon Helper
  const GlobeIcon = (props: any) => (
    <svg {...props} xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
  );

  return (
    <div className="space-y-6 pb-20 p-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Manajemen Data User</h1>
          <p className="text-sm text-gray-500 mt-1">Pusat kendali verifikasi dan pemetaan wilayah user.</p>
        </div>
        <button onClick={fetchUsers} className="text-sm text-blue-600 hover:underline font-medium">
          Refresh Data
        </button>
      </div>

      {/* STATISTIK */}
      <StatsCards users={allUsers} onStatClick={handleStatClick} />

      {/* FILTERS */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 sticky top-4 z-20">
        <DashboardFilters 
          users={allUsers} 
          search={search}
          setSearch={setSearch}
          filters={filters}
          setFilters={setFilters}
        />
      </div>

      {/* CONTENT TABS */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px]">
        <div className="flex border-b border-gray-100 bg-gray-50/50 px-2 pt-2 overflow-x-auto">
          {[
            { id: 'users', label: 'Daftar User', icon: Users },
            { id: 'country', label: 'Ringkasan Negara', icon: GlobeIcon },
            { id: 'diocese', label: 'Ringkasan Keuskupan', icon: Map },
            { id: 'parish', label: 'Ringkasan Paroki', icon: List },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-white text-blue-600 border-x border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.02)] relative top-[1px]' 
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
              {tab.id === 'users' && (
                <span className="ml-1 bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full text-xs">
                   {filteredUsers.length}
                </span>
              )}
            </button>
          ))}
        </div>

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

      {/* MODAL */}
      <VerificationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        user={selectedUser}
        onSuccess={() => {
          fetchUsers();
        }}
      />
    </div>
  );
}