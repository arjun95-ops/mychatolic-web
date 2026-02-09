export type BibleGrouping = "old" | "new" | "deutero";

export type StudioCategory = "Perjanjian Lama" | "Perjanjian Baru" | "Deuterokanonika";

export type StudioTab = "ayat" | "perikop" | "qc" | "bulk-import" | "preview";

export type WorkspaceOption = {
  label: string;
  lang: string;
  version: string;
};

export type BookItem = {
  id: string;
  name: string;
  abbreviation: string | null;
  grouping: BibleGrouping;
  order_index: number;
};

export type ChapterItem = {
  id: string;
  chapter_number: number;
};

export type VerseItem = {
  id: string;
  chapter_id: string;
  verse_number: number;
  text: string;
  pericope: string | null;
};

export const CATEGORY_OPTIONS: StudioCategory[] = [
  "Perjanjian Lama",
  "Perjanjian Baru",
  "Deuterokanonika",
];

export const STUDIO_TAB_OPTIONS: Array<{ key: StudioTab; label: string }> = [
  { key: "ayat", label: "Ayat" },
  { key: "perikop", label: "Perikop" },
  { key: "qc", label: "QC" },
  { key: "bulk-import", label: "Bulk Import" },
  { key: "preview", label: "Preview" },
];

export const WORKSPACE_OPTIONS: WorkspaceOption[] = [
  { label: "Indonesia TB1", lang: "id", version: "TB1" },
  { label: "Indonesia TB2", lang: "id", version: "TB2" },
  { label: "English", lang: "en", version: "EN1" },
];

export const GROUPING_LABELS: Record<BibleGrouping, StudioCategory> = {
  old: "Perjanjian Lama",
  new: "Perjanjian Baru",
  deutero: "Deuterokanonika",
};

export const CATEGORY_TO_GROUPING: Record<StudioCategory, BibleGrouping> = {
  "Perjanjian Lama": "old",
  "Perjanjian Baru": "new",
  Deuterokanonika: "deutero",
};
