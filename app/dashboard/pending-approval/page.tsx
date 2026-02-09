'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function PendingApprovalPage() {
    const router = useRouter();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
            <div className="max-w-md space-y-4 rounded-xl border border-gray-200 bg-white p-8 shadow-lg dark:border-gray-800 dark:bg-gray-900">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 ring-8 ring-yellow-50 dark:bg-yellow-900/20 dark:ring-yellow-900/10">
                    <svg className="h-6 w-6 text-yellow-600 dark:text-yellow-500" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>

                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Menunggu Persetujuan Admin
                </h1>

                <p className="text-gray-500 dark:text-gray-400">
                    Akun Anda sedang dalam proses verifikasi oleh Super Admin.
                    Silakan cek kembali secara berkala atau hubungi administrator jika butuh bantuan.
                </p>

                <div className="pt-4">
                    <button
                        onClick={handleLogout}
                        className="text-sm font-medium text-red-600 hover:text-red-500 dark:text-red-400"
                    >
                        Keluar (Logout)
                    </button>
                </div>
            </div>
        </div>
    );
}
