import type { Metadata } from "next";
import PrayerManager from "@/components/prayers/PrayerManager";

export const metadata: Metadata = {
  title: "Kumpulan Doa | MyCatholic Admin",
  description: "Kelola katalog doa dan konten doa multi-bahasa.",
};

export default function PrayersPage() {
  return (
    <div className="w-full">
      <PrayerManager />
    </div>
  );
}
