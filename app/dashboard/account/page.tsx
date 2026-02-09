'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle,
    Camera,
    CheckCircle2,
    Eye,
    EyeOff,
    KeyRound,
    Save,
    ShieldCheck,
    Trash2,
    Upload,
    UserCircle2,
} from 'lucide-react';

type AccountData = {
    id: string;
    email: string;
    full_name: string;
    avatar_url: string | null;
    role: string | null;
    status: string | null;
    updated_at: string | null;
};

type Notice = {
    type: 'success' | 'error';
    message: string;
} | null;

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_MAX_MB = 2;
const AVATAR_MIN_DIMENSION = 256;
const AVATAR_MAX_DIMENSION = 2048;
const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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

async function readImageDimensions(file: File): Promise<{ width: number; height: number; previewUrl: string }> {
    const previewUrl = URL.createObjectURL(file);

    try {
        const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                resolve({
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                });
            };
            img.onerror = () => reject(new Error('File gambar tidak valid.'));
            img.src = previewUrl;
        });

        return {
            ...dimensions,
            previewUrl,
        };
    } catch (error) {
        URL.revokeObjectURL(previewUrl);
        throw error;
    }
}

function passwordStrength(value: string): { score: number; label: string; color: string } {
    let score = 0;
    if (value.length >= 8) score += 1;
    if (/[A-Z]/.test(value)) score += 1;
    if (/[0-9]/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;

    if (score <= 1) return { score, label: 'Lemah', color: 'bg-status-error' };
    if (score === 2) return { score, label: 'Sedang', color: 'bg-status-pending' };
    if (score === 3) return { score, label: 'Bagus', color: 'bg-action' };
    return { score, label: 'Sangat Kuat', color: 'bg-status-success' };
}

function formatRoleLabel(role?: string | null): string {
    if (role === 'super_admin') return 'Super Admin';
    if (role === 'admin_ops') return 'Admin Ops';
    return role || '-';
}

function formatStatusLabel(status?: string | null): string {
    if (status === 'approved') return 'Approved';
    if (status === 'pending_approval') return 'Pending Approval';
    if (status === 'suspended') return 'Suspended';
    return status || '-';
}

function statusBadgeClass(status?: string | null): string {
    if (status === 'approved') return 'border-status-success/30 bg-status-success/10 text-status-success';
    if (status === 'suspended') return 'border-status-error/30 bg-status-error/10 text-status-error';
    return 'border-status-pending/30 bg-status-pending/10 text-status-pending';
}

export default function DashboardAccountPage() {
    const [loading, setLoading] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);
    const [notice, setNotice] = useState<Notice>(null);
    const [account, setAccount] = useState<AccountData | null>(null);

    const [fullName, setFullName] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);

    const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
    const [selectedAvatarPreview, setSelectedAvatarPreview] = useState<string | null>(null);
    const [selectedAvatarInfo, setSelectedAvatarInfo] = useState<string>('');
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [deletingAvatar, setDeletingAvatar] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);

    const strength = useMemo(() => passwordStrength(newPassword), [newPassword]);
    const hasPendingAvatarChange = Boolean(selectedAvatarFile);

    useEffect(() => {
        return () => {
            if (selectedAvatarPreview) {
                URL.revokeObjectURL(selectedAvatarPreview);
            }
        };
    }, [selectedAvatarPreview]);

    useEffect(() => {
        if (!hasPendingAvatarChange) return;
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasPendingAvatarChange]);

    const showNotice = (type: 'success' | 'error', message: string) => {
        setNotice({ type, message });
    };

    const resetSelectedAvatar = () => {
        setSelectedAvatarFile(null);
        setSelectedAvatarInfo('');
        if (selectedAvatarPreview) {
            URL.revokeObjectURL(selectedAvatarPreview);
        }
        setSelectedAvatarPreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const fetchAccount = async () => {
        setLoading(true);
        setPageError(null);
        try {
            const res = await fetch('/api/admin/account', { cache: 'no-store' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal memuat data akun.'));

            const data = (json.data || null) as AccountData | null;
            setAccount(data);
            setFullName(data?.full_name || '');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Gagal memuat data akun.';
            setPageError(message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAccount();
    }, []);

    const handleSaveProfile = async () => {
        if (!fullName.trim()) {
            showNotice('error', 'Nama lengkap wajib diisi.');
            return;
        }

        setSavingProfile(true);
        setNotice(null);
        try {
            const res = await fetch('/api/admin/account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    full_name: fullName.trim(),
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal menyimpan profil.'));

            showNotice('success', 'Nama profil berhasil diperbarui.');
            await fetchAccount();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Gagal menyimpan profil.';
            showNotice('error', message);
        } finally {
            setSavingProfile(false);
        }
    };

    const handleSelectAvatar = async (file: File | null) => {
        if (!file) return;

        if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
            showNotice('error', 'Format gambar harus JPG, PNG, atau WEBP.');
            return;
        }

        if (file.size > AVATAR_MAX_BYTES) {
            showNotice('error', `Ukuran avatar maksimal ${AVATAR_MAX_MB} MB.`);
            return;
        }

        try {
            const { width, height, previewUrl } = await readImageDimensions(file);

            if (width < AVATAR_MIN_DIMENSION || height < AVATAR_MIN_DIMENSION) {
                URL.revokeObjectURL(previewUrl);
                showNotice(
                    'error',
                    `Resolusi minimal avatar ${AVATAR_MIN_DIMENSION} x ${AVATAR_MIN_DIMENSION}px.`
                );
                return;
            }

            if (width > AVATAR_MAX_DIMENSION || height > AVATAR_MAX_DIMENSION) {
                URL.revokeObjectURL(previewUrl);
                showNotice(
                    'error',
                    `Resolusi maksimal avatar ${AVATAR_MAX_DIMENSION} x ${AVATAR_MAX_DIMENSION}px.`
                );
                return;
            }

            if (Math.abs(width - height) > 5) {
                URL.revokeObjectURL(previewUrl);
                showNotice('error', 'Avatar harus rasio 1:1 (persegi), contoh 512x512.');
                return;
            }

            resetSelectedAvatar();
            setSelectedAvatarFile(file);
            setSelectedAvatarPreview(previewUrl);
            setSelectedAvatarInfo(
                `${width}x${height}px · ${(file.size / 1024 / 1024).toFixed(2)} MB · ${file.type}`
            );
            showNotice('success', 'File avatar siap diupload.');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Gagal membaca file gambar.';
            showNotice('error', message);
        }
    };

    const handleUploadAvatar = async () => {
        if (!selectedAvatarFile) {
            showNotice('error', 'Pilih file avatar terlebih dahulu.');
            return;
        }

        setUploadingAvatar(true);
        setNotice(null);
        try {
            const formData = new FormData();
            formData.append('file', selectedAvatarFile);

            const res = await fetch('/api/admin/account/avatar', {
                method: 'POST',
                body: formData,
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal upload avatar.'));

            resetSelectedAvatar();
            await fetchAccount();
            showNotice('success', 'Foto profil berhasil diupload.');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Gagal upload avatar.';
            showNotice('error', message);
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleDeleteAvatar = async () => {
        if (!account?.avatar_url && !selectedAvatarFile) return;
        if (!window.confirm('Hapus foto profil saat ini?')) return;

        setDeletingAvatar(true);
        setNotice(null);
        try {
            const res = await fetch('/api/admin/account/avatar', {
                method: 'DELETE',
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal menghapus avatar.'));

            resetSelectedAvatar();
            await fetchAccount();
            showNotice('success', 'Foto profil berhasil dihapus.');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Gagal menghapus avatar.';
            showNotice('error', message);
        } finally {
            setDeletingAvatar(false);
        }
    };

    const handleChangePassword = async () => {
        if (newPassword.length < 8) {
            showNotice('error', 'Password minimal 8 karakter.');
            return;
        }

        if (newPassword !== confirmPassword) {
            showNotice('error', 'Konfirmasi password tidak sama.');
            return;
        }

        setSavingPassword(true);
        setNotice(null);
        try {
            const res = await fetch('/api/admin/account/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    new_password: newPassword,
                    confirm_password: confirmPassword,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal mengubah password.'));

            setNewPassword('');
            setConfirmPassword('');
            setShowNewPassword(false);
            setShowConfirmPassword(false);
            showNotice('success', 'Password berhasil diubah.');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Gagal mengubah password.';
            showNotice('error', message);
        } finally {
            setSavingPassword(false);
        }
    };

    const handleDropAvatar = async (event: React.DragEvent<HTMLButtonElement>) => {
        event.preventDefault();
        setIsDragOver(false);
        const file = event.dataTransfer.files?.[0] || null;
        await handleSelectAvatar(file);
    };

    const avatarPreview = selectedAvatarPreview || account?.avatar_url || '';
    const fallbackInitial = (fullName || account?.full_name || account?.email || 'A').charAt(0).toUpperCase();
    const passwordMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
    const passwordChecks = [
        { label: 'Minimal 8 karakter', ok: newPassword.length >= 8 },
        { label: 'Mengandung huruf besar', ok: /[A-Z]/.test(newPassword) },
        { label: 'Mengandung angka', ok: /[0-9]/.test(newPassword) },
        { label: 'Mengandung simbol', ok: /[^A-Za-z0-9]/.test(newPassword) },
    ];

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-surface-secondary/80 bg-gradient-to-r from-surface-primary via-surface-primary to-action/5 p-6 shadow-sm">
                <h1 className="text-2xl font-bold text-text-primary">Akun Saya</h1>
                <p className="mt-1 text-sm text-text-secondary">
                    Kelola profil dashboard, upload foto profil, dan ubah password dengan aman.
                </p>
            </div>

            {pageError && (
                <div className="rounded-xl border border-status-error/40 bg-status-error/10 px-4 py-3 text-sm text-status-error">
                    {pageError}
                </div>
            )}

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

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="rounded-2xl border border-surface-secondary/70 bg-surface-primary p-6 shadow-sm xl:col-span-1">
                    {loading ? (
                        <div className="text-sm text-text-secondary">Memuat data akun...</div>
                    ) : (
                        <div className="space-y-5">
                            <div className="mx-auto h-28 w-28 rounded-full bg-surface-secondary overflow-hidden border-4 border-surface-primary ring-2 ring-action/20 flex items-center justify-center">
                                {avatarPreview ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={avatarPreview}
                                        alt={account?.full_name || 'Admin'}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <span className="text-3xl font-bold text-text-primary">{fallbackInitial}</span>
                                )}
                            </div>
                            {hasPendingAvatarChange && (
                                <p className="text-center text-xs font-semibold text-status-pending">
                                    Foto baru belum disimpan
                                </p>
                            )}

                            <div className="text-center">
                                <div className="font-semibold text-text-primary">{account?.full_name || '-'}</div>
                                <div className="text-sm text-text-secondary">{account?.email || '-'}</div>
                            </div>

                            <div className="rounded-xl border border-surface-secondary/60 bg-surface-secondary/20 p-3 text-xs space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-text-secondary">Role</span>
                                    <span
                                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${account?.role === 'super_admin'
                                                ? 'border-brand-primary/30 bg-brand-primary/10 text-brand-primary'
                                                : 'border-action/30 bg-action/10 text-action'
                                            }`}
                                    >
                                        {formatRoleLabel(account?.role)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-text-secondary">Status</span>
                                    <span
                                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(
                                            account?.status
                                        )}`}
                                    >
                                        {formatStatusLabel(account?.status)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-text-secondary">Update</span>
                                    <span className="font-semibold text-text-primary">{formatDateTime(account?.updated_at)}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="rounded-2xl border border-surface-secondary/70 bg-surface-primary p-6 shadow-sm xl:col-span-2 space-y-8">
                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <UserCircle2 size={18} className="text-action" />
                            <h2 className="text-lg font-bold text-text-primary">Profil</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-text-secondary">Nama Lengkap</label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="w-full rounded-xl border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                                    placeholder="Nama akun dashboard"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-text-secondary">Email</label>
                                <input
                                    type="email"
                                    value={account?.email || ''}
                                    disabled
                                    className="w-full rounded-xl border border-surface-secondary bg-surface-secondary/40 px-3 py-2 text-sm text-text-secondary"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleSaveProfile}
                            disabled={savingProfile || loading}
                            className="inline-flex items-center gap-2 rounded-xl bg-action px-4 py-2 text-sm font-semibold text-text-inverse transition hover:brightness-105 disabled:opacity-50"
                        >
                            <Save size={16} />
                            {savingProfile ? 'Menyimpan...' : 'Simpan Nama Profil'}
                        </button>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Camera size={18} className="text-action" />
                            <h2 className="text-lg font-bold text-text-primary">Foto Profil</h2>
                        </div>

                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(event) => {
                                event.preventDefault();
                                setIsDragOver(true);
                            }}
                            onDragLeave={() => setIsDragOver(false)}
                            onDrop={handleDropAvatar}
                            className={`w-full rounded-2xl border-2 border-dashed p-5 text-left transition ${
                                isDragOver
                                    ? 'border-action bg-action/10'
                                    : 'border-surface-secondary bg-surface-secondary/10 hover:border-action/60'
                            }`}
                        >
                            <div className="flex flex-col md:flex-row md:items-center gap-3">
                                <div className="h-11 w-11 rounded-full bg-action/15 text-action flex items-center justify-center">
                                    <Upload size={18} />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-text-primary">Klik atau drag file ke sini</p>
                                    <p className="text-xs text-text-secondary">
                                        JPG/PNG/WEBP, maks {AVATAR_MAX_MB}MB, resolusi min {AVATAR_MIN_DIMENSION}px, max {AVATAR_MAX_DIMENSION}px, rasio 1:1
                                    </p>
                                </div>
                            </div>
                        </button>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => handleSelectAvatar(e.target.files?.[0] || null)}
                            className="hidden"
                        />

                        {selectedAvatarInfo && (
                            <p className="rounded-xl border border-surface-secondary/60 bg-surface-secondary/10 px-3 py-2 text-xs text-text-secondary">
                                File terpilih: <span className="font-semibold text-text-primary">{selectedAvatarInfo}</span>
                            </p>
                        )}
                        {hasPendingAvatarChange && (
                            <p className="text-xs text-status-pending">
                                Klik <span className="font-semibold">Simpan Foto</span> agar perubahan tetap ada setelah refresh.
                            </p>
                        )}

                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={handleUploadAvatar}
                                disabled={uploadingAvatar || loading || !selectedAvatarFile}
                                className="inline-flex items-center gap-2 rounded-xl bg-action px-4 py-2 text-sm font-semibold text-text-inverse transition hover:brightness-105 disabled:opacity-50"
                            >
                                <Save size={16} />
                                {uploadingAvatar ? 'Menyimpan...' : 'Simpan Foto'}
                            </button>

                            <button
                                onClick={resetSelectedAvatar}
                                disabled={uploadingAvatar || loading || !selectedAvatarFile}
                                className="inline-flex items-center gap-2 rounded-xl border border-surface-secondary/70 px-4 py-2 text-sm font-semibold text-text-secondary transition hover:bg-surface-secondary/20 disabled:opacity-50"
                            >
                                Batal Ganti
                            </button>

                            <button
                                onClick={handleDeleteAvatar}
                                disabled={deletingAvatar || loading || (!selectedAvatarFile && !account?.avatar_url)}
                                className="inline-flex items-center gap-2 rounded-xl border border-status-error/40 px-4 py-2 text-sm font-semibold text-status-error transition hover:bg-status-error/10 disabled:opacity-50"
                            >
                                <Trash2 size={16} />
                                {deletingAvatar ? 'Menghapus...' : 'Hapus Foto'}
                            </button>
                        </div>
                    </section>

                    <section className="space-y-4 border-t border-surface-secondary/60 pt-6">
                        <div className="flex items-center gap-2">
                            <KeyRound size={18} className="text-action" />
                            <h2 className="text-lg font-bold text-text-primary">Ganti Password</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-text-secondary">Password Baru</label>
                                <div className="relative">
                                    <input
                                        type={showNewPassword ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full rounded-xl border border-surface-secondary bg-surface-primary px-3 py-2 pr-11 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                                        placeholder="Minimal 8 karakter"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPassword((prev) => !prev)}
                                        className="absolute inset-y-0 right-0 px-3 text-text-secondary hover:text-text-primary"
                                        aria-label={showNewPassword ? 'Sembunyikan password' : 'Lihat password'}
                                    >
                                        {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-semibold text-text-secondary">Konfirmasi Password</label>
                                <div className="relative">
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full rounded-xl border border-surface-secondary bg-surface-primary px-3 py-2 pr-11 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                                        placeholder="Ulangi password baru"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                                        className="absolute inset-y-0 right-0 px-3 text-text-secondary hover:text-text-primary"
                                        aria-label={showConfirmPassword ? 'Sembunyikan password' : 'Lihat password'}
                                    >
                                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-xl border border-surface-secondary/60 bg-surface-secondary/10 p-3 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-text-secondary">Kekuatan Password</span>
                                <span className="font-semibold text-text-primary">{strength.label}</span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-surface-secondary">
                                <div
                                    className={`h-2 rounded-full transition-all ${strength.color}`}
                                    style={{ width: `${Math.max(10, strength.score * 25)}%` }}
                                />
                            </div>
                            {confirmPassword.length > 0 && (
                                <div className={`text-xs flex items-center gap-1 ${passwordMatch ? 'text-status-success' : 'text-status-error'}`}>
                                    {passwordMatch ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                                    {passwordMatch ? 'Konfirmasi password cocok.' : 'Konfirmasi password belum cocok.'}
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-1 pt-1">
                                {passwordChecks.map((item) => (
                                    <div
                                        key={item.label}
                                        className={`text-[11px] flex items-center gap-1 ${item.ok ? 'text-status-success' : 'text-text-secondary'
                                            }`}
                                    >
                                        {item.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                                        {item.label}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={handleChangePassword}
                            disabled={savingPassword || loading}
                            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-text-inverse transition hover:brightness-105 disabled:opacity-50"
                        >
                            <ShieldCheck size={16} />
                            {savingPassword ? 'Menyimpan...' : 'Ubah Password'}
                        </button>
                    </section>
                </div>
            </div>
        </div>
    );
}
