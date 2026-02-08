'use client';

import { Eye, Shield, CheckCircle, XCircle, Clock } from 'lucide-react';
import Image from 'next/image';
import { getUserStatus, statusCategory, VerificationUserLike } from '@/lib/verification-status';

interface UserRow extends VerificationUserLike {
    id: string;
    avatar_url?: string | null;
    full_name?: string | null;
    email?: string | null;
    role?: string | null;
    country?: string | null;
    diocese?: string | null;
    parish?: string | null;
    created_at?: string | null;
}

interface UserTableProps {
    data?: UserRow[];
    users?: UserRow[];
    loading: boolean;
    onVerify?: (user: UserRow) => void;
    onViewDetail?: (user: UserRow) => void;
}

export default function UserTable({
    data,
    users,
    loading,
    onVerify,
    onViewDetail,
}: UserTableProps) {
    const rows = Array.isArray(data)
        ? data
        : Array.isArray(users)
            ? users
            : [];
    const onDetail = onVerify ?? onViewDetail ?? (() => { });

    const getStatusBadge = (status: string) => {
        switch (statusCategory(status)) {
            case 'verified':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100"><CheckCircle size={12} /> Terverifikasi</span>;
            case 'rejected':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-100"><XCircle size={12} /> Ditolak</span>;
            case 'pending':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-100"><Clock size={12} /> Pending</span>;
            case 'banned':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200"><XCircle size={12} /> Ditangguhkan</span>;
            default:
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-100"><Shield size={12} /> Belum Verifikasi</span>;
        }
    };

    const formatDate = (date?: string | null) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const formatDateTime = (date?: string | null) => {
        if (!date) return '-';
        return new Date(date).toLocaleString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (loading) {
        return (
            <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary mx-auto"></div>
                <p className="mt-2 text-sm text-gray-400">Memuat data user...</p>
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className="p-12 text-center border-t border-gray-100">
                <p className="text-gray-400">Tidak ada user yang ditemukan dengan filter ini.</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-gray-50/50 border-b border-gray-200 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                        <th className="px-6 py-4">Pengguna</th>
                        <th className="px-6 py-4">Peran</th>
                        <th className="px-6 py-4">Lokasi Gereja</th>
                        <th className="px-6 py-4">Tgl Daftar</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Persetujuan</th>
                        <th className="px-6 py-4 text-right">Aksi</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {rows.map((user) => (
                        <tr key={user?.id} className="hover:bg-slate-50 transition group">
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-gray-200 overflow-hidden relative border border-gray-100 shrink-0">
                                        {user?.avatar_url ? (
                                            <Image src={user.avatar_url} alt={user.full_name || 'User'} fill className="object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-400"><Shield size={14} /></div>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-gray-900 text-sm truncate max-w-[180px]">{user?.full_name}</p>
                                        <p className="text-xs text-gray-500 truncate max-w-[180px]">{user?.email}</p>
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <span className="text-sm text-gray-700 capitalize">{user?.role}</span>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-sm font-medium text-gray-900">{user?.country || '-'}</span>
                                    <span className="text-xs text-gray-500">{user?.diocese || '-'}</span>
                                    <span className="text-xs text-gray-400 truncate max-w-[150px]">{user?.parish || '-'}</span>
                                </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                                {formatDate(user?.created_at)}
                            </td>
                            <td className="px-6 py-4">
                                {getStatusBadge(getUserStatus(user))}
                            </td>
                            <td className="px-6 py-4">
                                {user?.faith_verification_consent_at ? (
                                    <div className="inline-flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700">
                                        <span className="text-xs font-semibold">Disetujui</span>
                                        <span className="text-[11px] leading-4">
                                            {formatDateTime(user.faith_verification_consent_at)}
                                        </span>
                                    </div>
                                ) : (
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
                                        Belum ada
                                    </span>
                                )}
                            </td>
                            <td className="px-6 py-4 text-right">
                                <button
                                    onClick={() => onDetail(user)}
                                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:text-brand-primary hover:border-brand-primary hover:bg-slate-50 transition text-xs font-semibold inline-flex items-center gap-1 shadow-sm"
                                >
                                    <Eye size={14} /> Detail
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
