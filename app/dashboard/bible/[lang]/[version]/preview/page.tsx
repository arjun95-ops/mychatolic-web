import { redirect } from "next/navigation";

export default async function BiblePreviewPage({
  params,
}: {
  params: Promise<{ lang: string; version: string }>;
}) {
  const { lang, version } = await params;
  const query = new URLSearchParams({
    lang,
    version,
    tab: "preview",
  });
  redirect(`/dashboard/bible/studio?${query.toString()}`);
}
