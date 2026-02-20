'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

interface AdminMeStatus {
    isAuthenticated: boolean;
    emailVerified: boolean;
    adminExists: boolean;
    role: string | null;
    status: string | null;
    full_name: string;
}

export default function DashboardGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const isBypassPath =
        pathname === '/dashboard/login' ||
        pathname === '/dashboard/register' ||
        pathname === '/dashboard/pending-approval';
    const isSuperAdminRoute = pathname.startsWith('/dashboard/super-admin');
    const [loading, setLoading] = useState(true);
    const [errorState, setErrorState] = useState<
        'unauthorized' | 'unverified' | 'not_admin' | 'suspended' | null
    >(null);

    useEffect(() => {
        // Skip guard for login/register/pending pages to avoid loops
        if (isBypassPath) return;

        let isMounted = true;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        const checkAdminStatus = async () => {
            try {
                const res = await fetch('/api/admin/me', {
                    method: 'GET',
                    cache: 'no-store',
                    credentials: 'same-origin',
                    headers: {
                        accept: 'application/json',
                    },
                });

                if (res.status === 401) {
                    // Not authenticated at all
                    if (!isMounted) return;
                    setErrorState('unauthorized');
                    router.push('/dashboard/login');
                    return;
                }

                if (!res.ok) {
                    throw new Error(`Admin status request failed (${res.status})`);
                }

                const data: AdminMeStatus = await res.json();
                if (!isMounted) return;

                // 1. Check Authentication logic (handled by 401 above usually, but double check)
                if (!data.isAuthenticated) {
                    setErrorState('unauthorized');
                    router.push('/dashboard/login');
                    return;
                }



                // 2. Check Email Verification
                if (!data.emailVerified) {
                    setErrorState('unverified');
                    // We can show inline UI or redirect.
                    // User requirement: "tampilkan instruksi verifikasi email"
                    setLoading(false);
                    return;
                }

                // 3. Check Admin Existence
                if (!data.adminExists) {
                    // Not an admin row yet -> Redirect to registration
                    setErrorState('not_admin');
                    router.replace('/dashboard/register');
                    return;
                }

                if (isSuperAdminRoute && data.role !== 'super_admin') {
                    router.replace('/dashboard');
                    return;
                }

                // 4. Check Pending Approval
                if (data.status === 'pending_approval') {
                    router.push('/dashboard/pending-approval');
                    return;
                }

                // 5. Check Suspended
                if (data.status === 'suspended') {
                    setErrorState('suspended');
                    setLoading(false);
                    return;
                }

                // 6. Approved -> Allow
                if (data.status === 'approved') {
                    setLoading(false);
                } else {
                    // Fallback for unknown status
                    setErrorState('suspended'); // Treat as suspended/invalid
                    setLoading(false);
                }

            } catch (err) {
                console.error('Admin Guard Error:', err);
                if (!isMounted) return;

                setLoading(false);
                retryTimer = setTimeout(() => {
                    if (isMounted) checkAdminStatus();
                }, 3000);
            }
        };

        checkAdminStatus();
        const interval = setInterval(checkAdminStatus, 60 * 1000);

        return () => {
            isMounted = false;
            if (retryTimer) {
                clearTimeout(retryTimer);
            }
            clearInterval(interval);
        };
    }, [isBypassPath, isSuperAdminRoute, router]);

    if (isBypassPath) {
        return <>{children}</>;
    }

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
            </div>
        );
    }

    // Render Error States
    if (errorState === 'unverified') {
        return (
            <div className="flex h-screen flex-col items-center justify-center p-4 text-center">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Verifikasi Email Diperlukan</h1>
                <p className="mt-2 text-gray-600 dark:text-gray-300">
                    Silakan periksa kotak masuk email Anda untuk memverifikasi akun sebelum mengakses dashboard.
                </p>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-4 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                    Sudah Verifikasi? Refresh
                </button>
            </div>
        );
    }

    if (errorState === 'not_admin') {
        return (
            <div className="flex h-screen flex-col items-center justify-center p-4 text-center">
                <h1 className="text-2xl font-bold text-red-600">Akses Ditolak</h1>
                <p className="mt-2 text-gray-600 dark:text-gray-300">
                    Akun Anda terdaftar, tetapi tidak memiliki akses Admin Dashboard.
                </p>
                <button onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }}
                    className="mt-4 text-sm text-red-600 underline">
                    Logout
                </button>
            </div>
        );
    }

    if (errorState === 'suspended') {
        return (
            <div className="flex h-screen flex-col items-center justify-center p-4 text-center">
                <h1 className="text-2xl font-bold text-red-600">Akun Dinonaktifkan</h1>
                <p className="mt-2 text-gray-600 dark:text-gray-300">
                    Akun admin Anda telah ditangguhkan. Silakan hubungi Super Admin.
                </p>
                <button onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }}
                    className="mt-4 text-sm text-red-600 underline">
                    Logout
                </button>
            </div>
        );
    }

    // Authenticated & Approved
    return <>{children}</>;
}
