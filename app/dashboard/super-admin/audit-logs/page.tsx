'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    CheckCircle2,
    Database,
    FileJson,
    History,
    RefreshCcw,
    Search,
    Shield,
} from 'lucide-react';

type AuditRow = {
    id: string;
    action: string;
    table_name: string;
    record_id: string;
    actor_auth_user_id: string;
    actor_email: string;
    actor_full_name: string;
    actor_role: string;
    occurred_at: string | null;
    old_data: Record<string, unknown> | null;
    new_data: Record<string, unknown> | null;
    request_headers: Record<string, unknown> | null;
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

function toPrettyJson(value: unknown): string {
    return JSON.stringify(value || {}, null, 2);
}

function formatRoleLabel(role?: string | null): string {
    if (role === 'super_admin') return 'Super Admin';
    if (role === 'admin_ops') return 'Admin Ops';
    return role || '-';
}

function roleBadgeClass(role?: string | null): string {
    if (role === 'super_admin') return 'border-brand-primary/30 bg-brand-primary/10 text-brand-primary';
    return 'border-action/30 bg-action/10 text-action';
}

function actionBadgeClass(action?: string | null): string {
    const value = (action || '').toUpperCase();
    if (value.includes('DELETE') || value.includes('SUSPEND') || value.includes('REJECT')) {
        return 'border-status-error/30 bg-status-error/10 text-status-error';
    }
    if (value.includes('APPROVE') || value.includes('ACTIVATE') || value.includes('CREATE')) {
        return 'border-status-success/30 bg-status-success/10 text-status-success';
    }
    return 'border-status-pending/30 bg-status-pending/10 text-status-pending';
}

function parseErrorMessage(json: unknown, fallback: string): string {
    if (json && typeof json === 'object' && 'message' in json) {
        const msg = (json as { message?: unknown }).message;
        if (typeof msg === 'string' && msg.trim()) return msg;
    }
    return fallback;
}

export default function SuperAdminAuditLogsPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<Notice>(null);
    const [rows, setRows] = useState<AuditRow[]>([]);
    const [q, setQ] = useState('');
    const [debouncedQ, setDebouncedQ] = useState('');
    const [action, setAction] = useState('');
    const [tableName, setTableName] = useState('');
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
            });
            if (debouncedQ) params.set('q', debouncedQ);
            if (action.trim()) params.set('action', action.trim());
            if (tableName.trim()) params.set('table', tableName.trim());
            if (from) params.set('from', from);
            if (to) params.set('to', to);

            const res = await fetch(`/api/admin/super-admin/audit-logs?${params.toString()}`, {
                cache: 'no-store',
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal memuat audit logs.'));

            setRows((json.data || []) as AuditRow[]);
            setMeta({
                total_items: Number(json.total_items || 0),
                total_pages: Number(json.total_pages || 1),
                limit: Number(json.limit || 20),
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Gagal memuat audit logs.';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [action, debouncedQ, from, meta.limit, page, tableName, to]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const clearFilters = () => {
        setQ('');
        setDebouncedQ('');
        setAction('');
        setTableName('');
        setFrom('');
        setTo('');
        setPage(1);
    };

    const uniqueActions = useMemo(() => {
        const set = new Set(rows.map((row) => row.action).filter(Boolean));
        return set.size;
    }, [rows]);

    const uniqueTables = useMemo(() => {
        const set = new Set(rows.map((row) => row.table_name).filter(Boolean));
        return set.size;
    }, [rows]);

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-surface-secondary/80 bg-gradient-to-r from-surface-primary via-surface-primary to-action/5 p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-text-primary">Audit Logs</h1>
                        <p className="mt-1 text-sm text-text-secondary">
                            Jejak aksi admin: action, target tabel, before/after, dan metadata request.
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
                    <p className="text-xs uppercase tracking-wide text-text-secondary">Total Logs</p>
                    <p className="mt-2 text-2xl font-bold text-text-primary">{meta.total_items}</p>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
                        <History size={13} />
                        Semua periode
                    </div>
                </div>
                <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-4">
                    <p className="text-xs uppercase tracking-wide text-text-secondary">Aksi Unik</p>
                    <p className="mt-2 text-2xl font-bold text-action">{uniqueActions}</p>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
                        <Shield size={13} />
                        Halaman ini
                    </div>
                </div>
                <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-4">
                    <p className="text-xs uppercase tracking-wide text-text-secondary">Tabel Unik</p>
                    <p className="mt-2 text-2xl font-bold text-status-pending">{uniqueTables}</p>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
                        <Database size={13} />
                        Halaman ini
                    </div>
                </div>
                <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-4">
                    <p className="text-xs uppercase tracking-wide text-text-secondary">Data Per Halaman</p>
                    <p className="mt-2 text-2xl font-bold text-status-success">{rows.length}</p>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
                        <FileJson size={13} />
                        limit {meta.limit}
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-5 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-semibold text-text-secondary">Cari Global</label>
                        <div className="relative">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                            <input
                                type="text"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Action, table, record id, actor..."
                                className="w-full rounded-xl border border-surface-secondary bg-surface-primary pl-9 pr-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-text-secondary">Action</label>
                        <input
                            type="text"
                            value={action}
                            onChange={(e) => {
                                setAction(e.target.value);
                                setPage(1);
                            }}
                            placeholder="mis: APPROVE_ADMIN"
                            className="w-full rounded-xl border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-text-secondary">Table</label>
                        <input
                            type="text"
                            value={tableName}
                            onChange={(e) => {
                                setTableName(e.target.value);
                                setPage(1);
                            }}
                            placeholder="mis: admin_users"
                            className="w-full rounded-xl border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                        />
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

                <div className="mt-4 flex flex-wrap gap-2">
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
                    <h2 className="text-lg font-bold text-text-primary">Data Audit</h2>
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

                <div className="space-y-3">
                    {loading ? (
                        <div className="rounded-xl border border-surface-secondary/60 p-6 text-center text-text-secondary">
                            Memuat audit logs...
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="rounded-xl border border-surface-secondary/60 p-6 text-center text-text-secondary">
                            Tidak ada data audit.
                        </div>
                    ) : (
                        rows.map((row) => (
                            <details
                                key={row.id}
                                className="rounded-xl border border-surface-secondary/60 bg-surface-primary [&_summary::-webkit-details-marker]:hidden"
                            >
                                <summary className="list-none cursor-pointer px-4 py-3">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span
                                                    className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${actionBadgeClass(
                                                        row.action
                                                    )}`}
                                                >
                                                    {row.action || '-'}
                                                </span>
                                                <span className="text-xs text-text-secondary">
                                                    {row.table_name || '-'} / {row.record_id || '-'}
                                                </span>
                                            </div>
                                            <div className="mt-2 text-[11px] text-text-secondary">log_id: {row.id}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="flex flex-wrap items-center justify-end gap-2">
                                                <span className="text-sm font-semibold text-text-primary">
                                                    {row.actor_full_name || '-'}
                                                </span>
                                                <span
                                                    className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${roleBadgeClass(
                                                        row.actor_role
                                                    )}`}
                                                >
                                                    {formatRoleLabel(row.actor_role)}
                                                </span>
                                            </div>
                                            <div className="mt-1 text-xs text-text-secondary">
                                                {row.actor_email || row.actor_auth_user_id || '-'}
                                            </div>
                                            <div className="text-xs text-text-secondary">{formatDateTime(row.occurred_at)}</div>
                                        </div>
                                    </div>
                                </summary>

                                <div className="grid grid-cols-1 gap-3 px-4 pb-4 lg:grid-cols-2">
                                    <div className="rounded-lg border border-surface-secondary/60">
                                        <div className="border-b border-surface-secondary/60 px-3 py-2 text-xs font-semibold uppercase text-text-secondary">
                                            Old Data
                                        </div>
                                        <pre className="max-h-64 overflow-auto bg-surface-secondary/10 p-3 text-xs text-text-primary">
                                            {toPrettyJson(row.old_data)}
                                        </pre>
                                    </div>
                                    <div className="rounded-lg border border-surface-secondary/60">
                                        <div className="border-b border-surface-secondary/60 px-3 py-2 text-xs font-semibold uppercase text-text-secondary">
                                            New Data
                                        </div>
                                        <pre className="max-h-64 overflow-auto bg-surface-secondary/10 p-3 text-xs text-text-primary">
                                            {toPrettyJson(row.new_data)}
                                        </pre>
                                    </div>
                                    <div className="rounded-lg border border-surface-secondary/60 lg:col-span-2">
                                        <div className="border-b border-surface-secondary/60 px-3 py-2 text-xs font-semibold uppercase text-text-secondary">
                                            Request Headers
                                        </div>
                                        <pre className="max-h-48 overflow-auto bg-surface-secondary/10 p-3 text-xs text-text-primary">
                                            {toPrettyJson(row.request_headers)}
                                        </pre>
                                    </div>
                                </div>
                            </details>
                        ))
                    )}
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
