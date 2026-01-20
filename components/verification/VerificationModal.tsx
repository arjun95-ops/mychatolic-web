import Modal from "@/components/ui/Modal";
import { CheckCircle, XCircle, Loader2, Link as LinkIcon, Calendar } from "lucide-react";

interface VerificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
    onVerify: (status: 'approved' | 'rejected') => void;
    isUpdating: boolean;
}

export default function VerificationModal({
    isOpen, onClose, user, onVerify, isUpdating
}: VerificationModalProps) {
    if (!user) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Verifikasi User`}
        >
            <div className="space-y-6">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{user.full_name}</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Review data pendaftaran sebelum memverifikasi.</p>
                </div>

                {/* User Info Grid */}
                <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 dark:bg-slate-800/50 p-5 rounded-xl border border-slate-100 dark:border-slate-700">
                    <div className="col-span-2 sm:col-span-1">
                        <p className="text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase mb-1">Role</p>
                        <p className="font-semibold capitalize text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 inline-block px-2 py-1 rounded border border-slate-200 dark:border-slate-700">{user.role}</p>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <p className="text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase mb-1">Tanggal Lahir</p>
                        <p className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                            {user.birth_date ? new Date(user.birth_date).toLocaleDateString("id-ID") : '-'}
                        </p>
                    </div>
                    <div className="col-span-2">
                        <p className="text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase mb-1">Email</p>
                        <p className="font-mono text-slate-600 dark:text-slate-300">{user.email}</p>
                    </div>
                </div>

                {/* Document Preview */}
                <div>
                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                        <LinkIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" /> Dokumen Verifikasi
                    </h4>
                    {user.verification_doc_url ? (
                        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-800 relative group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={user.verification_doc_url}
                                alt="Dokumen Verifikasi"
                                className="w-full h-auto max-h-64 object-contain p-4"
                            />
                            <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                <a
                                    href={user.verification_doc_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-white text-slate-900 px-5 py-2.5 rounded-full text-sm font-bold shadow-xl hover:scale-105 transition-transform"
                                >
                                    Buka Full Size
                                </a>
                            </div>
                        </div>
                    ) : (
                        <div className="p-8 bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-center text-slate-400 dark:text-slate-600 italic">
                            Tidak ada dokumen yang diunggah.
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="pt-6 flex gap-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                        onClick={() => onVerify('rejected')}
                        disabled={isUpdating}
                        className="flex-1 px-4 py-3 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 font-bold transition-all flex justify-center items-center gap-2 shadow-sm dark:shadow-none"
                    >
                        {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                        Tolak
                    </button>
                    <button
                        onClick={() => onVerify('approved')}
                        disabled={isUpdating}
                        className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-500 dark:to-blue-500 text-white rounded-xl hover:opacity-90 font-bold shadow-lg shadow-purple-200 dark:shadow-purple-900/20 transition-all flex justify-center items-center gap-2"
                    >
                        {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Terima & Verifikasi
                    </button>
                </div>
            </div>
        </Modal>
    );
}
