'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Users, Map as MapIcon, List, Globe, LucideIcon } from 'lucide-react';
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
  country_id?: string | null;
  diocese_id?: string | null;
  church_id?: string | null;
  role?: string | null;
  created_at?: string | null;
}

type CountryRow = {
  id: string;
  name: string;
};

type DioceseRow = {
  id: string;
  name: string;
  country_id: string;
};

type ChurchRow = {
  id: string;
  name: string;
  diocese_id: string;
};

type LocationCatalog = {
  countries: Array<{ name: string }>;
  dioceses: Array<{ name: string; country?: string }>;
  parishes: Array<{ name: string; country?: string; diocese?: string }>;
};

function normalizeId(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function safeName(value: unknown): string {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text) return '';
  const lowered = text.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined') return '';
  return text;
}

export default function VerificationManager() {
  const [allUsers, setAllUsers] = useState<VerificationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationCatalog, setLocationCatalog] = useState<LocationCatalog>({
    countries: [],
    dioceses: [],
    parishes: [],
  });

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
      const [profilesRes, countriesRes, diocesesRes, churchesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            '*, countries:country_id(name), dioceses:diocese_id(name), churches:church_id(name)',
          )
          .order('created_at', { ascending: false }),
        supabase.from('countries').select('id, name').order('name'),
        supabase.from('dioceses').select('id, name, country_id').order('name'),
        supabase.from('churches').select('id, name, diocese_id').order('name'),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (countriesRes.error) throw countriesRes.error;
      if (diocesesRes.error) throw diocesesRes.error;
      if (churchesRes.error) throw churchesRes.error;

      const countries = (countriesRes.data || []) as CountryRow[];
      const dioceses = (diocesesRes.data || []) as DioceseRow[];
      const churches = (churchesRes.data || []) as ChurchRow[];

      const countryNameById = new Map(
        countries.map((country) => [String(country.id), safeName(country.name)]),
      );
      const dioceseNameById = new Map(
        dioceses.map((diocese) => [String(diocese.id), safeName(diocese.name)]),
      );
      const churchNameById = new Map(
        churches.map((church) => [String(church.id), safeName(church.name)]),
      );
      const dioceseCountryIdById = new Map(
        dioceses.map((diocese) => [String(diocese.id), normalizeId(diocese.country_id)]),
      );
      const churchDioceseIdById = new Map(
        churches.map((church) => [String(church.id), normalizeId(church.diocese_id)]),
      );

      const users = ((profilesRes.data || []) as VerificationUser[]).map((rawUser) => {
        const normalized = normalizeProfileLocation(rawUser);
        const countryId = normalizeId(rawUser.country_id);
        const directDioceseId = normalizeId(rawUser.diocese_id);
        const churchId = normalizeId(rawUser.church_id);
        const resolvedDioceseId =
          directDioceseId || (churchId ? churchDioceseIdById.get(churchId) || '' : '');
        const resolvedCountryId =
          countryId || (resolvedDioceseId ? dioceseCountryIdById.get(resolvedDioceseId) || '' : '');

        return {
          ...normalized,
          country:
            safeName(normalized.country) ||
            (resolvedCountryId ? countryNameById.get(resolvedCountryId) || '' : ''),
          diocese:
            safeName(normalized.diocese) ||
            (resolvedDioceseId ? dioceseNameById.get(resolvedDioceseId) || '' : ''),
          parish:
            safeName(normalized.parish) ||
            (churchId ? churchNameById.get(churchId) || '' : ''),
        };
      });

      const nextCatalog: LocationCatalog = {
        countries: countries
          .map((country) => ({ name: safeName(country.name) }))
          .filter((country) => country.name),
        dioceses: dioceses
          .map((diocese) => ({
            name: safeName(diocese.name),
            country: safeName(countryNameById.get(String(diocese.country_id)) || ''),
          }))
          .filter((diocese) => diocese.name),
        parishes: churches
          .map((church) => {
            const dioceseId = normalizeId(church.diocese_id);
            const countryId = dioceseCountryIdById.get(dioceseId) || '';
            return {
              name: safeName(church.name),
              diocese: safeName(dioceseNameById.get(dioceseId) || ''),
              country: safeName(countryNameById.get(countryId) || ''),
            };
          })
          .filter((parish) => parish.name),
      };

      const pendingCount = users.filter((u) => getUserStatus(u) === 'pending').length;
      const verifiedCount = users.filter((u) =>
        isVerifiedStatus(getUserStatus(u)),
      ).length;

      setAllUsers(users);
      setLocationCatalog(nextCatalog);
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
    { id: 'diocese', label: 'Ringkasan Keuskupan', icon: MapIcon },
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
          locationCatalog={locationCatalog}
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
