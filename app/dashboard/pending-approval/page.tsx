'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type AdminMeResponse = {
    isAuthenticated: boolean;
    emailVerified: boolean;
    adminExists: boolean;
    role: string | null;
    status: string | null;
    full_name: string;
    email: string | null;
};

function formatRole(role?: string | null): string {
    if (role === 'super_admin') return 'Super Admin';
    if (role === 'admin_ops') return 'Admin Ops';
    return role || '-';
}

function formatStatus(status?: string | null): string {
    if (status === 'pending_approval') return 'Pending Approval';
    if (status === 'approved') return 'Approved';
    if (status === 'suspended') return 'Suspended';
    return '-';
}

function statusBadgeClass(status?: string | null): string {
    if (status === 'pending_approval') {
        return 'border-yellow-300 bg-yellow-100 text-yellow-700 dark:border-yellow-800/70 dark:bg-yellow-900/30 dark:text-yellow-300';
    }
    if (status === 'suspended') {
        return 'border-red-300 bg-red-100 text-red-700 dark:border-red-900/70 dark:bg-red-900/30 dark:text-red-300';
    }
    if (status === 'approved') {
        return 'border-green-300 bg-green-100 text-green-700 dark:border-green-900/70 dark:bg-green-900/30 dark:text-green-300';
    }
    return 'border-gray-300 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200';
}

export default function PendingApprovalPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [account, setAccount] = useState<AdminMeResponse | null>(null);

    useEffect(() => {
        let cancelled = false;

        const loadAccountStatus = async () => {
            try {
                setLoading(true);
                setError(null);

                const res = await fetch('/api/admin/me', { cache: 'no-store' });
                if (res.status === 401) {
                    router.replace('/dashboard/login');
                    return;
                }

                const json = await res.json().catch(() => ({}));
                if (!res.ok) {
                    const message =
                        json && typeof json === 'object' && 'message' in json && typeof json.message === 'string'
                            ? json.message
                            : 'Gagal memuat status admin.';
                    throw new Error(message);
                }

                if (cancelled) return;

                const nextAccount: AdminMeResponse = {
                    isAuthenticated: Boolean(json.isAuthenticated),
                    emailVerified: Boolean(json.emailVerified),
                    adminExists: Boolean(json.adminExists),
                    role: typeof json.role === 'string' ? json.role : null,
                    status: typeof json.status === 'string' ? json.status : null,
                    full_name:
                        typeof json.full_name === 'string' && json.full_name.trim() ? json.full_name : 'Admin',
                    email: typeof json.email === 'string' ? json.email : null,
                };

                if (!nextAccount.isAuthenticated) {
                    router.replace('/dashboard/login');
                    return;
                }

                if (nextAccount.adminExists && nextAccount.status === 'approved') {
                    router.replace('/dashboard');
                    return;
                }

                setAccount(nextAccount);
            } catch (err: unknown) {
                if (cancelled) return;
                const message = err instanceof Error ? err.message : 'Gagal memuat status admin.';
                setError(message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadAccountStatus();
        return () => {
            cancelled = true;
        };
    }, [router]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const statusDescription = useMemo(() => {
        if (!account) return 'Memuat status permintaan admin Anda.';
        if (!account.emailVerified) {
            return 'Email Anda belum diverifikasi. Verifikasi email diperlukan agar proses admin dapat dilanjutkan.';
        }
        if (!account.adminExists) {
            return 'Akun Anda belum mengirim permintaan Admin Ops. Silakan lanjutkan registrasi admin.';
        }
        if (account.status === 'pending_approval') {
            return 'Permintaan Anda sedang menunggu persetujuan Super Admin.';
        }
        if (account.status === 'suspended') {
            return 'Akun admin Anda sedang ditangguhkan. Hubungi Super Admin untuk reaktivasi.';
        }
        return 'Status akun admin Anda sedang diproses.';
    }, [account]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-900">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-900">
            <div className="w-full max-w-xl space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Status Permintaan Admin</h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{statusDescription}</p>
                    </div>
                    <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
                            account?.status
                        )}`}
                    >
                        {account?.adminExists ? formatStatus(account?.status) : 'Belum Mengajukan'}
                    </span>
                </div>

                {error && (
                    <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300">
                        {error}
                    </div>
                )}

                <div className="rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="grid grid-cols-1 sm:grid-cols-2">
                        <div className="border-b border-gray-200 px-4 py-3 text-sm dark:border-gray-700">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Nama</p>
                            <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{account?.full_name || '-'}</p>
                        </div>
                        <div className="border-b border-gray-200 px-4 py-3 text-sm dark:border-gray-700">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Email</p>
                            <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{account?.email || '-'}</p>
                        </div>
                        <div className="border-b border-gray-200 px-4 py-3 text-sm dark:border-gray-700 sm:border-b-0">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Role</p>
                            <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{formatRole(account?.role)}</p>
                        </div>
                        <div className="px-4 py-3 text-sm">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Status</p>
                            <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{formatStatus(account?.status)}</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    {!account?.adminExists && (
                        <Link
                            href="/dashboard/register"
                            className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-300"
                        >
                            Ke Registrasi Admin Ops
                        </Link>
                    )}
                    <button
                        onClick={() => window.location.reload()}
                        className="rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                        Refresh Status
                    </button>
                    <button
                        onClick={handleLogout}
                        className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
                    >
                        Keluar (Logout)
                    </button>
                </div>
            </div>
        </div>
    );
}
