'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import StatsCards from '@/components/verification/StatsCards';
import { UserCheck, PenTool, LayoutDashboard, Globe, MapPin, Home, TrendingUp, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

interface AnalyticsData {
    kpis: {
        countries: number;
        dioceses: number;
        churches: number;
        articles: number;
        users_total: number;
        users_verified: number;
        users_pending: number;
        users_rejected: number;
        users_unverified: number;
        dau_today: number;
        reports_total: number;
        reports_open: number;
    };
    dau: {
        week: { date: string; count: number; label: string }[];
        month: { date: string; count: number; label: string }[];
        year: { date: string; count: number; label: string }[];
    };
    reports: {
        week: { date: string; count: number; label: string }[];
    };
    roles: { role: string; count: number }[];
    location: {
        countries: { id: string; name: string; count: number }[];
        dioceses: { id: string; name: string; country_id: string; count: number }[];
        churches: { id: string; name: string; diocese_id: string; count: number }[];
    };
}

export default function DashboardOverview() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dauTab, setDauTab] = useState<'week' | 'month' | 'year'>('week');

    // Filter states for location drilldown
    const [selectedCountry, setSelectedCountry] = useState<string>('');
    const [selectedDiocese, setSelectedDiocese] = useState<string>('');

    useEffect(() => {
        async function fetchAnalytics() {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch('/api/admin/dashboard-analytics');
                if (!res.ok) {
                    const txt = await res.text();
                    throw new Error(`API Error ${res.status}: ${txt}`);
                }
                const json = await res.json();
                console.log("Analytics Data:", json);
                setData(json);
            } catch (err: any) {
                console.error("Error loading analytics:", err);
                setError(err.message || "Gagal memuat data analytics.");
            } finally {
                setLoading(false);
            }
        }
        fetchAnalytics();
    }, []);

    const today = format(new Date(), 'EEEE, d MMMM yyyy', { locale: id });

    // Location Data Filtering
    const displayedLocationData = useMemo(() => {
        if (!data) return [];

        if (selectedCountry && selectedDiocese) {
            // Show Churches in Diocese
            return data.location.churches
                .filter(c => c.diocese_id === selectedDiocese)
                .map(c => ({ name: c.name, count: c.count, type: 'Paroki' }));
        } else if (selectedCountry) {
            // Show Dioceses in Country
            return data.location.dioceses
                .filter(d => d.country_id === selectedCountry)
                .map(d => ({ name: d.name, count: d.count, type: 'Keuskupan' }));
        } else {
            // Show Countries
            return data.location.countries.map(c => ({ name: c.name, count: c.count, type: 'Negara' }));
        }
    }, [data, selectedCountry, selectedDiocese]);

    // Simple Bar Chart Component
    const SimpleBarChart = ({ data, colorClass = "bg-action" }: { data: { label: string; count: number }[], colorClass?: string }) => {
        if (!data || data.length === 0) return <div className="h-40 flex items-center justify-center text-text-secondary text-xs">Tidak ada data</div>;

        const max = Math.max(...data.map(d => d.count), 1);
        return (
            <div className="flex items-end gap-2 h-40 w-full pt-4">
                {data.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center group relative cursor-pointer">
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 bg-surface-inverse text-text-inverse text-xs rounded px-2 py-1 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow-md transform -translate-x-1/2 left-1/2">
                            {d.label}: {d.count} user
                        </div>

                        <div
                            className={`w-full max-w-[20px] rounded-t-lg transition-all duration-500 ease-out ${colorClass} opacity-80 group-hover:opacity-100 min-h-[4px]`}
                            style={{ height: `${(d.count / max) * 100}%` }}
                        ></div>
                        <span className="text-[10px] text-text-secondary mt-1 truncate w-full text-center">{d.label.split(' ')[0]}</span>
                    </div>
                ))}
            </div>
        );
    };

    if (loading && !data) {
        return (
            <div className="p-12 text-center text-text-secondary flex flex-col items-center justify-center min-h-[50vh]">
                <div className="animate-spin w-10 h-10 border-4 border-action border-t-transparent rounded-full mb-4"></div>
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
        <div className="space-y-8 max-w-7xl mx-auto pb-12 animate-in fade-in duration-500">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-text-primary tracking-tight">
                        Ringkasan Dashboard
                    </h1>
                    <p className="text-text-secondary mt-1 text-sm font-medium">
                        {today}
                    </p>
                </div>

                <div className="flex gap-3">
                    <Link
                        href="/dashboard/verification"
                        className="flex items-center gap-2 bg-action text-text-inverse px-5 py-2.5 rounded-lg hover:bg-action/90 transition shadow-sm font-medium text-sm"
                    >
                        <UserCheck size={18} />
                        Verifikasi User
                    </Link>
                    <button
                        className="flex items-center gap-2 bg-surface-primary text-text-primary border border-text-secondary/20 px-5 py-2.5 rounded-lg hover:bg-surface-secondary transition shadow-sm font-medium text-sm opacity-50 cursor-not-allowed"
                        title="Fitur belum tersedia"
                    >
                        <PenTool size={18} />
                        Tulis Artikel
                    </button>
                </div>
            </div>

            {/* KPI GRID */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Existing Stats Logic Mapped */}
                <StatsCards
                    loading={loading}
                    stats={{
                        total: data?.kpis.users_total || 0,
                        pending: data?.kpis.users_pending || 0,
                        verified: data?.kpis.users_verified || 0,
                        articles: data?.kpis.articles || 0
                    }}
                />
            </section>

            {/* EXTENDED ANALYTICS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* 1. DAU & Reports Charts (Main Column 2/3) */}
                <div className="lg:col-span-2 space-y-8">

                    {/* DAU Chart */}
                    <div className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-text-primary dark:text-text-inverse flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-action" />
                                    Aktivitas Harian (DAU)
                                </h3>
                                <p className="text-sm text-text-secondary mt-1">
                                    User aktif hari ini: <span className="font-bold text-text-primary dark:text-text-inverse text-lg ml-1">{data?.kpis.dau_today}</span>
                                </p>
                            </div>
                            <div className="flex bg-surface-secondary dark:bg-surface-inverse rounded-lg p-1">
                                {(['week', 'month', 'year'] as const).map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => setDauTab(t)}
                                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all capitalize ${dauTab === t
                                                ? 'bg-surface-primary dark:bg-surface-secondary shadow text-action'
                                                : 'text-text-secondary hover:text-text-primary'
                                            }`}
                                    >
                                        {t === 'year' ? 'Tahun' : t === 'month' ? 'Bulan' : 'Minggu'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <SimpleBarChart data={data?.dau[dauTab] || []} colorClass="bg-action" />
                    </div>

                    {/* Reports & Master Data Split */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Reports Chart */}
                        <div className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-text-primary dark:text-text-inverse flex items-center gap-2">
                                    <AlertCircle className="w-5 h-5 text-status-error" />
                                    Laporan User
                                </h3>
                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${data?.kpis.reports_open ? 'bg-status-error/10 text-status-error' : 'bg-status-success/10 text-status-success'}`}>
                                    OPEN: {data?.kpis.reports_open}
                                </span>
                            </div>
                            <SimpleBarChart data={data?.reports.week || []} colorClass="bg-status-error" />
                        </div>

                        {/* Master Data Summary */}
                        <div className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-6 shadow-sm flex flex-col justify-center space-y-4">
                            <h3 className="text-lg font-bold text-text-primary dark:text-text-inverse flex items-center gap-2 mb-2">
                                <LayoutDashboard className="w-5 h-5 text-brand-primary" />
                                Data Master Global
                            </h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center p-3 bg-surface-secondary dark:bg-surface-inverse rounded-lg">
                                    <span className="text-sm font-medium text-text-secondary flex items-center gap-2">
                                        <Globe className="w-4 h-4" /> Negara
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-text-primary dark:text-text-inverse">{data?.kpis.countries}</span>
                                        <span className="text-[10px] text-text-secondary">terdaftar</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-surface-secondary dark:bg-surface-inverse rounded-lg">
                                    <span className="text-sm font-medium text-text-secondary flex items-center gap-2">
                                        <MapPin className="w-4 h-4" /> Keuskupan
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-text-primary dark:text-text-inverse">{data?.kpis.dioceses}</span>
                                        <span className="text-[10px] text-text-secondary">terdaftar</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-surface-secondary dark:bg-surface-inverse rounded-lg">
                                    <span className="text-sm font-medium text-text-secondary flex items-center gap-2">
                                        <Home className="w-4 h-4" /> Paroki
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-text-primary dark:text-text-inverse">{data?.kpis.churches}</span>
                                        <span className="text-[10px] text-text-secondary">terdaftar</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Side Panel (Role & Location Drilldown) (Col 3) */}
                <div className="space-y-8">

                    {/* Role Breakdown */}
                    <div className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-6 shadow-sm">
                        <h3 className="text-lg font-bold text-text-primary dark:text-text-inverse mb-4 flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-status-success" />
                            Komposisi User
                        </h3>
                        {data?.roles.length === 0 ? (
                            <div className="text-center py-8 text-text-secondary text-sm">Belum ada user</div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex justify-between text-xs text-text-secondary font-semibold uppercase pb-2 border-b border-surface-secondary dark:border-surface-secondary/20">
                                    <span>Role</span>
                                    <span>Jumlah</span>
                                </div>
                                {data?.roles.map((r) => (
                                    <div key={r.role} className="flex justify-between items-center group">
                                        <span className="text-sm capitalize text-text-primary dark:text-text-inverse font-medium group-hover:text-action transition-colors">{r.role}</span>
                                        <span className="text-xs bg-surface-secondary dark:bg-surface-inverse px-2 py-1 rounded-full text-text-primary dark:text-text-inverse font-bold">
                                            {r.count}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Location Drilldown */}
                    <div className="bg-surface-primary rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-6 shadow-sm h-fit">
                        <h3 className="text-lg font-bold text-text-primary dark:text-text-inverse mb-4 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-action" />
                            Distribusi Lokasi
                        </h3>

                        <div className="space-y-3 mb-4">
                            <select
                                className="w-full p-2.5 bg-surface-secondary dark:bg-surface-inverse border border-surface-secondary dark:border-surface-secondary/20 rounded-lg text-sm outline-none focus:ring-2 focus:ring-action/20 text-text-primary dark:text-text-inverse"
                                value={selectedCountry}
                                onChange={(e) => {
                                    setSelectedCountry(e.target.value);
                                    setSelectedDiocese('');
                                }}
                            >
                                <option value="">Semua Negara ({data?.location.countries.length})</option>
                                {data?.location.countries.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>

                            <select
                                className="w-full p-2.5 bg-surface-secondary dark:bg-surface-inverse border border-surface-secondary dark:border-surface-secondary/20 rounded-lg text-sm outline-none focus:ring-2 focus:ring-action/20 disabled:opacity-50 text-text-primary dark:text-text-inverse"
                                value={selectedDiocese}
                                onChange={(e) => setSelectedDiocese(e.target.value)}
                                disabled={!selectedCountry}
                            >
                                <option value="">Semua Keuskupan</option>
                                {data?.location.dioceses
                                    .filter(d => d.country_id === selectedCountry)
                                    .map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                            </select>
                        </div>

                        <div className="max-h-[300px] overflow-y-auto pr-1 custom-scrollbar border-t border-surface-secondary dark:border-surface-secondary/20 pt-2">
                            <table className="w-full text-left text-sm">
                                <thead className="text-xs text-text-secondary uppercase bg-surface-secondary dark:bg-surface-inverse sticky top-0">
                                    <tr>
                                        <th className="p-2 w-2/3">Nama</th>
                                        <th className="p-2 text-right">User</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-surface-secondary dark:divide-surface-secondary/20">
                                    {displayedLocationData.length > 0 ? (
                                        displayedLocationData.slice(0, 50).map((item, idx) => (
                                            <tr key={idx} className="group hover:bg-surface-secondary dark:hover:bg-surface-inverse/50 transition-colors">
                                                <td className="p-2 text-text-primary dark:text-text-inverse truncate max-w-[150px]">
                                                    <div className="font-medium truncate" title={item.name}>{item.name}</div>
                                                    <div className="text-[10px] text-text-secondary">{item.type}</div>
                                                </td>
                                                <td className="p-2 text-right font-bold text-text-primary dark:text-text-inverse">{item.count}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={2} className="p-8 text-center text-text-secondary text-xs border border-dashed border-surface-secondary rounded-lg m-2">
                                                Tidak ada data lokasi users untuk filter ini.
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
