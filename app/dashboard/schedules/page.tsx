"use client";

import SchedulesTab from "@/components/master-data/tabs/SchedulesTab";
import { ToastProvider } from "@/components/ui/Toast";

export default function SchedulesPage() {
  return (
    <ToastProvider>
      <div className="w-full">
        <SchedulesTab />
      </div>
    </ToastProvider>
  );
}
