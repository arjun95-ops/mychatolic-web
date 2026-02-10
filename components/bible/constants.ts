export type BibleVersionLink = {
  code: string;
  label: string;
  href: string;
};

export type BibleLanguageCard = {
  languageCode: string;
  languageLabel: string;
  description: string;
  versions: BibleVersionLink[];
};

export const BIBLE_LANGUAGE_CARDS: BibleLanguageCard[] = [
  {
    languageCode: "id",
    languageLabel: "Bahasa Indonesia",
    description: "Versi resmi Indonesia untuk liturgi dan studi.",
    versions: [
      { code: "TB1", label: "TB1", href: "/dashboard/bible/id/TB1" },
      { code: "TB2", label: "TB2", href: "/dashboard/bible/id/TB2" },
    ],
  },
  {
    languageCode: "en",
    languageLabel: "English",
    description: "Workspace bahasa Inggris dengan struktur data terpisah.",
    versions: [
      {
        code: "EN1",
        label: "English",
        href: "/dashboard/bible/en/EN1",
      },
    ],
  },
];

export const BIBLE_LANGUAGE_LABELS: Record<string, string> = {
  id: "Indonesia",
  en: "English",
};

export function getBibleLanguageLabel(languageCode: string): string {
  return BIBLE_LANGUAGE_LABELS[languageCode] || languageCode.toUpperCase();
}

export function buildBibleDisplayName(languageCode: string, versionCode: string): string {
  return `${getBibleLanguageLabel(languageCode)} - ${versionCode}`;
}
