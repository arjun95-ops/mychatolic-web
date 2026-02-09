import { redirect } from "next/navigation";

export default async function BibleVersionRootPage({
  params,
}: {
  params: Promise<{ lang: string; version: string }>;
}) {
  const { lang, version } = await params;
  const query = new URLSearchParams({
    lang,
    version,
  });
  redirect(`/dashboard/bible/studio?${query.toString()}`);
}
