'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    AlertCircle,
    Ban,
    CheckCircle2,
    Clock3,
    Plus,
    RotateCcw,
    Search,
    Shield,
    ShieldCheck,
    Trash2,
    UserCog,
    Users,
} from 'lucide-react';

type AdminRole = 'super_admin' | 'admin_ops';
type AdminStatus = 'pending_approval' | 'approved' | 'suspended';

type AdminRow = {
    auth_user_id: string;
    email: string;
    full_name: string;
    role: AdminRole;
    status: AdminStatus;
    approved_at?: string | null;
    approved_by?: string | null;
    created_at: string;
    updated_at?: string | null;
    is_self?: boolean;
    is_last_super_admin?: boolean;
};

type AllowlistRow = {
    email: string;
    note?: string | null;
    added_at?: string | null;
    updated_at?: string | null;
};

type Notice = {
    type: 'success' | 'error';
    message: string;
} | null;

const ROLE_OPTIONS: AdminRole[] = ['admin_ops', 'super_admin'];
const STATUS_OPTIONS: Array<AdminStatus | 'all'> = ['pending_approval', 'approved', 'suspended', 'all'];

function formatDateTime(value?: string | null): string {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}

function parseErrorMessage(json: unknown, fallback: string): string {
    if (json && typeof json === 'object' && 'message' in json) {
        const msg = (json as { message?: unknown }).message;
        if (typeof msg === 'string' && msg.trim()) return msg;
    }
    return fallback;
}

function statusBadgeClass(status: AdminStatus): string {
    if (status === 'approved') return 'bg-status-success/10 text-status-success border-status-success/30';
    if (status === 'suspended') return 'bg-status-error/10 text-status-error border-status-error/30';
    return 'bg-status-pending/10 text-status-pending border-status-pending/30';
}

function roleBadgeClass(role: AdminRole): string {
    if (role === 'super_admin') return 'bg-brand-primary/10 text-brand-primary border-brand-primary/25';
    return 'bg-action/10 text-action border-action/25';
}

export default function AdminOpsPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<Notice>(null);
    const [admins, setAdmins] = useState<AdminRow[]>([]);
    const [statusFilter, setStatusFilter] = useState<AdminStatus | 'all'>('all');
    const [roleFilter, setRoleFilter] = useState<AdminRole | 'all'>('all');
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [roleDraftMap, setRoleDraftMap] = useState<Record<string, AdminRole>>({});

    const [allowlistLoading, setAllowlistLoading] = useState(true);
    const [allowlistError, setAllowlistError] = useState<string | null>(null);
    const [allowlistRows, setAllowlistRows] = useState<AllowlistRow[]>([]);
    const [allowlistEmailInput, setAllowlistEmailInput] = useState('');
    const [allowlistNoteInput, setAllowlistNoteInput] = useState('');
    const [allowlistActionLoading, setAllowlistActionLoading] = useState(false);
    const [allowlistSearch, setAllowlistSearch] = useState('');
    const [debouncedAllowlistSearch, setDebouncedAllowlistSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
        return () => clearTimeout(timer);
    }, [query]);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedAllowlistSearch(allowlistSearch.trim()), 250);
        return () => clearTimeout(timer);
    }, [allowlistSearch]);

    const fetchAdmins = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (statusFilter !== 'all') params.set('status', statusFilter);
            if (roleFilter !== 'all') params.set('role', roleFilter);
            if (debouncedQuery) params.set('q', debouncedQuery);

            const res = await fetch(`/api/admin/super-admin/admin-ops?${params.toString()}`, {
                cache: 'no-store',
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal mengambil data admin.'));

            const rows = (json.data || []) as AdminRow[];
            setAdmins(rows);

            const nextDraft: Record<string, AdminRole> = {};
            for (const row of rows) {
                nextDraft[row.auth_user_id] = row.role;
            }
            setRoleDraftMap(nextDraft);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Gagal memuat data admin.';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [debouncedQuery, roleFilter, statusFilter]);

    const fetchAllowlist = useCallback(async () => {
        setAllowlistLoading(true);
        setAllowlistError(null);
        try {
            const url = debouncedAllowlistSearch
                ? `/api/admin/super-admin/allowlist?q=${encodeURIComponent(debouncedAllowlistSearch)}`
                : '/api/admin/super-admin/allowlist';

            const res = await fetch(url, { cache: 'no-store' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal memuat allowlist.'));

            setAllowlistRows((json.data || []) as AllowlistRow[]);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Gagal memuat allowlist.';
            setAllowlistError(message);
        } finally {
            setAllowlistLoading(false);
        }
    }, [debouncedAllowlistSearch]);

    useEffect(() => {
        fetchAdmins();
    }, [fetchAdmins]);

    useEffect(() => {
        fetchAllowlist();
    }, [fetchAllowlist]);

    const pendingCount = useMemo(
        () => admins.filter((row) => row.status === 'pending_approval').length,
        [admins]
    );
    const approvedCount = useMemo(
        () => admins.filter((row) => row.status === 'approved').length,
        [admins]
    );
    const suspendedCount = useMemo(
        () => admins.filter((row) => row.status === 'suspended').length,
        [admins]
    );

    const callAdminAction = async ({
        endpoint,
        payload,
        loadingKey,
        successMessage,
    }: {
        endpoint: string;
        payload: Record<string, unknown>;
        loadingKey: string;
        successMessage: string;
    }) => {
        setActionLoading(loadingKey);
        setNotice(null);
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(parseErrorMessage(json, 'Aksi gagal.'));
            }
            await fetchAdmins();
            setNotice({ type: 'success', message: successMessage });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Aksi gagal.';
            setNotice({ type: 'error', message });
        } finally {
            setActionLoading(null);
        }
    };

    const handleAllowlistSave = async () => {
        const email = allowlistEmailInput.trim().toLowerCase();
        const note = allowlistNoteInput.trim();

        if (!email) {
            setNotice({ type: 'error', message: 'Email allowlist wajib diisi.' });
            return;
        }

        setAllowlistActionLoading(true);
        setNotice(null);
        try {
            const res = await fetch('/api/admin/super-admin/allowlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, note }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal menyimpan allowlist.'));
            setAllowlistEmailInput('');
            setAllowlistNoteInput('');
            await fetchAllowlist();
            setNotice({ type: 'success', message: 'Email allowlist berhasil disimpan.' });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Gagal menyimpan allowlist.';
            setNotice({ type: 'error', message });
        } finally {
            setAllowlistActionLoading(false);
        }
    };

    const handleAllowlistDelete = async (email: string) => {
        if (!window.confirm(`Hapus ${email} dari allowlist?`)) return;
        setAllowlistActionLoading(true);
        setNotice(null);
        try {
            const res = await fetch(`/api/admin/super-admin/allowlist?email=${encodeURIComponent(email)}`, {
                method: 'DELETE',
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal menghapus allowlist.'));
            await fetchAllowlist();
            setNotice({ type: 'success', message: 'Email allowlist berhasil dihapus.' });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Gagal menghapus allowlist.';
            setNotice({ type: 'error', message });
        } finally {
            setAllowlistActionLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-surface-secondary/80 bg-gradient-to-r from-surface-primary via-surface-primary to-action/5 p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold text-text-primary">Manajemen Admin</h1>
                        <p className="text-sm text-text-secondary mt-1">
                            Kelola request admin, role, status akun, dan email allowlist dengan audit yang rapi.
                        </p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-xl border border-status-pending/30 bg-status-pending/10 px-3 py-2 text-sm font-semibold text-status-pending">
                        <Clock3 size={16} />
                        Pending: {pendingCount}
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                        href="/dashboard/super-admin/sessions"
                        className="inline-flex items-center gap-1 rounded-lg border border-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:bg-surface-secondary/20"
                    >
                        <Clock3 size={13} />
                        Admin Sessions
                    </Link>
                    <Link
                        href="/dashboard/super-admin/audit-logs"
                        className="inline-flex items-center gap-1 rounded-lg border border-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:bg-surface-secondary/20"
                    >
                        <ShieldCheck size={13} />
                        Audit Logs
                    </Link>
                    <Link
                        href="/dashboard/super-admin/backups"
                        className="inline-flex items-center gap-1 rounded-lg border border-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:bg-surface-secondary/20"
                    >
                        <RotateCcw size={13} />
                        Backup & Retensi
                    </Link>
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
                    {notice.type === 'success' ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
                    <span>{notice.message}</span>
                </div>
            )}

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-4">
                    <p className="text-xs uppercase tracking-wide text-text-secondary">Total Admin</p>
                    <p className="mt-2 text-2xl font-bold text-text-primary">{admins.length}</p>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
                        <Users size={13} />
                        Semua role
                    </div>
                </div>
                <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-4">
                    <p className="text-xs uppercase tracking-wide text-text-secondary">Approved</p>
                    <p className="mt-2 text-2xl font-bold text-status-success">{approvedCount}</p>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
                        <ShieldCheck size={13} />
                        Bisa akses dashboard
                    </div>
                </div>
                <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-4">
                    <p className="text-xs uppercase tracking-wide text-text-secondary">Pending</p>
                    <p className="mt-2 text-2xl font-bold text-status-pending">{pendingCount}</p>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
                        <Clock3 size={13} />
                        Menunggu approval
                    </div>
                </div>
                <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-4">
                    <p className="text-xs uppercase tracking-wide text-text-secondary">Suspended</p>
                    <p className="mt-2 text-2xl font-bold text-status-error">{suspendedCount}</p>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
                        <Ban size={13} />
                        Akses diblokir
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-5 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-text-secondary mb-1">Cari Admin</label>
                        <div className="relative">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Nama, email, role, status..."
                                className="w-full rounded-xl border border-surface-secondary bg-surface-primary pl-9 pr-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">Filter Status</label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as AdminStatus | 'all')}
                            className="w-full rounded-xl border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                        >
                            {STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>
                                    {status === 'all' ? 'Semua Status' : status}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">Filter Role</label>
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value as AdminRole | 'all')}
                            className="w-full rounded-xl border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                        >
                            <option value="all">Semua Role</option>
                            {ROLE_OPTIONS.map((role) => (
                                <option key={role} value={role}>
                                    {role}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="mt-4 flex justify-end">
                    <button
                        onClick={() => {
                            setQuery('');
                            setDebouncedQuery('');
                            setStatusFilter('all');
                            setRoleFilter('all');
                        }}
                        className="rounded-lg border border-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:bg-surface-secondary/20"
                    >
                        Reset Filter
                    </button>
                </div>
            </div>

            <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                    <h2 className="text-lg font-bold text-text-primary">Daftar Admin</h2>
                    <div className="text-xs text-text-secondary">
                        Menampilkan <span className="font-semibold text-text-primary">{admins.length}</span> data
                    </div>
                </div>

                {error && (
                    <div className="mb-4 rounded-lg border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error">
                        {error}
                    </div>
                )}

                <div className="overflow-x-auto rounded-xl border border-surface-secondary/60">
                    <table className="min-w-full text-sm">
                        <thead className="bg-surface-secondary/70 text-xs uppercase tracking-wide text-text-secondary">
                            <tr>
                                <th className="px-3 py-2 text-left">Admin</th>
                                <th className="px-3 py-2 text-left">Role</th>
                                <th className="px-3 py-2 text-left">Status</th>
                                <th className="px-3 py-2 text-left">Created</th>
                                <th className="px-3 py-2 text-left">Approved</th>
                                <th className="px-3 py-2 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-secondary/50">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-3 py-10 text-center text-text-secondary">
                                        Memuat data admin...
                                    </td>
                                </tr>
                            ) : admins.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-3 py-10 text-center text-text-secondary">
                                        Tidak ada data admin.
                                    </td>
                                </tr>
                            ) : (
                                admins.map((admin) => {
                                    const rowLoading = actionLoading === admin.auth_user_id;
                                    const draftRole = roleDraftMap[admin.auth_user_id] || admin.role;
                                    const cannotMutate =
                                        (admin.is_self && admin.is_last_super_admin) ||
                                        admin.is_last_super_admin === true;

                                    return (
                                        <tr key={admin.auth_user_id} className="hover:bg-surface-secondary/20 transition">
                                            <td className="px-3 py-3 align-top">
                                                <div className="font-semibold text-text-primary">{admin.full_name || '-'}</div>
                                                <div className="text-xs text-text-secondary mt-0.5">{admin.email || '-'}</div>
                                                <div className="text-[11px] text-text-secondary mt-1">{admin.auth_user_id}</div>
                                            </td>

                                            <td className="px-3 py-3 align-top">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span
                                                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${roleBadgeClass(admin.role)}`}
                                                    >
                                                        {admin.role}
                                                    </span>
                                                    <select
                                                        value={draftRole}
                                                        onChange={(e) =>
                                                            setRoleDraftMap((prev) => ({
                                                                ...prev,
                                                                [admin.auth_user_id]: e.target.value as AdminRole,
                                                            }))
                                                        }
                                                        className="rounded-lg border border-surface-secondary bg-surface-primary px-2 py-1 text-xs text-text-primary"
                                                    >
                                                        {ROLE_OPTIONS.map((role) => (
                                                            <option key={role} value={role}>
                                                                {role}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {admin.status === 'approved' && (
                                                        <button
                                                            onClick={() =>
                                                                callAdminAction({
                                                                    endpoint: '/api/admin/super-admin/admin-ops/role',
                                                                    payload: {
                                                                        auth_user_id: admin.auth_user_id,
                                                                        role: draftRole,
                                                                    },
                                                                    loadingKey: admin.auth_user_id,
                                                                    successMessage: 'Role admin berhasil diperbarui.',
                                                                })
                                                            }
                                                            disabled={rowLoading || cannotMutate || draftRole === admin.role}
                                                            className="inline-flex items-center gap-1 rounded-lg border border-surface-secondary px-2 py-1 text-xs font-semibold text-text-primary disabled:opacity-50"
                                                        >
                                                            <UserCog size={12} />
                                                            Simpan
                                                        </button>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="px-3 py-3 align-top">
                                                <span
                                                    className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(admin.status)}`}
                                                >
                                                    {admin.status}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 align-top text-text-secondary">{formatDateTime(admin.created_at)}</td>
                                            <td className="px-3 py-3 align-top text-text-secondary">{formatDateTime(admin.approved_at)}</td>
                                            <td className="px-3 py-3 align-top">
                                                <div className="flex flex-wrap justify-end gap-2">
                                                    {admin.status !== 'approved' && (
                                                        <button
                                                            onClick={() =>
                                                                callAdminAction({
                                                                    endpoint: '/api/admin/super-admin/admin-ops/approve',
                                                                    payload: {
                                                                        auth_user_id: admin.auth_user_id,
                                                                        role: draftRole,
                                                                    },
                                                                    loadingKey: admin.auth_user_id,
                                                                    successMessage: 'Admin berhasil diapprove.',
                                                                })
                                                            }
                                                            disabled={rowLoading}
                                                            className="inline-flex items-center gap-1 rounded-lg bg-action px-2 py-1 text-xs font-semibold text-text-inverse disabled:opacity-50"
                                                        >
                                                            <Shield size={12} />
                                                            Approve
                                                        </button>
                                                    )}

                                                    {admin.status === 'suspended' ? (
                                                        <button
                                                            onClick={() =>
                                                                callAdminAction({
                                                                    endpoint: '/api/admin/super-admin/admin-ops/reactivate',
                                                                    payload: {
                                                                        auth_user_id: admin.auth_user_id,
                                                                        role: draftRole,
                                                                    },
                                                                    loadingKey: admin.auth_user_id,
                                                                    successMessage: 'Admin berhasil diaktifkan kembali.',
                                                                })
                                                            }
                                                            disabled={rowLoading}
                                                            className="inline-flex items-center gap-1 rounded-lg border border-surface-secondary px-2 py-1 text-xs font-semibold text-text-primary disabled:opacity-50"
                                                        >
                                                            <RotateCcw size={12} />
                                                            Reactivate
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => {
                                                                if (!window.confirm('Suspend admin ini?')) return;
                                                                callAdminAction({
                                                                    endpoint: '/api/admin/super-admin/admin-ops/suspend',
                                                                    payload: { auth_user_id: admin.auth_user_id },
                                                                    loadingKey: admin.auth_user_id,
                                                                    successMessage: 'Admin berhasil disuspend.',
                                                                });
                                                            }}
                                                            disabled={rowLoading || cannotMutate}
                                                            className="inline-flex items-center gap-1 rounded-lg border border-status-error/40 px-2 py-1 text-xs font-semibold text-status-error disabled:opacity-50"
                                                        >
                                                            <Ban size={12} />
                                                            Suspend
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={() => {
                                                            if (!window.confirm('Hard delete admin ini? Admin akan langsung force logout.')) return;
                                                            callAdminAction({
                                                                endpoint: '/api/admin/super-admin/admin-ops/delete',
                                                                payload: { auth_user_id: admin.auth_user_id },
                                                                loadingKey: admin.auth_user_id,
                                                                successMessage: 'Admin berhasil dihapus.',
                                                            });
                                                        }}
                                                        disabled={rowLoading || cannotMutate}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-status-error/50 px-2 py-1 text-xs font-semibold text-status-error disabled:opacity-50"
                                                    >
                                                        <Trash2 size={12} />
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                    <h2 className="text-lg font-bold text-text-primary">Email Allowlist Admin</h2>
                    <div className="text-xs text-text-secondary">
                        Total allowlist: <span className="font-semibold text-text-primary">{allowlistRows.length}</span>
                    </div>
                </div>

                {allowlistError && (
                    <div className="mb-4 rounded-lg border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error">
                        {allowlistError}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <input
                        type="email"
                        value={allowlistEmailInput}
                        onChange={(e) => setAllowlistEmailInput(e.target.value)}
                        placeholder="email@contoh.com"
                        className="rounded-xl border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                    />
                    <input
                        type="text"
                        value={allowlistNoteInput}
                        onChange={(e) => setAllowlistNoteInput(e.target.value)}
                        placeholder="Catatan (opsional)"
                        className="rounded-xl border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                    />
                    <button
                        onClick={handleAllowlistSave}
                        disabled={allowlistActionLoading}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-action px-3 py-2 text-sm font-semibold text-text-inverse transition hover:brightness-105 disabled:opacity-50"
                    >
                        <Plus size={16} />
                        Tambah / Update
                    </button>
                </div>

                <div className="mb-3 relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                    <input
                        type="text"
                        value={allowlistSearch}
                        onChange={(e) => setAllowlistSearch(e.target.value)}
                        placeholder="Cari email allowlist..."
                        className="w-full rounded-xl border border-surface-secondary bg-surface-primary pl-9 pr-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                    />
                </div>

                <div className="overflow-x-auto rounded-xl border border-surface-secondary/60">
                    <table className="min-w-full text-sm">
                        <thead className="bg-surface-secondary/70 text-xs uppercase tracking-wide text-text-secondary">
                            <tr>
                                <th className="px-3 py-2 text-left">Email</th>
                                <th className="px-3 py-2 text-left">Catatan</th>
                                <th className="px-3 py-2 text-left">Updated</th>
                                <th className="px-3 py-2 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-secondary/50">
                            {allowlistLoading ? (
                                <tr>
                                    <td colSpan={4} className="px-3 py-8 text-center text-text-secondary">
                                        Memuat allowlist...
                                    </td>
                                </tr>
                            ) : allowlistRows.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-3 py-8 text-center text-text-secondary">
                                        Belum ada email allowlist.
                                    </td>
                                </tr>
                            ) : (
                                allowlistRows.map((row) => (
                                    <tr key={row.email} className="hover:bg-surface-secondary/20 transition">
                                        <td className="px-3 py-2 text-text-primary font-medium">{row.email}</td>
                                        <td className="px-3 py-2 text-text-secondary">{row.note || '-'}</td>
                                        <td className="px-3 py-2 text-text-secondary">{formatDateTime(row.updated_at || row.added_at)}</td>
                                        <td className="px-3 py-2 text-right">
                                            <button
                                                onClick={() => handleAllowlistDelete(row.email)}
                                                disabled={allowlistActionLoading}
                                                className="inline-flex items-center gap-1 rounded-lg border border-status-error/50 px-2 py-1 text-xs font-semibold text-status-error transition hover:bg-status-error/10 disabled:opacity-50"
                                            >
                                                <Trash2 size={12} />
                                                Hapus
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
