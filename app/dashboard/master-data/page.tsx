import MasterDataManager from "@/components/master-data/MasterDataManager";
import { ToastProvider } from "@/components/ui/Toast";
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Master Data | MyCatholic Admin',
    description: 'Manage church data reference.',
};

export default function MasterDataPage() {
    return (
        <ToastProvider>
            <div className="w-full">
                <MasterDataManager />
            </div>
        </ToastProvider>
    );
}
