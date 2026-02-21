import type { Metadata } from "next";
import PrayerLanguageManager from "@/components/prayers/PrayerLanguageManager";

export const metadata: Metadata = {
  title: "Bahasa Doa | MyCatholic Admin",
  description: "Kelola bahasa yang tersedia untuk Kumpulan Doa.",
};

export default function PrayerLanguagesPage() {
  return (
    <div className="w-full">
      <PrayerLanguageManager />
    </div>
  );
}
