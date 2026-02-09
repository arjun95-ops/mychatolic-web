"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText, ChevronRight, FileSpreadsheet, LibraryBig, NotebookPen } from "lucide-react";
import { ToastProvider } from "@/components/ui/Toast";
import { BibleWorkspaceProvider, useBibleWorkspace } from "@/components/bible/BibleWorkspaceProvider";

const TABS = [
  { key: "books", label: "Kelola Kitab", icon: LibraryBig },
  { key: "verses", label: "Kelola Ayat", icon: NotebookPen },
  { key: "import", label: "Import Excel", icon: FileSpreadsheet },
  { key: "preview", label: "Preview", icon: BookOpenText },
] as const;

function BibleWorkspaceShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { lang, version, displayName } = useBibleWorkspace();
  const basePath = `/dashboard/bible/${lang}/${version}`;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <Link href="/dashboard" className="hover:text-action">
          Dashboard
        </Link>
        <ChevronRight size={14} />
        <Link href="/dashboard/bible" className="hover:text-action">
          Alkitab
        </Link>
        <ChevronRight size={14} />
        <span className="font-semibold text-text-primary">{displayName}</span>
      </div>

      <div className="rounded-2xl border border-surface-secondary bg-surface-primary p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Workspace Alkitab</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Scope aktif: <span className="font-semibold">{lang.toUpperCase()}</span> /{" "}
              <span className="font-semibold">{version}</span>
            </p>
          </div>
          <div className="rounded-xl border border-surface-secondary bg-surface-secondary/30 px-4 py-2 text-sm text-text-secondary">
            Data terpisah otomatis berdasarkan bahasa + versi.
          </div>
        </div>

        <div className="mt-5 border-b border-surface-secondary">
          <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => {
              const href = `${basePath}/${tab.key}`;
              const active = pathname === href || pathname.startsWith(`${href}/`);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.key}
                  href={href}
                  className={`inline-flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-semibold transition ${
                    active
                      ? "bg-action text-text-inverse"
                      : "text-text-secondary hover:bg-surface-secondary/70 hover:text-text-primary"
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}

export default function BibleWorkspaceShell({
  lang,
  version,
  children,
}: {
  lang: string;
  version: string;
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <BibleWorkspaceProvider lang={lang} version={version}>
        <BibleWorkspaceShellInner>{children}</BibleWorkspaceShellInner>
      </BibleWorkspaceProvider>
    </ToastProvider>
  );
}
