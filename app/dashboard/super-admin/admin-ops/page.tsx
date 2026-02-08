'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface AdminUser {
    id: string;
    auth_user_id: string;
    email: string;
    full_name: string;
    status: 'pending_approval' | 'approved' | 'suspended';
    created_at: string;
}

export default function AdminOpsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [admins, setAdmins] = useState<AdminUser[]>([]);
    const [statusFilter, setStatusFilter] = useState<'pending_approval' | 'approved' | 'suspended' | 'all'>('pending_approval');
    const [actionLoading, setActionLoading] = useState<string | null>(null); // storing ID being acted on

    const fetchAdmins = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/super-admin/admin-ops?status=${statusFilter}`);
            if (res.status === 403 || res.status === 401) {
                // Not authorized or not logged in
                setError('Akses Ditolak. Halaman ini hanya untuk Super Admin.');
                setLoading(false);
                return;
            }
            if (!res.ok) {
                throw new Error('Gagal mengambil data admin');
            }
            const json = await res.json();
            setAdmins(json.data || []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAdmins();
    }, [statusFilter]);

    const handleApprove = async (auth_user_id: string) => {
        if (!confirm('Approve admin ini?')) return;
        setActionLoading(auth_user_id);
        try {
            const res = await fetch('/api/admin/super-admin/admin-ops/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ auth_user_id }),
            });
            if (!res.ok) throw new Error('Gagal approve');
            fetchAdmins(); // Refresh
        } catch (err: any) {
            alert(err.message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleSuspend = async (auth_user_id: string) => {
        if (!confirm('Suspend admin ini?')) return;
        setActionLoading(auth_user_id);
        try {
            const res = await fetch('/api/admin/super-admin/admin-ops/suspend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ auth_user_id }),
            });
            if (!res.ok) throw new Error('Gagal suspend');
            fetchAdmins(); // Refresh
        } catch (err: any) {
            alert(err.message);
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className="p-6">
            <h1 className="mb-6 text-2xl font-bold dark:text-white">Manajemen Admin Ops</h1>

            {/* Filters */}
            <div className="mb-6 flex space-x-2">
                {(['pending_approval', 'approved', 'suspended', 'all'] as const).map((status) => (
                    <button
                        key={status}
                        onClick={() => setStatusFilter(status)}
                        className={`rounded px-4 py-2 text-sm font-medium transition-colors ${statusFilter === status
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                            }`}
                    >
                        {status === 'all' ? 'Semua' : status.replace('_', ' ').toUpperCase()}
                    </button>
                ))}
            </div>

            {error && (
                <div className="mb-4 rounded bg-red-100 p-4 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="py-10 text-center">Loading...</div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-gray-200 shadow dark:border-gray-700">
                    <table className="min-w-full divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Email</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Registered</th>
                                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {admins.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                                        Tidak ada data admin.
                                    </td>
                                </tr>
                            ) : (
                                admins.map((admin) => (
                                    <tr key={admin.id}>
                                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                                            {admin.full_name || '-'}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                            {admin.email}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-sm">
                                            <span
                                                className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${admin.status === 'approved'
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                                    : admin.status === 'suspended'
                                                        ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                                                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                                                    }`}
                                            >
                                                {admin.status}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(admin.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                                            {admin.status !== 'approved' && (
                                                <button
                                                    onClick={() => handleApprove(admin.auth_user_id)}
                                                    disabled={actionLoading === admin.auth_user_id}
                                                    className="mr-2 text-blue-600 hover:text-blue-900 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
                                                >
                                                    Approve
                                                </button>
                                            )}
                                            {admin.status !== 'suspended' && (
                                                <button
                                                    onClick={() => handleSuspend(admin.auth_user_id)}
                                                    disabled={actionLoading === admin.auth_user_id}
                                                    className="text-red-600 hover:text-red-900 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                                                >
                                                    Suspend
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
