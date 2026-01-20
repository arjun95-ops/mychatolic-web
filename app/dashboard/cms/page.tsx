import CMSManager from "@/components/cms/CMSManager";
import { ToastProvider } from "@/components/ui/Toast";
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'CMS | MyCatholic Admin',
    description: 'Manage Articles and Announcements.',
};

export default function CMSPage() {
    return (
        <ToastProvider>
            <div className="w-full">
                <CMSManager />
            </div>
        </ToastProvider>
    );
}
