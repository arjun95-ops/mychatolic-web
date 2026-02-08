'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Globe,
  Home,
  LayoutDashboard,
  MapPin,
  PenTool,
  TrendingUp,
  UserCheck,
  Users,
  XCircle,
  Ban,
  Activity,
} from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

type RangePreset = '1d' | '7d' | '30d' | '12m';

type TrendPoint = {
  date: string;
  label: string;
  count: number;
};

type AnalyticsData = {
  timezone: string;
  filters: {
    range: string;
    from: string;
    to: string;
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
  verification_status: { status: string; count: number }[];
  location_summary: {
    countries: { id: string; name: string; count: number; link: string }[];
    dioceses: { id: string; name: string; count: number; link: string }[];
    churches: { id: string; name: string; count: number; link: string }[];
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
      <div className="h-48 flex items-center justify-center text-text-secondary text-xs">
        Tidak ada data
      </div>
    );
  }

  const max = Math.max(...data.map((item) => item.count), 1);

  return (
    <div className="flex items-end gap-1.5 h-48 w-full pt-4">
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

export default function DashboardOverview() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangePreset>('30d');
  const [locationTab, setLocationTab] = useState<'countries' | 'dioceses' | 'churches'>('countries');

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          range,
          tz: 'Asia/Jakarta',
          location_scope: 'country',
          mode: 'top',
          limit: '10',
        });

        const res = await fetch(`/api/admin/dashboard-analytics?${params.toString()}`, {
          cache: 'no-store',
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`API Error ${res.status}: ${txt}`);
        }

        const json = (await res.json()) as AnalyticsData;
        setData(json);
      } catch (err: unknown) {
        console.error('Error loading analytics:', err);
        const message = err instanceof Error ? err.message : 'Gagal memuat data analytics.';
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [range]);

  const today = format(new Date(), 'EEEE, d MMMM yyyy', { locale: id });

  const locationRows = useMemo(() => {
    if (!data) return [];
    return data.location_summary[locationTab] || [];
  }, [data, locationTab]);

  if (loading && !data) {
    return (
      <div className="p-12 text-center text-text-secondary flex flex-col items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-10 h-10 border-4 border-action border-t-transparent rounded-full mb-4" />
        <p>Memuat data dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-4xl mx-auto mt-8">
        <div className="bg-status-error/10 border border-status-error/30 text-status-error p-6 rounded-xl flex items-start gap-4">
          <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-bold mb-1">Gagal Memuat Analytics</h3>
            <p className="text-sm opacity-90 font-mono mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-status-error text-text-inverse rounded-lg text-sm font-bold hover:bg-status-error/90 transition"
            >
              Coba Lagi
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Ringkasan Dashboard</h1>
          <p className="text-text-secondary mt-1 text-sm font-medium">{today}</p>
          <p className="text-text-secondary text-xs mt-1">
            Timezone: <span className="font-semibold">{data?.timezone || 'Asia/Jakarta'}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {([
            { id: '1d', label: '1 Hari' },
            { id: '7d', label: '7 Hari' },
            { id: '30d', label: '30 Hari' },
            { id: '12m', label: '12 Bulan' },
          ] as { id: RangePreset; label: string }[]).map((item) => (
            <button
              key={item.id}
              onClick={() => setRange(item.id)}
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

      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/analytics"
          className="flex items-center gap-2 bg-brand-primary text-text-inverse px-5 py-2.5 rounded-lg hover:bg-brand-primary/90 transition text-sm font-semibold"
        >
          <TrendingUp size={18} />
          Analytics Detail
        </Link>
        <Link
          href="/dashboard/verification"
          className="flex items-center gap-2 bg-action text-text-inverse px-5 py-2.5 rounded-lg hover:bg-action/90 transition text-sm font-semibold"
        >
          <UserCheck size={18} />
          Verifikasi User
        </Link>
        <button
          className="flex items-center gap-2 bg-surface-primary text-text-primary border border-text-secondary/20 px-5 py-2.5 rounded-lg hover:bg-surface-secondary transition text-sm font-semibold opacity-50 cursor-not-allowed"
          title="Fitur belum tersedia"
        >
          <PenTool size={18} />
          Tulis Artikel
        </button>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard title="Total User" value={data?.kpis.users_total || 0} icon={Users} color="text-brand-primary" />
        <MetricCard title="Aktif Hari Ini" value={data?.kpis.users_active_today || 0} icon={Activity} color="text-action" />
        <MetricCard title="Online Saat Ini" value={data?.kpis.users_online_now || 0} icon={TrendingUp} color="text-status-success" />
        <MetricCard title="Total Laporan" value={data?.kpis.reports_total || 0} icon={AlertCircle} color="text-status-error" />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <MetricCard title="Verified" value={data?.kpis.users_verified || 0} icon={CheckCircle2} color="text-status-success" />
        <MetricCard title="Pending" value={data?.kpis.users_pending || 0} icon={Clock3} color="text-status-pending" />
        <MetricCard title="Unverified" value={data?.kpis.users_unverified || 0} icon={Users} color="text-text-secondary" />
        <MetricCard title="Rejected" value={data?.kpis.users_rejected || 0} icon={XCircle} color="text-status-error" />
        <MetricCard title="Banned" value={data?.kpis.users_banned || 0} icon={Ban} color="text-status-error" />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-action" />
                  Aktivitas User
                </h3>
                <p className="text-xs text-text-secondary mt-1">
                  Aktif dalam periode ini: <span className="font-semibold text-text-primary">{data?.kpis.users_active_period || 0}</span>
                </p>
              </div>
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
                Periode: {data?.filters.from} s/d {data?.filters.to}
              </span>
            </div>
            <SimpleBarChart data={data?.trends.reports.points || []} colorClass="bg-status-error" valueSuffix="laporan" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-6 shadow-sm flex flex-col justify-center space-y-4">
              <h3 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-2">
                <LayoutDashboard className="w-5 h-5 text-brand-primary" />
                Data Master Global
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-surface-secondary dark:bg-surface-inverse rounded-lg">
                  <span className="text-sm font-medium text-text-secondary flex items-center gap-2">
                    <Globe className="w-4 h-4" /> Negara
                  </span>
                  <span className="font-bold text-text-primary">{data?.kpis.countries || 0}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-surface-secondary dark:bg-surface-inverse rounded-lg">
                  <span className="text-sm font-medium text-text-secondary flex items-center gap-2">
                    <MapPin className="w-4 h-4" /> Keuskupan
                  </span>
                  <span className="font-bold text-text-primary">{data?.kpis.dioceses || 0}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-surface-secondary dark:bg-surface-inverse rounded-lg">
                  <span className="text-sm font-medium text-text-secondary flex items-center gap-2">
                    <Home className="w-4 h-4" /> Paroki
                  </span>
                  <span className="font-bold text-text-primary">{data?.kpis.churches || 0}</span>
                </div>
              </div>
            </div>

            <div className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-6 shadow-sm">
              <h3 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-status-success" />
                Komposisi Role
              </h3>
              <div className="space-y-3">
                {data?.roles.map((item) => (
                  <div key={item.role} className="flex justify-between items-center">
                    <span className="text-sm capitalize text-text-primary">{item.role}</span>
                    <span className="text-xs bg-surface-secondary dark:bg-surface-inverse px-2 py-1 rounded-full text-text-primary font-bold">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-6 shadow-sm">
            <h3 className="text-lg font-bold text-text-primary mb-4">Status Verifikasi</h3>
            <div className="space-y-3">
              {data?.verification_status.map((item) => (
                <div key={item.status} className="flex items-center justify-between">
                  <span className="text-sm capitalize text-text-primary">{item.status}</span>
                  <span className="text-xs px-2 py-1 rounded-full bg-surface-secondary dark:bg-surface-inverse font-semibold text-text-primary">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <MapPin className="w-5 h-5 text-action" />
                Distribusi Lokasi
              </h3>
              <Link href="/dashboard/analytics" className="text-xs font-bold text-action hover:underline">
                Lihat Detail
              </Link>
            </div>

            <div className="flex rounded-lg bg-surface-secondary dark:bg-surface-inverse p-1 mb-4 text-xs">
              {([
                { id: 'countries', label: 'Negara' },
                { id: 'dioceses', label: 'Keuskupan' },
                { id: 'churches', label: 'Paroki' },
              ] as const).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setLocationTab(item.id)}
                  className={`flex-1 py-2 rounded-md font-semibold transition ${
                    locationTab === item.id
                      ? 'bg-surface-primary text-action shadow'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="max-h-[360px] overflow-y-auto border border-surface-secondary dark:border-surface-secondary/20 rounded-lg">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-text-secondary uppercase bg-surface-secondary dark:bg-surface-inverse sticky top-0">
                  <tr>
                    <th className="p-2">Nama</th>
                    <th className="p-2 text-right">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-secondary dark:divide-surface-secondary/20">
                  {locationRows.length > 0 ? (
                    locationRows.map((item) => (
                      <tr key={item.id} className="hover:bg-surface-secondary dark:hover:bg-surface-inverse/50 transition-colors">
                        <td className="p-2 text-text-primary">
                          <Link href={item.link} className="hover:text-action transition-colors">
                            {item.name}
                          </Link>
                        </td>
                        <td className="p-2 text-right font-bold text-text-primary">{item.count}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="p-6 text-center text-text-secondary text-xs">
                        Tidak ada data lokasi.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
