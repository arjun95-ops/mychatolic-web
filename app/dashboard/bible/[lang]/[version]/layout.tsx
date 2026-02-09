export default async function BibleVersionLayout({
  children,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string; version: string }>;
}) {
  return <>{children}</>;
}
