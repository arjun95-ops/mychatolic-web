import type { Metadata } from "next";
import DonationManager from "@/components/donations/DonationManager";

export const metadata: Metadata = {
  title: "Donasi Masuk | MyCatholic Admin",
  description: "Verifikasi donasi persembahan kasih via QRIS.",
};

export default function DonationsPage() {
  return (
    <div className="w-full">
      <DonationManager />
    </div>
  );
}
