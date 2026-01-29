/* eslint-disable @typescript-eslint/no-explicit-any */
import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useState } from 'react';
import Image from 'next/image';
import { X, Check, Calendar, User, MapPin, Heart, Shield } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr'; // FIXED: Menggunakan paket SSR modern
import toast from 'react-hot-toast';

// Helper untuk format tanggal
const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
};

interface VerificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
    onSuccess: () => void;
}

export default function VerificationModal({ isOpen, onClose, user, onSuccess }: VerificationModalProps) {
    const [loading, setLoading] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [showRejectInput, setShowRejectInput] = useState(false);

    // FIXED: Inisialisasi Supabase Client versi SSR
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    if (!user) return null;

    // 1. DETEKSI ROLE & LOGIC DOKUMEN
    const isClergy = ['pastor', 'suster', 'bruder', 'frater'].includes(user.role?.toLowerCase());
    const isCatechumen = user.is_catechumen || user.faith_status === 'catechumen';
    const isUmat = !isClergy && !isCatechumen;

    // Handler Action (Memanggil API Route Admin untuk bypass RLS)
    const handleAction = async (status: 'verified_catholic' | 'verified_pastoral' | 'rejected') => {
        if (status === 'rejected' && !rejectReason.trim()) {
            toast.error('Wajib isi alasan penolakan');
            return;
        }

        setLoading(true);
        try {
            // 1. Tentukan status akhir
            let finalStatus = status;
            if (status !== 'rejected') {
                if (isClergy) finalStatus = 'verified_pastoral';
                else finalStatus = 'verified_catholic';
            }

            // 2. Panggil API Route (Backend) 
            const response = await fetch('/api/admin/verify-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    updates: {
                        account_status: finalStatus,
                        verification_status: finalStatus,
                        rejection_reason: status === 'rejected' ? rejectReason : null,
                        verified_at: status !== 'rejected' ? new Date().toISOString() : null,
                    }
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Gagal menghubungi server');
            }

            // 3. Sukses
            toast.success(status === 'rejected' ? 'Verifikasi ditolak' : 'Verifikasi berhasil disetujui');
            onSuccess();
            onClose();

        } catch (error: any) {
            console.error('Error updating status:', error);
            toast.error('Gagal memproses: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Helper component untuk baris data
    const InfoRow = ({ icon: Icon, label, value, isNew = false }: any) => (
        <div className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
            <div className="mt-1 p-1.5 bg-blue-50 rounded-lg text-blue-600">
                <Icon size={16} />
            </div>
            <div className="flex-1">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                    {label} {isNew && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full ml-1">BARU</span>}
                </p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{value || '-'}</p>
            </div>
        </div>
    );

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

                            {/* HEADER */}
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <div>
                                    <Dialog.Title className="text-lg font-bold text-gray-900">
                                        Verifikasi Pengguna
                                    </Dialog.Title>
                                    <p className="text-sm text-gray-500">Tinjau data diri dan dokumen sakramen</p>
                                </div>
                                <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition">
                                    <X size={20} className="text-gray-500" />
                                </button>
                            </div>

                            {/* CONTENT SCROLLABLE */}
                            <div className="flex-1 overflow-y-auto p-6">
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-8">

                                    {/* KOLOM KIRI: DATA DIRI */}
                                    <div className="md:col-span-5 space-y-6">
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-900 mb-4 border-l-4 border-blue-600 pl-3">
                                                IDENTITAS PRIBADI
                                            </h3>
                                            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-1">
                                                <InfoRow icon={User} label="Nama Lengkap" value={user.full_name} />
                                                <InfoRow icon={Shield} label="Peran (Role)" value={user.role} />
                                                <InfoRow icon={Shield} label="Status Iman" value={isCatechumen ? 'Katekumen' : 'Baptis Katolik'} isNew />
                                                <InfoRow icon={Heart} label="Nama Baptis" value={user.baptism_name} isNew />
                                                <InfoRow icon={Heart} label="Status Pernikahan" value={user.marital_status === 'single' ? 'Belum Menikah' : user.marital_status === 'widowed' ? 'Cerai Mati' : user.marital_status} isNew />
                                                <InfoRow icon={User} label="Jenis Kelamin" value={user.gender === 'male' ? 'Pria' : 'Wanita'} isNew />
                                                <InfoRow icon={Calendar} label="Tanggal Lahir" value={formatDate(user.birth_date)} />
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className="text-sm font-bold text-gray-900 mb-4 border-l-4 border-purple-600 pl-3">
                                                LOKASI GEREJA
                                            </h3>
                                            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-1">
                                                <InfoRow icon={MapPin} label="Negara" value={user.country || user.countries?.name} />
                                                <InfoRow icon={MapPin} label="Keuskupan" value={user.diocese || user.dioceses?.name} />
                                                <InfoRow icon={MapPin} label="Paroki" value={user.parish || user.churches?.name} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* KOLOM KANAN: DOKUMEN */}
                                    <div className="md:col-span-7">
                                        <h3 className="text-sm font-bold text-gray-900 mb-4 border-l-4 border-green-600 pl-3">
                                            DOKUMEN PENDUKUNG
                                        </h3>

                                        <div className="grid grid-cols-1 gap-6">
                                            {/* 1. SELFIE (SEMUA WAJIB) */}
                                            <DocumentCard
                                                title="Foto Selfie"
                                                url={user.selfie_url}
                                                bucket="verification_docs"
                                                isRequired
                                            />

                                            {/* 2. KTP (HANYA UMAT) */}
                                            {isUmat && (
                                                <DocumentCard
                                                    title="KTP / Identitas"
                                                    url={user.ktp_url}
                                                    bucket="verification_docs"
                                                    isRequired
                                                />
                                            )}

                                            {/* 3. SURAT BAPTIS (HANYA UMAT) */}
                                            {isUmat && (
                                                <DocumentCard
                                                    title="Surat Baptis"
                                                    url={user.baptism_cert_url}
                                                    bucket="verification_docs"
                                                    isRequired
                                                />
                                            )}

                                            {/* 4. SURAT TUGAS (HANYA CLERGY) */}
                                            {isClergy && (
                                                <DocumentCard
                                                    title="Surat Tugas / Tahbisan"
                                                    url={user.assignment_letter_url}
                                                    bucket="verification_docs"
                                                    isRequired
                                                />
                                            )}

                                            {/* 5. PESAN KATEKUMEN */}
                                            {isCatechumen && (
                                                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-800 text-sm">
                                                    <span className="font-bold">Info:</span> User ini adalah Katekumen. Tidak diperlukan dokumen sakramen (Baptis/Krisma). Cukup verifikasi data diri dan niat belajar.
                                                </div>
                                            )}

                                            {/* JIKA KOSONG */}
                                            {!user.selfie_url && !user.ktp_url && !user.baptism_cert_url && !user.assignment_letter_url && (
                                                <div className="p-8 text-center border-2 border-dashed border-gray-200 rounded-xl">
                                                    <p className="text-gray-400">Belum ada dokumen yang diunggah.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* FOOTER ACTIONS */}
                            <div className="p-6 bg-gray-50 border-t border-gray-100">
                                {!showRejectInput ? (
                                    <div className="flex justify-end gap-3">
                                        <button
                                            onClick={() => setShowRejectInput(true)}
                                            disabled={loading}
                                            className="px-6 py-2.5 rounded-xl border border-red-200 text-red-600 font-semibold hover:bg-red-50 transition"
                                        >
                                            Tolak
                                        </button>
                                        <button
                                            onClick={() => handleAction('verified_catholic')}
                                            disabled={loading}
                                            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold hover:shadow-lg hover:scale-[1.02] transition flex items-center gap-2"
                                        >
                                            {loading ? 'Memproses...' : (
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
                                                onClick={() => handleAction('rejected')}
                                                disabled={loading}
                                                className="px-6 py-2 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition text-sm"
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

// Sub-component untuk Dokumen Image
function DocumentCard({ title, url, bucket, isRequired }: any) {
    if (!url) return null;

    // Gunakan env var untuk base URL Supabase jika url relative
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const finalUrl = url.startsWith('http')
        ? url
        : `${baseUrl}/storage/v1/object/public/${bucket}/${url}`;

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition bg-white">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex justify-between items-center">
                <span className="font-semibold text-gray-700 text-sm">{title}</span>
                {isRequired && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">WAJIB</span>}
            </div>
            <div className="relative aspect-video bg-gray-100 group cursor-pointer">
                <Image
                    src={finalUrl}
                    alt={title}
                    fill
                    className="object-contain"
                    unoptimized
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <a
                        href={finalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-white/90 text-gray-900 px-4 py-2 rounded-full text-sm font-bold shadow-lg"
                    >
                        Lihat Full Size
                    </a>
                </div>
            </div>
        </div>
    );
}
