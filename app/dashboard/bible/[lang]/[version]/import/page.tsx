import { redirect } from "next/navigation";

export default async function BibleImportPage({
  params,
}: {
  params: Promise<{ lang: string; version: string }>;
}) {
  const { lang, version } = await params;
  const query = new URLSearchParams({
    lang,
    version,
    tab: "bulk-import",
  });
  redirect(`/dashboard/bible/studio?${query.toString()}`);
}
