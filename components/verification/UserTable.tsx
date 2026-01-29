/* eslint-disable @typescript-eslint/no-explicit-any */
import { MoreHorizontal, ShieldCheck, User, Eye } from "lucide-react";
import Image from "next/image";
import { UserProfile } from "./UserDashboard";

interface Props {
    users: UserProfile[];
    loading: boolean;
    onViewDetail: (user: UserProfile) => void;
}

export default function UserTable({ users, loading, onViewDetail }: Props) {

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'verified_catholic':
            case 'verified_pastoral':
            case 'approved':
            case 'verified':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Terverifikasi
                    </span>
                );
            case 'rejected':
                return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">Ditolak</span>;
            case 'pending':
            default:
                return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Menunggu</span>;
        }
    };

    if (loading) {
        return (
            <div className="p-8 space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-16 bg-gray-50 rounded-lg animate-pulse" />
                ))}
            </div>
        );
    }

    if (users.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-white">
                <div className="bg-gray-50 p-4 rounded-full mb-4">
                    <User className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900">Tidak ada user ditemukan</h3>
                <p className="text-gray-500 max-w-sm text-center mt-1">Coba sesuaikan filter pencarian atau kategori wilayah Anda.</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-gray-50/50 border-b border-gray-200 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                        <th className="px-6 py-4">User</th>
                        <th className="px-6 py-4">Role</th>
                        <th className="px-6 py-4">Lokasi (Negara / Paroki)</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Aksi</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                    {users.map((user) => (
                        <tr key={user.id} className="hover:bg-blue-50/10 transition-colors group">
                            {/* User Info */}
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                    <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
                                        {user.avatar_url ? (
                                            <Image
                                                src={user.avatar_url}
                                                alt={user.full_name}
                                                fill
                                                className="object-cover"
                                                unoptimized
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                <User size={20} />
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm text-gray-900 group-hover:text-blue-600 transition-colors">
                                            {user.full_name || 'Tanpa Nama'}
                                        </p>
                                        <p className="text-xs text-gray-500 font-mono tracking-tight">{user.email || 'Email tidak tersedia'}</p>
                                    </div>
                                </div>
                            </td>

                            {/* Role */}
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-1.5 text-sm text-gray-700 capitalize w-max bg-gray-50 px-2 py-1 rounded border border-gray-200">
                                    {user.role === 'pastor' || user.role === 'suster' ? (
                                        <ShieldCheck size={14} className="text-purple-600" />
                                    ) : null}
                                    {user.role || 'umat'}
                                </div>
                            </td>

                            {/* Lokasi */}
                            <td className="px-6 py-4">
                                <div className="flex flex-col text-sm">
                                    <span className="font-medium text-gray-900">{user.country || '-'}</span>
                                    <span className="text-gray-500 text-xs">{user.parish || 'Paroki belum diisi'}</span>
                                </div>
                            </td>

                            {/* Status */}
                            <td className="px-6 py-4">
                                {getStatusBadge(user.verification_status || user.account_status)}
                            </td>

                            {/* Aksi */}
                            <td className="px-6 py-4 text-right">
                                <button
                                    onClick={() => onViewDetail(user)}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition shadow-sm"
                                    title="Lihat Detail Verifikasi"
                                >
                                    <Eye size={14} />
                                    Detail
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
