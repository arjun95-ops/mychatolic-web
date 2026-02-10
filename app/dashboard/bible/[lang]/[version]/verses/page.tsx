import { redirect } from "next/navigation";
import { getDeprecatedBibleWorkspaceTarget } from "@/lib/bible-admin";

export default async function BibleVersesPage({
  params,
}: {
  params: Promise<{ lang: string; version: string }>;
}) {
  const { lang, version } = await params;
  const redirected = getDeprecatedBibleWorkspaceTarget(lang, version);
  const query = new URLSearchParams({
    lang: redirected?.languageCode || lang,
    version: redirected?.versionCode || version,
    tab: "ayat",
  });
  redirect(`/dashboard/bible/studio?${query.toString()}`);
}
