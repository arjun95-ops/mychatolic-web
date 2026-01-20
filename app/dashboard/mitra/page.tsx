import MitraManager from "@/components/mitra/MitraManager";
import { ToastProvider } from "@/components/ui/Toast";
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Mitra Pastoral | MyCatholic Admin',
    description: 'Verifikasi Mitra Pastoral (Pastor, Suster, dll).',
};

export default function MitraPage() {
    return (
        <ToastProvider>
            <div className="w-full">
                <MitraManager />
            </div>
        </ToastProvider>
    );
}
