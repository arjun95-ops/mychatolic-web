import { redirect } from "next/navigation";

export default function LegacyBibleImportPage() {
  redirect("/dashboard/bible/studio?tab=bulk-import");
}
