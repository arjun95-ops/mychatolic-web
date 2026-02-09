'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter, useSearchParams } from 'next/navigation';
import { Toaster, toast } from 'react-hot-toast';

type DesiredRole = 'admin_ops' | 'super_admin';

function resolveDesiredRole(raw: string | null): DesiredRole {
    return raw === 'super_admin' ? 'super_admin' : 'admin_ops';
}

export default function RegisterPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState<{ email: string; desiredRole: DesiredRole } | null>(null);
    const [desiredRole, setDesiredRole] = useState<DesiredRole>(() =>
        resolveDesiredRole(searchParams.get('role'))
    );

    const roleHelperText = useMemo(() => {
        if (desiredRole === 'super_admin') {
            return 'Pengajuan Super Admin tidak aktif otomatis. Anda tetap perlu approval, lalu dipromosikan oleh Super Admin existing.';
        }
        return 'Pengajuan Admin Ops butuh approval Super Admin setelah Anda login dan kirim permintaan admin.';
    }, [desiredRole]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();

        const normalizedEmail = email.trim().toLowerCase();
        const normalizedName = fullName.trim();

        if (!normalizedName) {
            toast.error('Nama lengkap wajib diisi.');
            return;
        }
        if (!normalizedEmail) {
            toast.error('Email wajib diisi.');
            return;
        }
        if (password.length < 6) {
            toast.error('Password minimal 6 karakter.');
            return;
        }
        if (password !== confirmPassword) {
            toast.error('Konfirmasi password tidak cocok.');
            return;
        }

        setLoading(true);

        const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        try {
            const { data, error } = await supabase.auth.signUp({
                email: normalizedEmail,
                password,
                options: {
                    data: {
                        full_name: normalizedName,
                        requested_admin_role: desiredRole,
                    },
                    emailRedirectTo:
                        typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
                },
            });

            if (error) {
                toast.error(error.message);
                return;
            }

            setSubmitted({ email: normalizedEmail, desiredRole });

            if (!data.session) {
                toast.success('Akun dibuat. Silakan cek email untuk verifikasi lalu login.');
                return;
            }

            toast.success('Akun berhasil dibuat. Lanjut ke form permintaan admin.');
            router.push('/dashboard/register');
        } catch {
            toast.error('Terjadi kesalahan saat membuat akun.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-surface-secondary flex items-center justify-center p-4">
            <Toaster position="top-center" />

            <div className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-8 shadow-xl">
                <div className="mb-7 text-center">
                    <h1 className="mb-2 text-3xl font-bold text-brand-primary">Register Admin Account</h1>
                    <p className="text-sm text-text-secondary">
                        Buat akun dulu, lalu lanjutkan pengajuan role admin di dashboard.
                    </p>
                </div>

                {submitted && (
                    <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                        <p className="font-semibold">Akun berhasil dibuat untuk {submitted.email}.</p>
                        <p className="mt-1">
                            Langkah selanjutnya: verifikasi email, login, lalu kirim permintaan admin.
                        </p>
                        {submitted.desiredRole === 'super_admin' && (
                            <p className="mt-1">
                                Untuk role Super Admin, approval akhir tetap dari Super Admin existing atau bootstrap awal.
                            </p>
                        )}
                    </div>
                )}

                <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-text-primary">Nama Lengkap</label>
                        <input
                            type="text"
                            required
                            className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                            placeholder="Nama lengkap"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium text-text-primary">Email</label>
                        <input
                            type="email"
                            required
                            className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                            placeholder="admin@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium text-text-primary">Role Yang Diajukan</label>
                        <select
                            value={desiredRole}
                            onChange={(e) => setDesiredRole(resolveDesiredRole(e.target.value))}
                            className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                        >
                            <option value="admin_ops">Admin Ops</option>
                            <option value="super_admin">Super Admin</option>
                        </select>
                        <p className="mt-2 text-xs text-text-secondary">{roleHelperText}</p>
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium text-text-primary">Password</label>
                        <input
                            type="password"
                            required
                            minLength={6}
                            className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                            placeholder="Minimal 6 karakter"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium text-text-primary">Konfirmasi Password</label>
                        <input
                            type="password"
                            required
                            minLength={6}
                            className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                            placeholder="Ulangi password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-lg bg-brand-primary py-3 font-bold text-white transition hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading ? 'Memproses...' : 'Buat Akun'}
                    </button>
                </form>

                <div className="mt-5 text-center text-sm text-text-secondary">
                    Sudah punya akun?{' '}
                    <Link href="/login" className="font-semibold text-brand-primary hover:underline">
                        Kembali ke Login
                    </Link>
                </div>
            </div>
        </div>
    );
}
