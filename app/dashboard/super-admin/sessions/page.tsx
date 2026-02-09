'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    CheckCircle2,
    LogIn,
    LogOut,
    RefreshCcw,
    Search,
    Shield,
    Timer,
} from 'lucide-react';

type SessionRow = {
    id: string;
    admin_auth_user_id: string;
    email: string;
    full_name: string;
    role: string;
    status: string;
    login_at: string | null;
    logout_at: string | null;
    is_active: boolean;
    duration_seconds: number;
    ip: string;
    user_agent: string;
};

type Notice = {
    type: 'error' | 'success';
    message: string;
} | null;

function formatDateTime(value?: string | null): string {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}

function formatDuration(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    return `${h}j ${m}m ${s}d`;
}

function formatRoleLabel(role?: string | null): string {
    if (role === 'super_admin') return 'Super Admin';
    if (role === 'admin_ops') return 'Admin Ops';
    return role || '-';
}

function statusBadgeClass(active: boolean): string {
    if (active) return 'border-status-success/30 bg-status-success/10 text-status-success';
    return 'border-status-error/30 bg-status-error/10 text-status-error';
}

function roleBadgeClass(role?: string | null): string {
    if (role === 'super_admin') return 'border-brand-primary/30 bg-brand-primary/10 text-brand-primary';
    return 'border-action/30 bg-action/10 text-action';
}

function parseErrorMessage(json: unknown, fallback: string): string {
    if (json && typeof json === 'object' && 'message' in json) {
        const msg = (json as { message?: unknown }).message;
        if (typeof msg === 'string' && msg.trim()) return msg;
    }
    return fallback;
}

function toDateTimeInputValue(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
        date.getMinutes()
    )}`;
}

export default function SuperAdminSessionsPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<Notice>(null);
    const [rows, setRows] = useState<SessionRow[]>([]);
    const [q, setQ] = useState('');
    const [debouncedQ, setDebouncedQ] = useState('');
    const [status, setStatus] = useState<'all' | 'active' | 'closed'>('all');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState({ total_items: 0, total_pages: 1, limit: 20 });

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQ(q.trim());
            setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [q]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(meta.limit),
                status,
            });
            if (debouncedQ) params.set('q', debouncedQ);
            if (from) params.set('from', from);
            if (to) params.set('to', to);

            const res = await fetch(`/api/admin/super-admin/sessions?${params.toString()}`, {
                cache: 'no-store',
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal memuat admin sessions.'));

            setRows((json.data || []) as SessionRow[]);
            setMeta({
                total_items: Number(json.total_items || 0),
                total_pages: Number(json.total_pages || 1),
                limit: Number(json.limit || 20),
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Gagal memuat admin sessions.';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [debouncedQ, from, meta.limit, page, status, to]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const setQuickRange = (days: number) => {
        const now = new Date();
        const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        setFrom(toDateTimeInputValue(past));
        setTo(toDateTimeInputValue(now));
        setPage(1);
    };

    const clearFilters = () => {
        setQ('');
        setDebouncedQ('');
        setStatus('all');
        setFrom('');
        setTo('');
        setPage(1);
    };

    const activeCount = useMemo(() => rows.filter((row) => row.is_active).length, [rows]);
    const closedCount = useMemo(() => rows.filter((row) => !row.is_active).length, [rows]);
    const avgDuration = useMemo(() => {
        if (rows.length === 0) return 0;
        const sum = rows.reduce((acc, row) => acc + Number(row.duration_seconds || 0), 0);
        return Math.round(sum / rows.length);
    }, [rows]);

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-surface-secondary/80 bg-gradient-to-r from-surface-primary via-surface-primary to-action/5 p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-text-primary">Admin Sessions</h1>
                        <p className="mt-1 text-sm text-text-secondary">
                            Monitoring login/logout admin, durasi sesi, IP, dan user-agent secara real-time.
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            setNotice(null);
                            fetchData();
                        }}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-xl border border-surface-secondary px-3 py-2 text-sm font-semibold text-text-primary transition hover:bg-surface-secondary/20 disabled:opacity-50"
                    >
                        <RefreshCcw size={14} />
                        Refresh
                    </button>
                </div>
            </div>

            {notice && (
                <div
                    className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-2 ${
                        notice.type === 'success'
                            ? 'border-status-success/40 bg-status-success/10 text-status-success'
                            : 'border-status-error/40 bg-status-error/10 text-status-error'
                    }`}
                >
                    {notice.type === 'success' ? (
                        <CheckCircle2 size={16} className="mt-0.5" />
                    ) : (
                        <AlertCircle size={16} className="mt-0.5" />
                    )}
                    <span>{notice.message}</span>
                </div>
            )}

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-4">
                    <p className="text-xs uppercase tracking-wide text-text-secondary">Total Sessions</p>
                    <p className="mt-2 text-2xl font-bold text-text-primary">{meta.total_items}</p>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
                        <Shield size={13} />
                        Semua data
                    </div>
                </div>
                <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-4">
                    <p className="text-xs uppercase tracking-wide text-text-secondary">Aktif (Halaman)</p>
                    <p className="mt-2 text-2xl font-bold text-status-success">{activeCount}</p>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
                        <LogIn size={13} />
                        Belum logout
                    </div>
                </div>
                <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-4">
                    <p className="text-xs uppercase tracking-wide text-text-secondary">Closed (Halaman)</p>
                    <p className="mt-2 text-2xl font-bold text-status-error">{closedCount}</p>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
                        <LogOut size={13} />
                        Sudah logout
                    </div>
                </div>
                <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-4">
                    <p className="text-xs uppercase tracking-wide text-text-secondary">Rata-rata Durasi</p>
                    <p className="mt-2 text-2xl font-bold text-action">{formatDuration(avgDuration)}</p>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
                        <Timer size={13} />
                        Per data halaman ini
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-5 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-semibold text-text-secondary">Cari Session</label>
                        <div className="relative">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                            <input
                                type="text"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Email, nama, role, IP, user-agent..."
                                className="w-full rounded-xl border border-surface-secondary bg-surface-primary pl-9 pr-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-text-secondary">Status</label>
                        <select
                            value={status}
                            onChange={(e) => {
                                setStatus(e.target.value as 'all' | 'active' | 'closed');
                                setPage(1);
                            }}
                            className="w-full rounded-xl border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                        >
                            <option value="all">Semua</option>
                            <option value="active">Masih Aktif</option>
                            <option value="closed">Sudah Logout</option>
                        </select>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-text-secondary">Dari</label>
                        <input
                            type="datetime-local"
                            value={from}
                            onChange={(e) => {
                                setFrom(e.target.value);
                                setPage(1);
                            }}
                            className="w-full rounded-xl border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-text-secondary">Sampai</label>
                        <input
                            type="datetime-local"
                            value={to}
                            onChange={(e) => {
                                setTo(e.target.value);
                                setPage(1);
                            }}
                            className="w-full rounded-xl border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                        />
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => setQuickRange(1)}
                        className="rounded-lg border border-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-surface-secondary/20"
                    >
                        24 Jam
                    </button>
                    <button
                        onClick={() => setQuickRange(7)}
                        className="rounded-lg border border-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-surface-secondary/20"
                    >
                        7 Hari
                    </button>
                    <button
                        onClick={() => setQuickRange(30)}
                        className="rounded-lg border border-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-surface-secondary/20"
                    >
                        30 Hari
                    </button>
                    <button
                        onClick={clearFilters}
                        className="rounded-lg border border-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-surface-secondary/20"
                    >
                        Reset Filter
                    </button>
                </div>
            </div>

            <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-text-primary">Data Sessions</h2>
                    <div className="text-xs text-text-secondary">
                        Halaman <span className="font-semibold text-text-primary">{page}</span> dari{' '}
                        <span className="font-semibold text-text-primary">{meta.total_pages}</span>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 rounded-lg border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error">
                        {error}
                    </div>
                )}

                <div className="overflow-x-auto rounded-xl border border-surface-secondary/60">
                    <table className="min-w-full text-sm">
                        <thead className="bg-surface-secondary/80 text-xs uppercase tracking-wide text-text-secondary">
                            <tr>
                                <th className="px-3 py-2 text-left">Admin</th>
                                <th className="px-3 py-2 text-left">Login</th>
                                <th className="px-3 py-2 text-left">Logout</th>
                                <th className="px-3 py-2 text-left">Durasi</th>
                                <th className="px-3 py-2 text-left">IP</th>
                                <th className="px-3 py-2 text-left">User-Agent</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-secondary/60">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-3 py-8 text-center text-text-secondary">
                                        Memuat data...
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-3 py-8 text-center text-text-secondary">
                                        Tidak ada data session.
                                    </td>
                                </tr>
                            ) : (
                                rows.map((row) => (
                                    <tr key={row.id} className="transition hover:bg-surface-secondary/20">
                                        <td className="px-3 py-3 align-top">
                                            <div className="font-semibold text-text-primary">{row.full_name || '-'}</div>
                                            <div className="mt-0.5 text-xs text-text-secondary">{row.email || row.admin_auth_user_id}</div>
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                <span
                                                    className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${roleBadgeClass(
                                                        row.role
                                                    )}`}
                                                >
                                                    {formatRoleLabel(row.role)}
                                                </span>
                                                <span
                                                    className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(
                                                        row.is_active
                                                    )}`}
                                                >
                                                    {row.is_active ? 'Active' : 'Closed'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 align-top text-text-primary">{formatDateTime(row.login_at)}</td>
                                        <td className="px-3 py-3 align-top text-text-primary">{formatDateTime(row.logout_at)}</td>
                                        <td className="px-3 py-3 align-top text-text-primary">{formatDuration(row.duration_seconds)}</td>
                                        <td className="px-3 py-3 align-top">
                                            <code className="rounded bg-surface-secondary/40 px-2 py-1 text-xs text-text-primary">
                                                {row.ip || '-'}
                                            </code>
                                        </td>
                                        <td className="px-3 py-3 align-top text-text-secondary max-w-[420px] truncate" title={row.user_agent || '-'}>
                                            {row.user_agent || '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {meta.total_pages > 1 && (
                    <div className="mt-4 flex items-center justify-end gap-2">
                        <button
                            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                            disabled={page <= 1}
                            className="rounded-lg border border-surface-secondary px-3 py-1.5 text-sm text-text-primary disabled:opacity-50"
                        >
                            Sebelumnya
                        </button>
                        <span className="text-xs text-text-secondary">
                            Halaman {page} / {meta.total_pages}
                        </span>
                        <button
                            onClick={() => setPage((prev) => Math.min(meta.total_pages, prev + 1))}
                            disabled={page >= meta.total_pages}
                            className="rounded-lg border border-surface-secondary px-3 py-1.5 text-sm text-text-primary disabled:opacity-50"
                        >
                            Berikutnya
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
