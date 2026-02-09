import { redirect } from "next/navigation";

export default function LegacyBibleManualPage() {
  redirect("/dashboard/bible/studio?tab=ayat");
}
