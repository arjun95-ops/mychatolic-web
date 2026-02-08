'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Search, Filter, X, User as UserIcon, Calendar, CheckCircle, Clock, AlertCircle, Eye, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import Modal from '@/components/ui/Modal';
import { getUserStatus, isVerifiedStatus } from '@/lib/verification-status';

interface UserItem {
    id: string;
    full_name: string;
    baptism_name?: string;
    role: string;
    is_catechumen: boolean;
    faith_status?: string;
    account_status: string;
    verification_status: string;
    created_at: string;
    last_active?: string;
    // Detail fields
    birth_date?: string;
    gender?: string;
    marital_status?: string;
    email?: string;
    rejection_reason?: string;
    verification_submitted_at?: string;
    verified_at?: string;
    verification_ktp_url?: string;
    ktp_url?: string;
    baptism_certificate_url?: string;
    baptism_cert_url?: string;
    chrism_document_url?: string;
    chrism_cert_url?: string;
    task_letter_url?: string;
    assignment_letter_url?: string;
    selfie_url?: string;
    verification_video_url?: string;
    baptism_document_url?: string;
}

export default function ChurchUsersPage({ params }: { params: Promise<{ churchId: string }> }) {
    const { churchId } = use(params);
    const [users, setUsers] = useState<UserItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState({ page: 1, limit: 25, total: 0 });
    const [locationNames, setLocationNames] = useState<any>({});

    // Filters
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');

    // Modal
    const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query), 500);
        return () => clearTimeout(timer);
    }, [query]);

    // Fetch Data
    useEffect(() => {
        async function fetchUsers() {
            setLoading(true);
            try {
                const searchParams = new URLSearchParams({
                    level: 'users',
                    scope: 'church',
                    id: churchId,
                    page: meta.page.toString(),
                    limit: meta.limit.toString(),
                    q: debouncedQuery,
                });
                if (statusFilter) searchParams.set('status', statusFilter);
                if (roleFilter) searchParams.set('role', roleFilter);

                const res = await fetch(`/api/admin/location-explorer?${searchParams}`);
                const data = await res.json();

                if (data.users) {
                    setUsers(data.users);
                    setMeta(data.pagination);
                    setLocationNames(data.location_names || {});
                }
            } finally {
                setLoading(false);
            }
        }
        fetchUsers();
    }, [churchId, meta.page, debouncedQuery, statusFilter, roleFilter]);

    // Helper for status badge
    const getStatusBadge = (user: UserItem) => {
        const s = getUserStatus(user); // Reuse existing lib logic if imported, or replicate
        // Simple replicate for display:
        let label = 'Belum Verifikasi';
        let color = 'bg-surface-secondary text-text-secondary';

        if (user.account_status === 'banned') {
            label = 'Banned'; color = 'bg-status-error text-text-inverse';
        } else if (user.account_status === 'rejected' || user.verification_status === 'rejected') {
            label = 'Ditolak'; color = 'bg-status-error/10 text-status-error';
        } else if (isVerifiedStatus(user.verification_status) || user.account_status === 'verified') {
            label = 'Terverifikasi'; color = 'bg-status-success/10 text-status-success';
        } else if (user.verification_status === 'pending' || user.account_status === 'pending') {
            label = 'Pending'; color = 'bg-status-pending/10 text-status-pending';
        }

        return <span className={`px-2 py-1 rounded-full text-xs font-bold ${color}`}>{label}</span>;
    };

    const formatDate = (d?: string) => d ? format(new Date(d), 'dd MMM yyyy', { locale: idLocale }) : '-';

    // Document Link Helper
    const DocLink = ({ url, label }: { url?: string, label: string }) => {
        if (!url) return <span className="text-text-secondary text-xs italic">Tidak ada {label}</span>;
        return (
            <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-action hover:underline text-sm font-medium p-2 bg-action/5 rounded-lg border border-action/10 hover:bg-action/10 transition-colors">
                <FileText size={14} /> Lihat {label}
            </a>
        );
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-text-secondary flex-wrap">
                <Link href="/dashboard" className="hover:text-action">Dashboard</Link>
                <ChevronRight size={14} />
                <Link href="/dashboard/location" className="hover:text-action">Eksplor Lokasi</Link>
                <ChevronRight size={14} />
                <span className="text-text-secondary">{locationNames.country || '...'}</span>
                <ChevronRight size={14} />
                <span className="text-text-secondary">{locationNames.diocese || '...'}</span>
                <ChevronRight size={14} />
                <span className="text-text-primary font-medium truncate max-w-[200px]">{locationNames.church || '...'}</span>
            </div>

            {/* Header & Filters */}
            <div className="bg-surface-primary border border-surface-secondary dark:border-surface-secondary/20 rounded-xl p-6 shadow-sm space-y-6">
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-text-primary">{locationNames.church || 'Memuat...'}</h1>
                        <p className="text-text-secondary text-sm">Daftar User Terdaftar</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="relative md:col-span-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Cari nama user..."
                            className="w-full pl-10 pr-4 py-2.5 bg-surface-secondary dark:bg-surface-secondary/10 border border-surface-secondary dark:border-surface-secondary/20 rounded-lg text-sm focus:ring-2 focus:ring-action/20 outline-none transition-all"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </div>
                    <select
                        className="px-4 py-2.5 bg-surface-secondary dark:bg-surface-secondary/10 border border-surface-secondary dark:border-surface-secondary/20 rounded-lg text-sm outline-none focus:ring-2 focus:ring-action/20"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="">Semua Status</option>
                        <option value="pending">Pending</option>
                        <option value="verified">Terverifikasi</option>
                        <option value="rejected">Ditolak</option>
                        <option value="unverified">Belum Verifikasi</option>
                        <option value="banned">Banned</option>
                    </select>
                    <select
                        className="px-4 py-2.5 bg-surface-secondary dark:bg-surface-secondary/10 border border-surface-secondary dark:border-surface-secondary/20 rounded-lg text-sm outline-none focus:ring-2 focus:ring-action/20"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                    >
                        <option value="">Semua Role</option>
                        <option value="umat">Umat</option>
                        <option value="pastor">Pastor</option>
                        <option value="suster">Suster</option>
                        <option value="bruder">Bruder</option>
                        <option value="frater">Frater</option>
                        <option value="katekis">Katekis</option>
                        <option value="katekumen">Katekumen</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="bg-surface-primary border border-surface-secondary dark:border-surface-secondary/20 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-surface-secondary dark:bg-surface-secondary/10 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Nama User</th>
                                <th className="px-6 py-4">Role</th>
                                <th className="px-6 py-4 text-center">Status</th>
                                <th className="px-6 py-4">Tgl Daftar</th>
                                <th className="px-6 py-4">Terakhir Aktif</th>
                                <th className="px-6 py-4 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-secondary dark:divide-surface-secondary/20">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-6 py-4"><div className="h-10 w-10 bg-surface-secondary rounded-full inline-block mr-3 align-middle"></div><div className="h-4 bg-surface-secondary rounded w-32 inline-block align-middle"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-surface-secondary rounded w-20"></div></td>
                                        <td className="px-6 py-4 text-center"><div className="h-6 bg-surface-secondary rounded-full w-24 mx-auto"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-surface-secondary rounded w-24"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-surface-secondary rounded w-24"></div></td>
                                        <td className="px-6 py-4 text-right"><div className="h-8 bg-surface-secondary rounded w-16 ml-auto"></div></td>
                                    </tr>
                                ))
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-16 text-center text-text-secondary flex flex-col items-center justify-center">
                                        <UserIcon size={48} className="opacity-20 mb-4" />
                                        <p className="text-lg font-medium text-text-primary">Tidak ada user ditemukan</p>
                                        <p className="text-sm mt-1">Coba ubah filter pencarian atau status.</p>
                                    </td>
                                </tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user.id} className="group hover:bg-surface-secondary/5 dark:hover:bg-surface-secondary/5 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-sm">
                                                    {user.full_name?.charAt(0) || '?'}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-text-primary">{user.full_name}</div>
                                                    {user.baptism_name && <div className="text-xs text-text-secondary">{user.baptism_name}</div>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="capitalize text-sm font-medium text-text-secondary">{user.role}</span>
                                            {user.is_catechumen && <span className="ml-2 text-[10px] bg-brand-primary/10 text-brand-primary px-1.5 py-0.5 rounded">Katekumen</span>}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {getStatusBadge(user)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-text-secondary">
                                            <div className="flex items-center gap-1.5">
                                                <Calendar size={12} /> {formatDate(user.created_at)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-text-secondary">
                                            <div className="flex items-center gap-1.5">
                                                <Clock size={12} /> {user.last_active ? formatDate(user.last_active) : '-'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => setSelectedUser(user)}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-surface-secondary dark:bg-surface-secondary/20 hover:bg-surface-secondary/50 text-text-primary rounded-lg text-sm font-medium transition-colors"
                                            >
                                                <Eye size={14} /> Detail
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-6 py-4 border-t border-surface-secondary dark:border-surface-secondary/20 flex items-center justify-between">
                    <p className="text-sm text-text-secondary">
                        Menampilkan <span className="font-bold text-text-primary">{Math.min((meta.page - 1) * meta.limit + 1, meta.total)}</span> - <span className="font-bold text-text-primary">{Math.min(meta.page * meta.limit, meta.total)}</span> dari <span className="font-bold text-text-primary">{meta.total}</span> user
                    </p>
                    <div className="flex gap-2">
                        <button
                            disabled={meta.page === 1}
                            onClick={() => setMeta(p => ({ ...p, page: p.page - 1 }))}
                            className="px-3 py-1.5 border border-surface-secondary dark:border-surface-secondary/20 rounded-lg text-sm disabled:opacity-50 hover:bg-surface-secondary transition disabled:cursor-not-allowed"
                        >
                            Sebelumnya
                        </button>
                        <button
                            disabled={(meta.page * meta.limit) >= meta.total}
                            onClick={() => setMeta(p => ({ ...p, page: p.page + 1 }))}
                            className="px-3 py-1.5 border border-surface-secondary dark:border-surface-secondary/20 rounded-lg text-sm disabled:opacity-50 hover:bg-surface-secondary transition disabled:cursor-not-allowed"
                        >
                            Selanjutnya
                        </button>
                    </div>
                </div>
            </div>

            {/* Detail Modal */}
            <Modal isOpen={!!selectedUser} onClose={() => setSelectedUser(null)} title="Detail User">
                {selectedUser && (
                    <div className="space-y-6 max-h-[70vh] overflow-y-auto px-1 custom-scrollbar">
                        {/* Header Profile */}
                        <div className="flex items-center gap-4 p-4 bg-surface-secondary dark:bg-surface-secondary/10 rounded-xl">
                            <div className="w-16 h-16 rounded-full bg-brand-primary text-text-inverse flex items-center justify-center text-2xl font-bold uppercase shadow-lg">
                                {selectedUser.full_name?.substring(0, 2)}
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-text-primary">{selectedUser.full_name}</h3>
                                <p className="text-text-secondary">{selectedUser.baptism_name || '-'}</p>
                                <div className="flex gap-2 mt-2">
                                    <span className="px-2 py-0.5 bg-surface-primary rounded text-xs border border-surface-secondary capitalize">{selectedUser.role}</span>
                                    {getStatusBadge(selectedUser)}
                                </div>
                            </div>
                        </div>

                        {/* Info Grid */}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="space-y-1">
                                <label className="text-xs text-text-secondary uppercase font-bold">Jenis Kelamin</label>
                                <p className="font-medium">{selectedUser.gender === 'male' ? 'Laki-laki' : selectedUser.gender === 'female' ? 'perempuan' : '-'}</p>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-text-secondary uppercase font-bold">Tgl Lahir</label>
                                <p className="font-medium">{formatDate(selectedUser.birth_date)}</p>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-text-secondary uppercase font-bold">Status Perkawinan</label>
                                <p className="font-medium capitalize">{selectedUser.marital_status || '-'}</p>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-text-secondary uppercase font-bold">Email</label>
                                <p className="font-medium">{selectedUser.email || '-'}</p>
                            </div>
                        </div>

                        <hr className="border-surface-secondary dark:border-surface-secondary/20" />

                        {/* Verification Info */}
                        <div>
                            <h4 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                                <CheckCircle size={16} className="text-action" /> Data Verifikasi
                            </h4>
                            <div className="bg-surface-secondary/30 rounded-lg p-4 space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-text-secondary">Status Akun:</span>
                                    <span className="font-medium capitalize">{selectedUser.account_status}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-text-secondary">Status Verifikasi:</span>
                                    <span className="font-medium capitalize">{selectedUser.verification_status}</span>
                                </div>
                                {selectedUser.verification_submitted_at && (
                                    <div className="flex justify-between">
                                        <span className="text-text-secondary">Diajukan:</span>
                                        <span>{formatDate(selectedUser.verification_submitted_at)}</span>
                                    </div>
                                )}
                                {selectedUser.verified_at && (
                                    <div className="flex justify-between text-status-success">
                                        <span>Diverifikasi:</span>
                                        <span>{formatDate(selectedUser.verified_at)}</span>
                                    </div>
                                )}
                                {selectedUser.rejection_reason && (
                                    <div className="mt-2 p-2 bg-status-error/10 text-status-error rounded text-xs">
                                        <strong>Alasan Penolakan:</strong> {selectedUser.rejection_reason}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Documents */}
                        <div>
                            <h4 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                                <FileText size={16} className="text-brand-primary" /> Dokumen Pendukung
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <DocLink label="KTP" url={selectedUser.ktp_url || selectedUser.verification_ktp_url} />
                                <DocLink label="Sertifikat Baptis" url={selectedUser.baptism_cert_url || selectedUser.baptism_certificate_url || selectedUser.baptism_document_url} />
                                <DocLink label="Sertifikat Krisma" url={selectedUser.chrism_cert_url || selectedUser.chrism_document_url} />
                                <DocLink label="Surat Tugas" url={selectedUser.assignment_letter_url || selectedUser.task_letter_url} />
                                <DocLink label="Selfie" url={selectedUser.selfie_url || selectedUser.verification_video_url} />
                            </div>
                        </div>

                        <div className="pt-4 flex justify-between gap-4">
                            <button onClick={() => setSelectedUser(null)} className="w-full py-2.5 border border-surface-secondary rounded-xl text-sm font-bold hover:bg-surface-secondary/50">
                                Tutup
                            </button>
                            <Link href={`/dashboard/verification`} className="w-full py-2.5 bg-action text-text-inverse rounded-xl text-sm font-bold text-center hover:bg-action/90 shadow-lg shadow-action/20">
                                Kelola Verifikasi
                            </Link>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
