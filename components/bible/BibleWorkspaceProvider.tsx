"use client";

import { createContext, useContext, useMemo } from "react";
import { buildBibleDisplayName } from "@/components/bible/constants";

type BibleWorkspaceContextValue = {
  lang: string;
  version: string;
  displayName: string;
  scopeKey: string;
};

const BibleWorkspaceContext = createContext<BibleWorkspaceContextValue | null>(null);

function normalizeLang(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeVersion(value: string): string {
  return value.trim().toUpperCase();
}

export function BibleWorkspaceProvider({
  lang: rawLang,
  version: rawVersion,
  children,
}: {
  lang: string;
  version: string;
  children: React.ReactNode;
}) {
  const lang = normalizeLang(rawLang);
  const version = normalizeVersion(rawVersion);
  const value = useMemo(
    () => ({
      lang,
      version,
      displayName: buildBibleDisplayName(lang, version),
      scopeKey: `${lang}:${version}`,
    }),
    [lang, version],
  );

  return <BibleWorkspaceContext.Provider value={value}>{children}</BibleWorkspaceContext.Provider>;
}

export function useBibleWorkspace() {
  const context = useContext(BibleWorkspaceContext);
  if (!context) {
    throw new Error("useBibleWorkspace must be used within BibleWorkspaceProvider.");
  }
  return context;
}
