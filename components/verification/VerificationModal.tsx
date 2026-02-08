import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useMemo, useState } from 'react';
import Image from 'next/image';
import {
    X,
    Check,
    Calendar,
    User,
    MapPin,
    Heart,
    Shield,
    LucideIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    approvedStatusForUser,
    getUserStatus,
    getVerificationDocuments,
    isCatechumenUser,
    isClergyRole,
    statusCategory,
    VerificationUserLike,
} from '@/lib/verification-status';

const formatDate = (dateString?: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
};

const formatDateTime = (dateString?: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const statusLabel = (status: string) => {
    const category = statusCategory(status);
    if (category === 'verified') return 'Terverifikasi';
    if (category === 'pending') return 'Pending';
    if (category === 'rejected') return 'Ditolak';
    if (category === 'banned') return 'Ditangguhkan';
    return 'Belum Verifikasi';
};

interface VerificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: VerificationModalUser | null;
    onSuccess?: () => void;
}

interface VerificationModalUser extends VerificationUserLike {
    id: string;
    full_name?: string | null;
    baptism_name?: string | null;
    marital_status?: string | null;
    gender?: string | null;
    birth_date?: string | null;
}

interface InfoRowProps {
    icon: LucideIcon;
    label: string;
    value?: string | null;
}

export default function VerificationModal({
    isOpen,
    onClose,
    user,
    onSuccess,
}: VerificationModalProps) {
    const [loading, setLoading] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [showRejectInput, setShowRejectInput] = useState(false);
    const docs = useMemo(() => getVerificationDocuments(user), [user]);

    if (!user) return null;

    const isClergy = isClergyRole(user.role);
    const isCatechumen = isCatechumenUser(user);
    const isUmat = !isClergy && !isCatechumen;
    const currentStatus = getUserStatus(user);
    const consentAtLabel = formatDateTime(user.faith_verification_consent_at);

    const handleAction = async (action: 'approve' | 'reject') => {
        if (action === 'reject' && !rejectReason.trim()) {
            toast.error('Wajib isi alasan penolakan');
            return;
        }

        setLoading(true);
        try {
            const finalStatus =
                action === 'reject' ? 'rejected' : approvedStatusForUser(user);

            const response = await fetch('/api/admin/verify-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    updates: {
                        account_status: finalStatus,
                        verification_status: finalStatus,
                        rejection_reason: action === 'reject' ? rejectReason.trim() : null,
                        verified_at:
                            action === 'approve' ? new Date().toISOString() : null,
                    },
                }),
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Gagal menghubungi server');
            }

            toast.success(
                action === 'reject'
                    ? 'Verifikasi ditolak'
                    : 'Verifikasi berhasil disetujui',
            );

            onSuccess?.();
            onClose();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('Error updating status:', error);
            toast.error(`Gagal memproses: ${message}`);
        } finally {
            setLoading(false);
        }
    };

    const InfoRow = ({ icon: Icon, label, value }: InfoRowProps) => (
        <div className="flex items-start gap-3 py-2 border-b border-surface-secondary dark:border-surface-secondary/20 last:border-0">
            <div className="mt-1 p-1.5 bg-brand-primary/10 text-brand-primary">
                <Icon size={16} />
            </div>
            <div className="flex-1">
                <p className="text-xs text-text-secondary dark:text-text-secondary/80 font-medium uppercase tracking-wide">
                    {label}
                </p>
                <p className="text-sm font-semibold text-text-primary dark:text-text-inverse mt-0.5">
                    {value || '-'}
                </p>
            </div>
        </div>
    );

    const hasDocuments = Boolean(
        docs.selfie || docs.identity || docs.baptism || docs.chrism || docs.assignment,
    );

    const genderLabel =
        user.gender === 'male'
            ? 'Pria'
            : user.gender === 'female'
                ? 'Wanita'
                : '-';

    return (
        <Transition appear show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0 scale-95"
                    enterTo="opacity-100 scale-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100 scale-100"
                    leaveTo="opacity-0 scale-95"
                >
                    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
                        <Dialog.Panel className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="px-6 py-4 border-b border-surface-secondary flex justify-between items-center bg-surface-secondary/50 dark:bg-surface-inverse/50">
                                <div>
                                    <Dialog.Title className="text-lg font-bold text-text-primary dark:text-text-inverse">
                                        Verifikasi Pengguna
                                    </Dialog.Title>
                                    <p className="text-sm text-text-secondary">
                                        Tinjau data diri dan dokumen pendukung
                                    </p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-gray-200 rounded-full transition"
                                >
                                    <X size={20} className="text-gray-500" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6">
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                                    <div className="md:col-span-5 space-y-6">
                                        <div>
                                            <h3 className="text-sm font-bold text-text-primary dark:text-text-inverse mb-4 border-l-4 border-brand-primary pl-3">
                                                IDENTITAS PRIBADI
                                            </h3>
                                            <div className="bg-surface-primary dark:bg-surface-inverse rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-4 shadow-sm space-y-1">
                                                <InfoRow
                                                    icon={User}
                                                    label="Nama Lengkap"
                                                    value={user.full_name}
                                                />
                                                <InfoRow
                                                    icon={Heart}
                                                    label="Nama Baptis"
                                                    value={user.baptism_name}
                                                />
                                                <InfoRow
                                                    icon={Shield}
                                                    label="Peran (Role)"
                                                    value={user.role}
                                                />
                                                <InfoRow
                                                    icon={Shield}
                                                    label="Status Iman"
                                                    value={
                                                        isCatechumen
                                                            ? 'Katekumen'
                                                            : 'Baptis Katolik'
                                                    }
                                                />
                                                <InfoRow
                                                    icon={Shield}
                                                    label="Status Verifikasi"
                                                    value={statusLabel(currentStatus)}
                                                />
                                                <InfoRow
                                                    icon={Shield}
                                                    label="Persetujuan Verifikasi Dokumen"
                                                    value={
                                                        consentAtLabel
                                                            ? `Disetujui pada ${consentAtLabel}`
                                                            : 'Belum disetujui'
                                                    }
                                                />
                                                <InfoRow
                                                    icon={Heart}
                                                    label="Status Pernikahan"
                                                    value={
                                                        user.marital_status === 'single'
                                                            ? 'Belum Menikah'
                                                            : user.marital_status === 'widowed'
                                                                ? 'Cerai Mati'
                                                                : user.marital_status
                                                    }
                                                />
                                                <InfoRow
                                                    icon={User}
                                                    label="Jenis Kelamin"
                                                    value={genderLabel}
                                                />
                                                <InfoRow
                                                    icon={Calendar}
                                                    label="Tanggal Lahir"
                                                    value={formatDate(user.birth_date)}
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className="text-sm font-bold text-text-primary dark:text-text-inverse mb-4 border-l-4 border-brand-primary pl-3">
                                                LOKASI GEREJA
                                            </h3>
                                            <div className="bg-surface-primary dark:bg-surface-inverse rounded-xl border border-surface-secondary dark:border-surface-secondary/20 p-4 shadow-sm space-y-1">
                                                <InfoRow
                                                    icon={MapPin}
                                                    label="Negara"
                                                    value={user.country || user.countries?.name}
                                                />
                                                <InfoRow
                                                    icon={MapPin}
                                                    label="Keuskupan"
                                                    value={user.diocese || user.dioceses?.name}
                                                />
                                                <InfoRow
                                                    icon={MapPin}
                                                    label="Paroki"
                                                    value={user.parish || user.churches?.name}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="md:col-span-7">
                                        <h3 className="text-sm font-bold text-text-primary dark:text-text-inverse mb-4 border-l-4 border-status-success pl-3">
                                            DOKUMEN PENDUKUNG
                                        </h3>

                                        <div className="grid grid-cols-1 gap-6">
                                            {docs.selfie && (
                                                <DocumentCard
                                                    title="Foto Selfie"
                                                    url={docs.selfie}
                                                    bucket="verification_docs"
                                                    isRequired={false}
                                                />
                                            )}

                                            {docs.identity && (
                                                <DocumentCard
                                                    title="KTP / Identitas"
                                                    url={docs.identity}
                                                    bucket="verification_docs"
                                                    isRequired={isUmat}
                                                />
                                            )}

                                            {isUmat && docs.baptism && (
                                                <DocumentCard
                                                    title="Surat Baptis"
                                                    url={docs.baptism}
                                                    bucket="verification_docs"
                                                    isRequired
                                                />
                                            )}

                                            {isUmat && docs.chrism && (
                                                <DocumentCard
                                                    title="Surat Krisma"
                                                    url={docs.chrism}
                                                    bucket="verification_docs"
                                                    isRequired={false}
                                                />
                                            )}

                                            {isClergy && docs.assignment && (
                                                <DocumentCard
                                                    title="Surat Tugas / Tahbisan"
                                                    url={docs.assignment}
                                                    bucket="verification_docs"
                                                    isRequired
                                                />
                                            )}

                                            {isCatechumen && (
                                                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-800 text-sm">
                                                    <span className="font-bold">Info:</span> User ini adalah
                                                    Katekumen. Dokumen sakramen tidak wajib.
                                                </div>
                                            )}

                                            {!hasDocuments && (
                                                <div className="p-8 text-center border-2 border-dashed border-gray-200 rounded-xl">
                                                    <p className="text-gray-400">
                                                        Belum ada dokumen yang diunggah.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 bg-gray-50 border-t border-gray-100">
                                {!showRejectInput ? (
                                    <div className="flex justify-end gap-3">
                                        <button
                                            onClick={() => setShowRejectInput(true)}
                                            disabled={loading}
                                            className="px-6 py-2.5 rounded-xl border border-status-error/30 text-status-error font-semibold hover:bg-status-error/10 transition"
                                        >
                                            Tolak
                                        </button>
                                        <button
                                            onClick={() => handleAction('approve')}
                                            disabled={loading}
                                            className="px-6 py-2.5 rounded-xl bg-action hover:bg-action/90 text-text-inverse font-semibold shadow-lg shadow-action/20 transition flex items-center gap-2"
                                        >
                                            {loading ? (
                                                'Memproses...'
                                            ) : (
                                                <>
                                                    <Check size={18} />
                                                    Setujui Verifikasi
                                                </>
                                            )}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2">
                                        <textarea
                                            placeholder="Tulis alasan penolakan (Wajib)..."
                                            className="w-full border border-gray-300 rounded-xl p-3 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-sm"
                                            rows={2}
                                            value={rejectReason}
                                            onChange={(e) => setRejectReason(e.target.value)}
                                        />
                                        <div className="flex justify-end gap-3">
                                            <button
                                                onClick={() => setShowRejectInput(false)}
                                                disabled={loading}
                                                className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium"
                                            >
                                                Batal
                                            </button>
                                            <button
                                                onClick={() => handleAction('reject')}
                                                disabled={loading}
                                                className="px-6 py-2 rounded-xl bg-status-error text-text-inverse font-semibold hover:bg-status-error/90 transition text-sm"
                                            >
                                                {loading ? 'Memproses...' : 'Konfirmasi Penolakan'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Dialog.Panel>
                    </div>
                </Transition.Child>
            </Dialog>
        </Transition>
    );
}

function DocumentCard({
    title,
    url,
    bucket,
    isRequired,
}: {
    title: string;
    url: string;
    bucket: string;
    isRequired: boolean;
}) {
    if (!url) return null;

    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const finalUrl = url.startsWith('http')
        ? url
        : `${baseUrl}/storage/v1/object/public/${bucket}/${url}`;

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition bg-white">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex justify-between items-center">
                <span className="font-semibold text-gray-700 text-sm">{title}</span>
                {isRequired && (
                    <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">
                        WAJIB
                    </span>
                )}
            </div>
            <div className="relative aspect-video bg-gray-100 group cursor-pointer">
                <Image src={finalUrl} alt={title} fill className="object-contain" unoptimized />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <a
                        href={finalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-white/90 text-gray-900 px-4 py-2 rounded-full text-sm font-bold shadow-lg"
                    >
                        Lihat Ukuran Penuh
                    </a>
                </div>
            </div>
        </div>
    );
}
