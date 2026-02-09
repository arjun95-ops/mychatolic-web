import { redirect } from "next/navigation";

export default function LegacyBiblePreviewPage() {
  redirect("/dashboard/bible/studio?tab=preview");
}
