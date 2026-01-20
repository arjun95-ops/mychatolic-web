import { Metadata } from 'next';
import { ToastProvider } from "@/components/ui/Toast";
import VerificationManager from "@/components/verification/VerificationManager";

export const metadata: Metadata = {
    title: 'Verifikasi Pendaftaran | MyCatholic Admin',
    description: 'Verifikasi user baru.',
};

export default function VerificationPage() {
    return (
        <ToastProvider>
            <div className="w-full">
                <VerificationManager />
            </div>
        </ToastProvider>
    );
}
