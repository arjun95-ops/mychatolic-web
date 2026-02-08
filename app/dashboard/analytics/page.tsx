'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Ban,
  ChevronDown,
  CheckCircle2,
  Clock3,
  Filter,
  Globe,
  MapPin,
  Search,
  TrendingUp,
  Users,
  X,
  XCircle,
} from 'lucide-react';

type RangePreset = '1d' | '7d' | '30d' | '12m' | 'custom';
type LocationScope = 'country' | 'diocese' | 'church';
type LocationMode = 'top' | 'all';
type LocationMetric = 'total' | 'active';
type GlobalSearchCategory = 'all' | 'location' | 'pastoral' | 'user_category';

type TrendPoint = {
  date: string;
  label: string;
  count: number;
};

type AnalyticsResponse = {
  timezone: string;
  filters: {
    range: string;
    from: string;
    to: string;
    mode: LocationMode;
    location_metric: LocationMetric;
    location_scope: LocationScope;
    location_id: string | null;
    page: number;
    limit: number;
  };
  kpis: {
    countries: number;
    dioceses: number;
    churches: number;
    articles: number;
    users_total: number;
    users_online_now: number;
    users_active_today: number;
    users_active_period: number;
    users_verified: number;
    users_pending: number;
    users_unverified: number;
    users_rejected: number;
    users_banned: number;
    reports_total: number;
    reports_in_period: number;
    reports_open: number;
  };
  trends: {
    active_users: {
      source: string;
      granularity: 'day' | 'month';
      points: TrendPoint[];
    };
    reports: {
      granularity: 'day' | 'month';
      points: TrendPoint[];
    };
  };
  roles: { role: string; count: number }[];
  pastoral_roles_detail: {
    role: string;
    count: number;
    people: {
      id: string;
      name: string;
      country_name: string;
      diocese_name: string;
      church_name: string;
    }[];
  }[];
  verification_status: { status: string; count: number }[];
  report_status: { status: string; count: number }[];
  user_categories: { category: string; count: number }[];
  location: {
    scope: LocationScope;
    mode: LocationMode;
    metric: LocationMetric;
    page: number;
    limit: number;
    total_items: number;
    total_pages: number;
    selected_parent: { id: string; name: string; type: string } | null;
    items: {
      id: string;
      name: string;
      parent_id?: string;
      parent_name?: string;
      total_count: number;
      active_count: number;
      count: number;
      link: string;
    }[];
    options: {
      countries: { id: string; name: string }[];
      dioceses: { id: string; name: string; country_id: string }[];
    };
  };
};

function MetricCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number;
  icon: LucideIcon;
  color: string;
}) {
  return (
    <div className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-5 shadow-sm flex items-center justify-between">
      <div>
        <p className="text-[11px] uppercase font-bold tracking-wide text-text-secondary">{title}</p>
        <p className={`text-2xl font-extrabold mt-1 ${color}`}>{value}</p>
      </div>
      <div className="p-3 rounded-lg bg-surface-secondary dark:bg-surface-inverse">
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
    </div>
  );
}

function SimpleBarChart({
  data,
  colorClass,
  valueSuffix,
}: {
  data: TrendPoint[];
  colorClass: string;
  valueSuffix: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-text-secondary text-xs">
        Tidak ada data
      </div>
    );
  }

  const max = Math.max(...data.map((item) => item.count), 1);

  return (
    <div className="flex items-end gap-1.5 h-56 w-full pt-4">
      {data.map((item, idx) => (
        <div key={`${item.date}-${idx}`} className="flex-1 min-w-0 flex flex-col items-center group relative">
          <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 bg-surface-inverse text-text-inverse text-xs rounded px-2 py-1 whitespace-nowrap pointer-events-none z-20 transition-opacity">
            {item.label}: {item.count} {valueSuffix}
          </div>
          <div
            className={`w-full rounded-t-md ${colorClass} opacity-80 group-hover:opacity-100 transition-all min-h-[4px]`}
            style={{ height: `${(item.count / max) * 100}%` }}
          />
          <span className="text-[10px] text-text-secondary mt-1 truncate w-full text-center">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function HorizontalBars({
  title,
  items,
  valueKey,
  labelKey,
  colorClass,
}: {
  title: string;
  items: Array<Record<string, string | number>>;
  valueKey: string;
  labelKey: string;
  colorClass: string;
}) {
  const max = Math.max(1, ...items.map((item) => Number(item[valueKey] || 0)));

  return (
    <div className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-6 shadow-sm">
      <h3 className="text-lg font-bold text-text-primary mb-4">{title}</h3>
      <div className="space-y-3">
        {items.map((item, idx) => {
          const value = Number(item[valueKey] || 0);
          const width = (value / max) * 100;
          return (
            <div key={`${item[labelKey]}-${idx}`}>
              <div className="flex justify-between text-sm mb-1">
                <span className="capitalize text-text-primary">{item[labelKey]}</span>
                <span className="font-semibold text-text-primary">{value}</span>
              </div>
              <div className="h-2.5 rounded-full bg-surface-secondary dark:bg-surface-inverse overflow-hidden">
                <div
                  className={`h-full ${colorClass}`}
                  style={{ width: `${Math.max(4, width)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardAnalyticsDetailPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [range, setRange] = useState<RangePreset>('30d');
  const [timezone, setTimezone] = useState('Asia/Jakarta');

  const [customFromInput, setCustomFromInput] = useState('');
  const [customToInput, setCustomToInput] = useState('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [scope, setScope] = useState<LocationScope>('country');
  const [locationParentId, setLocationParentId] = useState('');
  const [locationSearchInput, setLocationSearchInput] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [globalSearchInput, setGlobalSearchInput] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalSearchCategory, setGlobalSearchCategory] = useState<GlobalSearchCategory>('all');
  const [pastoralSearchInput, setPastoralSearchInput] = useState('');
  const [pastoralSearch, setPastoralSearch] = useState('');
  const [locationMetric, setLocationMetric] = useState<LocationMetric>('total');
  const [mode, setMode] = useState<LocationMode>('top');
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLocationSearch(locationSearchInput.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(timer);
  }, [locationSearchInput]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPastoralSearch(pastoralSearchInput.trim().toLowerCase());
    }, 250);

    return () => clearTimeout(timer);
  }, [pastoralSearchInput]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setGlobalSearch(globalSearchInput.trim().toLowerCase());
    }, 250);

    return () => clearTimeout(timer);
  }, [globalSearchInput]);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          range,
          tz: timezone,
          location_scope: scope,
          location_metric: locationMetric,
          mode,
          limit: String(limit),
          page: String(mode === 'all' ? page : 1),
        });

        if (locationParentId) {
          params.set('location_id', locationParentId);
        }

        if (locationSearch) {
          params.set('location_q', locationSearch);
        }

        if (range === 'custom') {
          if (customFrom) params.set('from', customFrom);
          if (customTo) params.set('to', customTo);
        }

        const res = await fetch(`/api/admin/dashboard-analytics?${params.toString()}`, {
          cache: 'no-store',
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`API Error ${res.status}: ${txt}`);
        }

        const json = (await res.json()) as AnalyticsResponse;
        setData(json);
      } catch (err: unknown) {
        console.error('Error loading detail analytics:', err);
        const message = err instanceof Error ? err.message : 'Gagal memuat data analytics detail.';
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [range, timezone, customFrom, customTo, scope, locationParentId, locationSearch, locationMetric, mode, limit, page]);

  const parentOptions = useMemo(() => {
    if (!data) return [];
    if (scope === 'diocese') {
      return data.location.options.countries.map((item) => ({ value: item.id, label: item.name }));
    }
    if (scope === 'church') {
      return data.location.options.dioceses.map((item) => ({ value: item.id, label: item.name }));
    }
    return [];
  }, [data, scope]);

  const globalSearchTargets = useMemo(
    () => ({
      location: Boolean(globalSearch) && (globalSearchCategory === 'all' || globalSearchCategory === 'location'),
      pastoral: Boolean(globalSearch) && (globalSearchCategory === 'all' || globalSearchCategory === 'pastoral'),
      userCategory: Boolean(globalSearch) && (globalSearchCategory === 'all' || globalSearchCategory === 'user_category'),
    }),
    [globalSearch, globalSearchCategory]
  );

  const filteredUserCategories = useMemo(() => {
    const source = data?.user_categories || [];
    if (!globalSearchTargets.userCategory) return source;

    return source.filter((item) =>
      `${item.category} ${item.count}`.toLowerCase().includes(globalSearch)
    );
  }, [data, globalSearchTargets.userCategory, globalSearch]);

  const filteredLocationItems = useMemo(() => {
    const source = data?.location.items || [];
    if (!globalSearchTargets.location) return source;

    return source.filter((item) =>
      `${item.name} ${item.parent_name || ''} ${item.total_count} ${item.active_count}`
        .toLowerCase()
        .includes(globalSearch)
    );
  }, [data, globalSearchTargets.location, globalSearch]);

  const filteredPastoralRoles = useMemo(() => {
    const source = data?.pastoral_roles_detail || [];

    const filterPeopleByTerm = (
      role: string,
      people: AnalyticsResponse['pastoral_roles_detail'][number]['people'],
      term: string
    ) => {
      if (!term) return people;

      if (role.toLowerCase().includes(term)) {
        return people;
      }

      return people.filter((person) =>
        `${person.name} ${person.country_name} ${person.diocese_name} ${person.church_name}`
          .toLowerCase()
          .includes(term)
      );
    };

    return source
      .map((item) => {
        let filteredPeople = item.people;

        if (globalSearchTargets.pastoral) {
          filteredPeople = filterPeopleByTerm(item.role, filteredPeople, globalSearch);
        }

        if (pastoralSearch) {
          filteredPeople = filterPeopleByTerm(item.role, filteredPeople, pastoralSearch);
        }

        const shouldHideByGlobal =
          globalSearchTargets.pastoral &&
          filteredPeople.length === 0 &&
          !item.role.toLowerCase().includes(globalSearch);
        const shouldHideByPastoralSearch =
          Boolean(pastoralSearch) &&
          filteredPeople.length === 0 &&
          !item.role.toLowerCase().includes(pastoralSearch);

        if (shouldHideByGlobal || shouldHideByPastoralSearch) return null;

        return {
          ...item,
          filteredPeople,
        };
      })
      .filter(
        (
          item
        ): item is {
          role: string;
          count: number;
          people: AnalyticsResponse['pastoral_roles_detail'][number]['people'];
          filteredPeople: AnalyticsResponse['pastoral_roles_detail'][number]['people'];
        } => Boolean(item)
      );
  }, [data, globalSearchTargets.pastoral, globalSearch, pastoralSearch]);

  const globalResultSummary = useMemo(() => {
    if (!globalSearch) return null;

    const pastoralPeopleCount = filteredPastoralRoles.reduce(
      (total, roleItem) => total + roleItem.filteredPeople.length,
      0
    );

    return {
      userCategoryCount: filteredUserCategories.length,
      locationCount: filteredLocationItems.length,
      pastoralPeopleCount,
    };
  }, [globalSearch, filteredPastoralRoles, filteredUserCategories, filteredLocationItems]);

  const scopeLabel =
    scope === 'country' ? 'Negara' : scope === 'diocese' ? 'Keuskupan' : 'Paroki';

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Dashboard Detail Analytics</h1>
          <p className="text-sm text-text-secondary mt-1">
            Data lengkap user, aktivitas, laporan, role, status, dan distribusi lokasi.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-surface-secondary bg-surface-primary hover:bg-surface-secondary text-sm font-semibold text-text-primary transition"
        >
          <ArrowLeft size={16} />
          Kembali ke Ringkasan
        </Link>
      </div>

      <section className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-text-primary font-bold text-sm">
          <Filter size={16} />
          Filter Analytics
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-text-secondary mb-2">Periode</label>
            <div className="flex flex-wrap gap-2">
              {([
                { id: '1d', label: '1 Hari' },
                { id: '7d', label: '7 Hari' },
                { id: '30d', label: '30 Hari' },
                { id: '12m', label: '12 Bulan' },
                { id: 'custom', label: 'Custom' },
              ] as { id: RangePreset; label: string }[]).map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setRange(item.id);
                    setPage(1);
                  }}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition ${
                    range === item.id
                      ? 'bg-action text-text-inverse border-action'
                      : 'bg-surface-primary text-text-secondary border-surface-secondary hover:text-text-primary'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-2">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => {
                setTimezone(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary"
            >
              <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
              <option value="UTC">UTC</option>
              <option value="Asia/Singapore">Asia/Singapore</option>
              <option value="Europe/Rome">Europe/Rome</option>
              <option value="America/New_York">America/New_York</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-2">Mode Data Lokasi</label>
            <select
              value={mode}
              onChange={(e) => {
                const nextMode = e.target.value as LocationMode;
                setMode(nextMode);
                setPage(1);
              }}
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary"
            >
              <option value="top">Top (ringkas)</option>
              <option value="all">Semua + Pagination</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-2">Basis Analisis Lokasi</label>
            <select
              value={locationMetric}
              onChange={(e) => {
                setLocationMetric(e.target.value as LocationMetric);
                setPage(1);
              }}
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary"
            >
              <option value="total">Total User Terdaftar</option>
              <option value="active">User Aktif di Periode</option>
            </select>
          </div>
        </div>

        {range === 'custom' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-2">Dari Tanggal</label>
              <input
                type="date"
                value={customFromInput}
                onChange={(e) => setCustomFromInput(e.target.value)}
                className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-2">Sampai Tanggal</label>
              <input
                type="date"
                value={customToInput}
                onChange={(e) => setCustomToInput(e.target.value)}
                className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary"
              />
            </div>
            <button
              onClick={() => {
                setCustomFrom(customFromInput);
                setCustomTo(customToInput);
                setPage(1);
              }}
              className="h-[38px] px-4 rounded-lg bg-brand-primary text-text-inverse text-sm font-semibold hover:bg-brand-primary/90 transition"
            >
              Terapkan Custom Range
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-2">Scope Lokasi</label>
            <select
              value={scope}
              onChange={(e) => {
                const nextScope = e.target.value as LocationScope;
                setScope(nextScope);
                setLocationParentId('');
                setPage(1);
              }}
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary"
            >
              <option value="country">Negara</option>
              <option value="diocese">Keuskupan</option>
              <option value="church">Paroki</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-2">
              Filter Parent {scope === 'diocese' ? '(Negara)' : scope === 'church' ? '(Keuskupan)' : ''}
            </label>
            <select
              value={locationParentId}
              onChange={(e) => {
                setLocationParentId(e.target.value);
                setPage(1);
              }}
              disabled={scope === 'country'}
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary disabled:opacity-60"
            >
              <option value="">
                {scope === 'country' ? 'Tidak diperlukan' : 'Semua Parent'}
              </option>
              {parentOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-2">Limit</label>
            <select
              value={String(limit)}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>

          <div className="rounded-lg border border-surface-secondary bg-surface-secondary dark:bg-surface-inverse px-3 py-2">
            <p className="text-[11px] uppercase font-semibold text-text-secondary">Periode Aktif</p>
            <p className="text-sm font-semibold text-text-primary mt-1">
              {data?.filters.from || '-'} s/d {data?.filters.to || '-'}
            </p>
          </div>
        </div>
      </section>

      <section className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-5 shadow-sm space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3">
            <label className="block text-xs font-semibold text-text-secondary mb-2">Global Search Dashboard</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                type="text"
                value={globalSearchInput}
                onChange={(e) => setGlobalSearchInput(e.target.value)}
                placeholder="Ketik cepat: nama, negara, keuskupan, gereja/paroki, role, atau kategori user..."
                className="w-full rounded-lg border border-surface-secondary bg-surface-primary pl-9 pr-10 py-2.5 text-sm text-text-primary"
              />
              {globalSearchInput && (
                <button
                  onClick={() => setGlobalSearchInput('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-surface-secondary transition"
                  aria-label="Hapus global search"
                  title="Hapus pencarian"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-2">Kategori Search</label>
            <select
              value={globalSearchCategory}
              onChange={(e) => setGlobalSearchCategory(e.target.value as GlobalSearchCategory)}
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2.5 text-sm text-text-primary"
            >
              <option value="all">Semua Data</option>
              <option value="location">Lokasi</option>
              <option value="pastoral">Role Pastoral</option>
              <option value="user_category">Kategori User</option>
            </select>
          </div>
        </div>

        <p className="text-xs text-text-secondary">
          Pencarian global membaca data yang sedang tampil sesuai filter periode/scope saat ini.
        </p>

        {globalResultSummary && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-surface-secondary dark:bg-surface-inverse text-text-primary">
              Kategori User: {globalResultSummary.userCategoryCount}
            </span>
            <span className="px-2 py-1 rounded bg-surface-secondary dark:bg-surface-inverse text-text-primary">
              Role Pastoral (orang): {globalResultSummary.pastoralPeopleCount}
            </span>
            <span className="px-2 py-1 rounded bg-surface-secondary dark:bg-surface-inverse text-text-primary">
              Lokasi: {globalResultSummary.locationCount}
            </span>
          </div>
        )}
      </section>

      {error && (
        <div className="bg-status-error/10 border border-status-error/30 text-status-error p-4 rounded-xl text-sm">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="p-10 text-center text-text-secondary">Memuat analytics detail...</div>
      ) : (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard title="Total User" value={data?.kpis.users_total || 0} icon={Users} color="text-brand-primary" />
            <MetricCard title="Aktif Hari Ini" value={data?.kpis.users_active_today || 0} icon={Activity} color="text-action" />
            <MetricCard title="Aktif Dalam Periode" value={data?.kpis.users_active_period || 0} icon={TrendingUp} color="text-status-success" />
            <MetricCard title="Online Saat Ini" value={data?.kpis.users_online_now || 0} icon={Globe} color="text-status-success" />
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <MetricCard title="Verified" value={data?.kpis.users_verified || 0} icon={CheckCircle2} color="text-status-success" />
            <MetricCard title="Pending" value={data?.kpis.users_pending || 0} icon={Clock3} color="text-status-pending" />
            <MetricCard title="Unverified" value={data?.kpis.users_unverified || 0} icon={Users} color="text-text-secondary" />
            <MetricCard title="Rejected" value={data?.kpis.users_rejected || 0} icon={XCircle} color="text-status-error" />
            <MetricCard title="Banned" value={data?.kpis.users_banned || 0} icon={Ban} color="text-status-error" />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-action" />
                  Tren Aktivitas User
                </h3>
                <span className="text-[11px] font-semibold text-text-secondary bg-surface-secondary dark:bg-surface-inverse px-2 py-1 rounded">
                  Sumber: {data?.trends.active_users.source || '-'}
                </span>
              </div>
              <SimpleBarChart data={data?.trends.active_users.points || []} colorClass="bg-action" valueSuffix="user" />
            </div>

            <div className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-status-error" />
                  Tren Laporan
                </h3>
                <span className="text-[11px] font-semibold text-text-secondary bg-surface-secondary dark:bg-surface-inverse px-2 py-1 rounded">
                  Total: {data?.kpis.reports_total || 0}
                </span>
              </div>
              <SimpleBarChart data={data?.trends.reports.points || []} colorClass="bg-status-error" valueSuffix="laporan" />
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <HorizontalBars title="Komposisi Role" items={data?.roles || []} valueKey="count" labelKey="role" colorClass="bg-action" />
            <HorizontalBars
              title="Status Verifikasi"
              items={data?.verification_status || []}
              valueKey="count"
              labelKey="status"
              colorClass="bg-status-success"
            />
            <HorizontalBars
              title="Status Report"
              items={data?.report_status || []}
              valueKey="count"
              labelKey="status"
              colorClass="bg-status-error"
            />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-6 shadow-sm">
              <h3 className="text-lg font-bold text-text-primary mb-4">Kategori User</h3>
              <div className="space-y-3 max-h-[180px] overflow-auto pr-1">
                {filteredUserCategories.length > 0 ? (
                  filteredUserCategories.map((item) => (
                    <div key={item.category} className="flex justify-between items-center py-2 border-b border-surface-secondary/60">
                      <span className="text-sm text-text-primary">{item.category}</span>
                      <span className="text-xs font-semibold px-2 py-1 rounded bg-surface-secondary dark:bg-surface-inverse text-text-primary">
                        {item.count}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-text-secondary">
                    {globalSearchTargets.userCategory
                      ? 'Tidak ada hasil kategori user untuk kata kunci ini.'
                      : 'Belum ada kategori user.'}
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-surface-secondary/60">
                <h4 className="text-sm font-bold text-text-primary mb-3">Role Pastoral & Nama Orang</h4>
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-text-secondary mb-2">
                    Cari Nama/Asal
                  </label>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                    <input
                      type="text"
                      value={pastoralSearchInput}
                      onChange={(e) => setPastoralSearchInput(e.target.value)}
                      placeholder="Ketik nama, negara, keuskupan, atau gereja/paroki..."
                      className="w-full rounded-lg border border-surface-secondary bg-surface-primary pl-9 pr-10 py-2.5 text-sm text-text-primary"
                    />
                    {pastoralSearchInput && (
                      <button
                        onClick={() => setPastoralSearchInput('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-surface-secondary transition"
                        aria-label="Hapus pencarian pastoral"
                        title="Hapus pencarian"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-4 max-h-[260px] overflow-auto pr-1">
                  {filteredPastoralRoles.length > 0 ? (
                    filteredPastoralRoles.map((item) => (
                      <details
                        key={item.role}
                        open={Boolean(pastoralSearch || globalSearchTargets.pastoral)}
                        className="group rounded-lg border border-surface-secondary/60 [&_summary::-webkit-details-marker]:hidden"
                      >
                        <summary className="list-none cursor-pointer px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <ChevronDown className="w-4 h-4 text-text-secondary transition-transform group-open:rotate-180" />
                              <span className="text-sm font-semibold capitalize text-text-primary">{item.role}</span>
                            </div>
                            <span className="text-xs font-semibold px-2 py-1 rounded bg-action/10 text-action">
                              {pastoralSearch || globalSearchTargets.pastoral
                                ? `${item.filteredPeople.length}/${item.count} orang`
                                : `${item.count} orang`}
                            </span>
                          </div>
                        </summary>

                        <div className="px-3 pb-3">
                          {item.filteredPeople.length > 0 ? (
                            <div className="overflow-x-auto border border-surface-secondary/60 rounded-lg">
                              <table className="w-full text-xs">
                                <thead className="bg-surface-secondary/80 text-text-secondary uppercase">
                                  <tr>
                                    <th className="px-2.5 py-2 text-left">Nama</th>
                                    <th className="px-2.5 py-2 text-left">Negara</th>
                                    <th className="px-2.5 py-2 text-left">Keuskupan</th>
                                    <th className="px-2.5 py-2 text-left">Gereja/Paroki</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-surface-secondary/60">
                                  {item.filteredPeople.map((person) => (
                                    <tr key={`${item.role}-${person.id}`} className="text-text-primary">
                                      <td className="px-2.5 py-2 font-medium">{person.name}</td>
                                      <td className="px-2.5 py-2">{person.country_name || "Belum diisi"}</td>
                                      <td className="px-2.5 py-2">{person.diocese_name || "Belum diisi"}</td>
                                      <td className="px-2.5 py-2">{person.church_name || "Belum diisi"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-xs text-text-secondary">
                              {pastoralSearch || globalSearchTargets.pastoral
                                ? 'Tidak ada hasil untuk pencarian ini.'
                                : 'Belum ada data.'}
                            </p>
                          )}
                        </div>
                      </details>
                    ))
                  ) : (
                    <p className="text-xs text-text-secondary">
                      {globalSearchTargets.pastoral
                        ? 'Tidak ada role pastoral yang cocok dengan kata kunci.'
                        : 'Belum ada data role pastoral.'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-6 shadow-sm">
              <h3 className="text-lg font-bold text-text-primary mb-2">Ringkasan Master Data</h3>
              <p className="text-xs text-text-secondary mb-4">Jumlah data master wilayah saat ini.</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-surface-secondary dark:bg-surface-inverse">
                  <span className="text-sm text-text-secondary">Negara</span>
                  <span className="font-bold text-text-primary">{data?.kpis.countries || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-surface-secondary dark:bg-surface-inverse">
                  <span className="text-sm text-text-secondary">Keuskupan</span>
                  <span className="font-bold text-text-primary">{data?.kpis.dioceses || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-surface-secondary dark:bg-surface-inverse">
                  <span className="text-sm text-text-secondary">Paroki</span>
                  <span className="font-bold text-text-primary">{data?.kpis.churches || 0}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <MapPin className="w-5 h-5 text-action" />
                Distribusi Lokasi ({scopeLabel})
              </h3>
              <div className="text-xs text-text-secondary">
                Total Item: <span className="font-semibold text-text-primary">{filteredLocationItems.length}</span>
                <span className="text-text-secondary"> / {data?.location.total_items || 0}</span>
              </div>
            </div>

            <p className="mb-4 text-xs text-text-secondary">
              Diurutkan berdasarkan:{' '}
              <span className="font-semibold text-text-primary">
                {data?.location.metric === 'active' ? 'User Aktif pada Periode' : 'Total User Terdaftar'}
              </span>
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-text-secondary mb-2">
                Cari Nama {scopeLabel}
              </label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                <input
                  type="text"
                  value={locationSearchInput}
                  onChange={(e) => setLocationSearchInput(e.target.value)}
                  placeholder={
                    scope === 'country'
                      ? 'Ketik nama negara...'
                      : scope === 'diocese'
                        ? 'Ketik nama keuskupan...'
                        : 'Ketik nama gereja/paroki...'
                  }
                  className="w-full rounded-lg border border-surface-secondary bg-surface-primary pl-9 pr-10 py-2.5 text-sm text-text-primary"
                />
                {locationSearchInput && (
                  <button
                    onClick={() => setLocationSearchInput('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-surface-secondary transition"
                    aria-label="Hapus pencarian lokasi"
                    title="Hapus pencarian"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {data?.location.selected_parent && (
              <div className="mb-4 text-xs text-text-secondary bg-surface-secondary dark:bg-surface-inverse rounded-lg p-2.5">
                Parent aktif: <span className="font-semibold text-text-primary">{data.location.selected_parent.name}</span>
              </div>
            )}

            <div className="overflow-x-auto border border-surface-secondary dark:border-surface-secondary/20 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-surface-secondary dark:bg-surface-inverse text-xs uppercase text-text-secondary">
                  <tr>
                    <th className="p-3 text-left">Nama</th>
                    <th className="p-3 text-left">Parent</th>
                    <th className="p-3 text-right">Total User</th>
                    <th className="p-3 text-right">User Aktif</th>
                    <th className="p-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-secondary dark:divide-surface-secondary/20">
                  {filteredLocationItems.length > 0 ? (
                    filteredLocationItems.map((item) => (
                      <tr key={item.id} className="hover:bg-surface-secondary/40 dark:hover:bg-surface-inverse/40 transition-colors">
                        <td className="p-3 text-text-primary font-medium">{item.name}</td>
                        <td className="p-3 text-text-secondary">{item.parent_name || '-'}</td>
                        <td className="p-3 text-right font-semibold text-text-primary">{item.total_count}</td>
                        <td className="p-3 text-right font-bold text-action">{item.active_count}</td>
                        <td className="p-3 text-right">
                          <Link href={item.link} className="text-action text-xs font-semibold hover:underline">
                            Buka
                          </Link>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-text-secondary">
                        {globalSearchTargets.location
                          ? 'Tidak ada data lokasi yang cocok dengan global search.'
                          : 'Tidak ada data lokasi untuk filter saat ini.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {mode === 'all' && (data?.location.total_pages || 1) > 1 && (
              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={(data?.location.page || 1) <= 1}
                  className="px-3 py-2 rounded-lg border border-surface-secondary bg-surface-primary text-sm disabled:opacity-50"
                >
                  Sebelumnya
                </button>
                <span className="text-xs text-text-secondary px-2">
                  Halaman {data?.location.page || 1} / {data?.location.total_pages || 1}
                </span>
                <button
                  onClick={() => setPage((prev) => Math.min((data?.location.total_pages || 1), prev + 1))}
                  disabled={(data?.location.page || 1) >= (data?.location.total_pages || 1)}
                  className="px-3 py-2 rounded-lg border border-surface-secondary bg-surface-primary text-sm disabled:opacity-50"
                >
                  Berikutnya
                </button>
              </div>
            )}
          </section>

          <div className="flex justify-end">
            <Link
              href="/dashboard/location"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-action text-text-inverse text-sm font-semibold hover:bg-action/90 transition"
            >
              Eksplor Lokasi
              <ArrowRight size={16} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
