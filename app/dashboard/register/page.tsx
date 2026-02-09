'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient'; // Ensure this path is correct based on project structure

export default function RegisterAdminPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [emailVerified, setEmailVerified] = useState(false);
    const [fullName, setFullName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await fetch('/api/admin/me');
                if (res.status === 401) {
                    router.push('/dashboard/login');
                    return;
                }
                const data = await res.json();

                if (!data.emailVerified) {
                    setEmailVerified(false);
                    setLoading(false);
                    return;
                }
                setEmailVerified(true);

                // If user is already an admin
                if (data.adminExists) {
                    if (data.status === 'approved') {
                        router.push('/dashboard');
                    } else {
                        // pending_approval or suspended
                        router.push('/dashboard/pending-approval');
                    }
                    return;
                }

                // Pre-fill full_name if available
                if (data.full_name && data.full_name !== 'Admin') {
                    setFullName(data.full_name);
                }

                setLoading(false);
            } catch (err) {
                console.error(err);
                setError('Gagal memuat status user.');
                setLoading(false);
            }
        };
        checkStatus();
    }, [router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            const res = await fetch('/api/admin/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_name: fullName }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.message || 'Gagal registrasi');
            }

            // Redirect to pending approval after success
            router.push('/dashboard/pending-approval');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Gagal registrasi';
            setError(message);
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
            </div>
        );
    }

    if (!emailVerified) {
        return (
            <div className="flex h-screen flex-col items-center justify-center p-4 text-center bg-gray-50 dark:bg-gray-900">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Verifikasi Email Diperlukan</h1>
                <p className="mt-2 text-gray-600 dark:text-gray-300">
                    Silakan verifikasi email Anda sebelum mendaftar sebagai Admin Ops.
                </p>
                <button
                    onClick={async () => {
                        await supabase.auth.signOut();
                        router.push('/login');
                    }}
                    className="mt-4 rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                >
                    Logout
                </button>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-900">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-md dark:bg-gray-800">
                <h1 className="mb-6 text-center text-2xl font-bold text-gray-900 dark:text-white">
                    Registrasi Admin Ops
                </h1>

                {error && (
                    <div className="mb-4 rounded bg-red-100 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Nama Lengkap (Full Name)
                        </label>
                        <input
                            id="fullName"
                            type="text"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                            placeholder="Masukkan nama lengkap Anda"
                        />
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Dengan mendaftar, akun Anda akan berstatus <strong>Pending Approval</strong> sampai disetujui oleh Super Admin.
                    </p>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-blue-400"
                    >
                        {submitting ? 'Mengirim...' : 'Kirim Permintaan'}
                    </button>
                </form>
            </div>
        </div>
    );
}
