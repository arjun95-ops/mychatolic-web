import { redirect } from "next/navigation";

export default async function BibleBooksPage({
  params,
}: {
  params: Promise<{ lang: string; version: string }>;
}) {
  const { lang, version } = await params;
  const query = new URLSearchParams({
    lang,
    version,
    tab: "ayat",
  });
  redirect(`/dashboard/bible/studio?${query.toString()}`);
}
