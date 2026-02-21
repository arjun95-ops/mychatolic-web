"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Search, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { supabase } from "@/lib/supabaseClient";

type PrayerRow = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type PrayerLanguageRow = {
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

type PrayerTranslationRow = {
  id: string;
  prayer_id: string;
  language_code: string;
  title: string;
  content: string;
  source_note: string | null;
  is_published: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type PrayerFormState = {
  name: string;
  slug: string;
  sortOrder: string;
  isActive: boolean;
};

type TranslationEditorState = {
  title: string;
  content: string;
  sourceNote: string;
  isPublished: boolean;
};

const EMPTY_PRAYER_FORM: PrayerFormState = {
  name: "",
  slug: "",
  sortOrder: "1",
  isActive: true,
};

const EMPTY_TRANSLATION_EDITOR: TranslationEditorState = {
  title: "",
  content: "",
  sourceNote: "",
  isPublished: true,
};

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function safeErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function normalizeSortOrder(raw: string, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function getNextSortOrder(prayers: PrayerRow[]): number {
  const currentMax = prayers.reduce((max, item) => Math.max(max, item.sort_order || 0), 0);
  return currentMax + 1;
}

export default function PrayerManager() {
  const PAGE_SIZE = 8;

  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingTranslations, setLoadingTranslations] = useState(false);
  const [savingPrayer, setSavingPrayer] = useState(false);
  const [creatingPrayer, setCreatingPrayer] = useState(false);
  const [deletingPrayer, setDeletingPrayer] = useState(false);
  const [savingTranslation, setSavingTranslation] = useState(false);
  const [deletingTranslation, setDeletingTranslation] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [prayers, setPrayers] = useState<PrayerRow[]>([]);
  const [languages, setLanguages] = useState<PrayerLanguageRow[]>([]);
  const [translations, setTranslations] = useState<PrayerTranslationRow[]>([]);

  const [selectedPrayerId, setSelectedPrayerId] = useState<string>("");
  const [selectedLanguageCode, setSelectedLanguageCode] = useState<string>("");

  const [newPrayerName, setNewPrayerName] = useState("");
  const [newPrayerSlug, setNewPrayerSlug] = useState("");
  const [newPrayerSortOrder, setNewPrayerSortOrder] = useState("1");
  const [newPrayerIsActive, setNewPrayerIsActive] = useState(true);
  const [newPrayerSlugTouched, setNewPrayerSlugTouched] = useState(false);

  const [prayerForm, setPrayerForm] = useState<PrayerFormState>(EMPTY_PRAYER_FORM);
  const [translationEditor, setTranslationEditor] = useState<TranslationEditorState>(EMPTY_TRANSLATION_EDITOR);

  const selectedPrayer = useMemo(
    () => prayers.find((item) => item.id === selectedPrayerId) ?? null,
    [prayers, selectedPrayerId]
  );

  const selectedTranslation = useMemo(
    () =>
      translations.find(
        (item) => item.prayer_id === selectedPrayerId && item.language_code === selectedLanguageCode
      ) ?? null,
    [translations, selectedPrayerId, selectedLanguageCode]
  );

  const translationLanguageSet = useMemo(() => {
    return new Set(translations.map((item) => item.language_code));
  }, [translations]);

  const sortedLanguageOptions = useMemo(() => {
    return [...languages].sort((a, b) => {
      const aHasTranslation = translationLanguageSet.has(a.code) ? 1 : 0;
      const bHasTranslation = translationLanguageSet.has(b.code) ? 1 : 0;
      if (aHasTranslation !== bHasTranslation) {
        return bHasTranslation - aHasTranslation;
      }
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      return a.name.localeCompare(b.name);
    });
  }, [languages, translationLanguageSet]);

  const availableLanguageCount = useMemo(
    () => translations.filter((item) => item.is_published).length,
    [translations]
  );

  const filteredPrayers = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    return prayers.filter((item) => {
      if (statusFilter === "active" && !item.is_active) return false;
      if (statusFilter === "inactive" && item.is_active) return false;
      if (!normalized) return true;
      return item.name.toLowerCase().includes(normalized) || item.slug.toLowerCase().includes(normalized);
    });
  }, [prayers, searchQuery, statusFilter]);

  const totalPages = useMemo(() => {
    if (filteredPrayers.length === 0) return 1;
    return Math.ceil(filteredPrayers.length / PAGE_SIZE);
  }, [filteredPrayers.length, PAGE_SIZE]);

  const paginatedPrayers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredPrayers.slice(start, start + PAGE_SIZE);
  }, [filteredPrayers, currentPage, PAGE_SIZE]);

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const [prayerRes, languageRes] = await Promise.all([
        supabase
          .from("prayers")
          .select("id, slug, name, sort_order, is_active, created_at, updated_at")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("prayer_languages")
          .select("code, name, sort_order, is_active")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
      ]);

      if (prayerRes.error) throw prayerRes.error;
      if (languageRes.error) throw languageRes.error;

      const prayerRows = (prayerRes.data || []) as PrayerRow[];
      const languageRows = (languageRes.data || []) as PrayerLanguageRow[];

      setPrayers(prayerRows);
      setLanguages(languageRows);

      const nextSort = getNextSortOrder(prayerRows);
      setNewPrayerSortOrder(String(nextSort));

      const fallbackLanguageCode =
        (
          languageRows.find((lang) => lang.code === "id" && lang.is_active) ??
          languageRows.find((lang) => lang.is_active) ??
          languageRows[0]
        )?.code || "";

      setSelectedPrayerId((current) => current || prayerRows[0]?.id || "");
      setSelectedLanguageCode((current) => {
        if (current && languageRows.some((lang) => lang.code === current)) {
          return current;
        }
        return fallbackLanguageCode;
      });
    } catch (error: unknown) {
      const message = safeErrorMessage(error, "Gagal memuat data katalog doa.");
      toast.error(message);
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  const loadTranslations = useCallback(
    async (prayerId: string) => {
      setLoadingTranslations(true);
      try {
        const { data, error } = await supabase
          .from("prayer_translations")
          .select(
            "id, prayer_id, language_code, title, content, source_note, is_published, created_at, updated_at"
          )
          .eq("prayer_id", prayerId)
          .order("language_code", { ascending: true });

        if (error) throw error;

        setTranslations((data || []) as PrayerTranslationRow[]);
      } catch (error: unknown) {
        const message = safeErrorMessage(error, "Gagal memuat terjemahan doa.");
        toast.error(message);
        setTranslations([]);
      } finally {
        setLoadingTranslations(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!selectedPrayerId) {
      setTranslations([]);
      return;
    }
    void loadTranslations(selectedPrayerId);
  }, [selectedPrayerId, loadTranslations]);

  useEffect(() => {
    if (!selectedPrayer && prayers.length > 0) {
      setSelectedPrayerId(prayers[0].id);
    }
  }, [selectedPrayer, prayers]);

  useEffect(() => {
    if (!selectedPrayerId) return;

    setSelectedLanguageCode((current) => {
      if (current && translations.some((item) => item.language_code === current)) {
        return current;
      }

      const translationPreferred =
        translations.find((item) => item.language_code === "id")?.language_code ??
        translations[0]?.language_code;

      if (translationPreferred) {
        return translationPreferred;
      }

      const catalogPreferred =
        (
          languages.find((lang) => lang.code === "id" && lang.is_active) ??
          languages.find((lang) => lang.is_active) ??
          languages[0]
        )?.code || "";

      return catalogPreferred;
    });
  }, [translations, languages, selectedPrayerId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!selectedPrayer) {
      setPrayerForm(EMPTY_PRAYER_FORM);
      return;
    }
    setPrayerForm({
      name: selectedPrayer.name,
      slug: selectedPrayer.slug,
      sortOrder: String(selectedPrayer.sort_order),
      isActive: selectedPrayer.is_active,
    });
  }, [selectedPrayer]);

  useEffect(() => {
    if (!languages.length) return;
    if (!selectedLanguageCode) {
      const firstLanguage = languages.find((lang) => lang.is_active) ?? languages[0];
      if (firstLanguage) {
        setSelectedLanguageCode(firstLanguage.code);
      }
      return;
    }

    const exists = languages.some((lang) => lang.code === selectedLanguageCode);
    if (!exists) {
      const firstLanguage = languages.find((lang) => lang.is_active) ?? languages[0];
      if (firstLanguage) {
        setSelectedLanguageCode(firstLanguage.code);
      }
    }
  }, [languages, selectedLanguageCode]);

  useEffect(() => {
    if (selectedTranslation) {
      setTranslationEditor({
        title: selectedTranslation.title || "",
        content: selectedTranslation.content || "",
        sourceNote: selectedTranslation.source_note || "",
        isPublished: selectedTranslation.is_published,
      });
      return;
    }

    setTranslationEditor({
      title: selectedPrayer?.name || "",
      content: "",
      sourceNote: "",
      isPublished: true,
    });
  }, [selectedPrayer?.id, selectedPrayer?.name, selectedTranslation]);

  const handleCreatePrayer = async () => {
    const normalizedName = newPrayerName.trim();
    const normalizedSlug = toSlug(newPrayerSlug || normalizedName);
    const fallbackSort = getNextSortOrder(prayers);
    const normalizedSortOrder = normalizeSortOrder(newPrayerSortOrder, fallbackSort);

    if (!normalizedName) {
      toast.error("Nama doa wajib diisi.");
      return;
    }

    if (!normalizedSlug) {
      toast.error("Slug tidak valid.");
      return;
    }

    setCreatingPrayer(true);
    try {
      const { data, error } = await supabase
        .from("prayers")
        .insert({
          name: normalizedName,
          slug: normalizedSlug,
          sort_order: normalizedSortOrder,
          is_active: newPrayerIsActive,
        })
        .select("id, slug, name, sort_order, is_active, created_at, updated_at")
        .single();

      if (error) throw error;

      const createdPrayer = data as PrayerRow;
      const nextPrayers = [...prayers, createdPrayer].sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.name.localeCompare(b.name);
      });

      setPrayers(nextPrayers);
      setSelectedPrayerId(createdPrayer.id);
      setNewPrayerName("");
      setNewPrayerSlug("");
      setNewPrayerSlugTouched(false);
      setNewPrayerIsActive(true);
      setNewPrayerSortOrder(String(getNextSortOrder(nextPrayers)));

      toast.success("Doa baru berhasil ditambahkan.");
    } catch (error: unknown) {
      const message = safeErrorMessage(error, "Gagal menambah doa.");
      toast.error(message);
    } finally {
      setCreatingPrayer(false);
    }
  };

  const handleSavePrayer = async () => {
    if (!selectedPrayer) {
      toast.error("Pilih doa terlebih dahulu.");
      return;
    }

    const normalizedName = prayerForm.name.trim();
    const normalizedSlug = toSlug(prayerForm.slug || prayerForm.name);
    const normalizedSortOrder = normalizeSortOrder(prayerForm.sortOrder, selectedPrayer.sort_order);

    if (!normalizedName) {
      toast.error("Nama doa wajib diisi.");
      return;
    }

    if (!normalizedSlug) {
      toast.error("Slug tidak valid.");
      return;
    }

    setSavingPrayer(true);
    try {
      const { data, error } = await supabase
        .from("prayers")
        .update({
          name: normalizedName,
          slug: normalizedSlug,
          sort_order: normalizedSortOrder,
          is_active: prayerForm.isActive,
        })
        .eq("id", selectedPrayer.id)
        .select("id, slug, name, sort_order, is_active, created_at, updated_at")
        .single();

      if (error) throw error;

      const updatedPrayer = data as PrayerRow;
      setPrayers((prev) => {
        const next = prev.map((item) => (item.id === updatedPrayer.id ? updatedPrayer : item));
        return next.sort((a, b) => {
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return a.name.localeCompare(b.name);
        });
      });

      toast.success("Data doa berhasil diperbarui.");
    } catch (error: unknown) {
      const message = safeErrorMessage(error, "Gagal menyimpan perubahan doa.");
      toast.error(message);
    } finally {
      setSavingPrayer(false);
    }
  };

  const handleDeletePrayer = async (targetPrayer?: PrayerRow) => {
    const prayerToDelete = targetPrayer ?? selectedPrayer;
    if (!prayerToDelete) {
      toast.error("Pilih doa terlebih dahulu.");
      return;
    }

    const accepted = window.confirm(
      `Hapus doa "${prayerToDelete.name}"?\nSemua terjemahan untuk doa ini juga akan terhapus.`
    );
    if (!accepted) return;

    setDeletingPrayer(true);
    try {
      const { error } = await supabase.from("prayers").delete().eq("id", prayerToDelete.id);
      if (error) throw error;

      const remainingPrayers = prayers.filter((item) => item.id !== prayerToDelete.id);
      setPrayers(remainingPrayers);

      if (selectedPrayerId === prayerToDelete.id) {
        setTranslations([]);
        setSelectedPrayerId(remainingPrayers[0]?.id || "");
      }
      setNewPrayerSortOrder(String(getNextSortOrder(remainingPrayers)));

      toast.success("Doa berhasil dihapus.");
    } catch (error: unknown) {
      const message = safeErrorMessage(error, "Gagal menghapus doa.");
      toast.error(message);
    } finally {
      setDeletingPrayer(false);
    }
  };

  const handleSaveTranslation = async () => {
    if (!selectedPrayer) {
      toast.error("Pilih doa terlebih dahulu.");
      return;
    }
    if (!selectedLanguageCode) {
      toast.error("Pilih bahasa terlebih dahulu.");
      return;
    }

    const title = translationEditor.title.trim();
    const content = translationEditor.content.trim();
    const sourceNote = translationEditor.sourceNote.trim();

    if (!title) {
      toast.error("Judul terjemahan wajib diisi.");
      return;
    }
    if (!content) {
      toast.error("Isi doa wajib diisi.");
      return;
    }

    setSavingTranslation(true);
    try {
      const payload = {
        prayer_id: selectedPrayer.id,
        language_code: selectedLanguageCode,
        title,
        content,
        source_note: sourceNote || null,
        is_published: translationEditor.isPublished,
      };

      const { data, error } = await supabase
        .from("prayer_translations")
        .upsert(payload, { onConflict: "prayer_id,language_code" })
        .select(
          "id, prayer_id, language_code, title, content, source_note, is_published, created_at, updated_at"
        )
        .single();

      if (error) throw error;

      const saved = data as PrayerTranslationRow;
      setTranslations((prev) => {
        const existingIndex = prev.findIndex(
          (item) => item.prayer_id === saved.prayer_id && item.language_code === saved.language_code
        );
        if (existingIndex < 0) {
          return [...prev, saved].sort((a, b) => a.language_code.localeCompare(b.language_code));
        }
        const next = [...prev];
        next[existingIndex] = saved;
        return next.sort((a, b) => a.language_code.localeCompare(b.language_code));
      });

      toast.success("Terjemahan doa berhasil disimpan.");
    } catch (error: unknown) {
      const message = safeErrorMessage(error, "Gagal menyimpan terjemahan.");
      toast.error(message);
    } finally {
      setSavingTranslation(false);
    }
  };

  const handleDeleteTranslation = async () => {
    if (!selectedTranslation) {
      toast.error("Terjemahan belum ada untuk bahasa ini.");
      return;
    }

    const accepted = window.confirm(
      `Hapus terjemahan "${selectedTranslation.title}" (${selectedTranslation.language_code})?`
    );
    if (!accepted) return;

    setDeletingTranslation(true);
    try {
      const { error } = await supabase
        .from("prayer_translations")
        .delete()
        .eq("id", selectedTranslation.id);

      if (error) throw error;

      setTranslations((prev) => prev.filter((item) => item.id !== selectedTranslation.id));
      toast.success("Terjemahan berhasil dihapus.");
    } catch (error: unknown) {
      const message = safeErrorMessage(error, "Gagal menghapus terjemahan.");
      toast.error(message);
    } finally {
      setDeletingTranslation(false);
    }
  };

  const refreshCurrentPrayerTranslations = async () => {
    if (!selectedPrayerId) return;
    await loadTranslations(selectedPrayerId);
    toast.success("Data terjemahan diperbarui.");
  };

  if (loadingCatalog) {
    return (
      <div className="min-h-[55vh] flex items-center justify-center">
        <div className="flex items-center gap-2 text-text-secondary">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Memuat katalog doa...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-text-primary tracking-tight">Kumpulan Doa</h1>
        <p className="text-sm text-text-secondary">
          Kelola daftar doa dan konten doa per bahasa. Semua isi doa diinput manual oleh admin.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px,1fr]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-surface-secondary bg-surface-primary p-4 shadow-sm">
            <h2 className="text-base font-bold text-text-primary">Tambah Doa Baru</h2>
            <p className="text-xs text-text-secondary mt-1">
              Tambah judul doa baru ke katalog Domus.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Nama Doa</label>
                <input
                  type="text"
                  value={newPrayerName}
                  onChange={(event) => {
                    const value = event.target.value;
                    setNewPrayerName(value);
                    if (!newPrayerSlugTouched) {
                      setNewPrayerSlug(toSlug(value));
                    }
                  }}
                  placeholder="Contoh: Doa Syukur"
                  className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Slug</label>
                <input
                  type="text"
                  value={newPrayerSlug}
                  onChange={(event) => {
                    setNewPrayerSlugTouched(true);
                    setNewPrayerSlug(toSlug(event.target.value));
                  }}
                  placeholder="doa-syukur"
                  className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Urutan</label>
                <input
                  type="number"
                  min={0}
                  value={newPrayerSortOrder}
                  onChange={(event) => setNewPrayerSortOrder(event.target.value)}
                  className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action/30"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={newPrayerIsActive}
                  onChange={(event) => setNewPrayerIsActive(event.target.checked)}
                  className="h-4 w-4 rounded border-surface-secondary text-action focus:ring-action/30"
                />
                Aktifkan doa ini
              </label>

              <button
                type="button"
                onClick={() => void handleCreatePrayer()}
                disabled={creatingPrayer}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand-primary text-text-inverse px-4 py-2.5 text-sm font-semibold hover:bg-brand-primary/90 disabled:opacity-60"
              >
                {creatingPrayer ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Tambah Doa
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-surface-secondary bg-surface-primary p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-text-primary">Daftar Doa</h2>
              <span className="text-xs text-text-secondary">{filteredPrayers.length} item</span>
            </div>

            <div className="mt-3 grid gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Cari nama atau slug doa"
                  className="w-full rounded-lg border border-surface-secondary bg-surface-primary pl-9 pr-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action/30"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}
                className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action/30"
              >
                <option value="all">Semua status</option>
                <option value="active">Aktif saja</option>
                <option value="inactive">Nonaktif saja</option>
              </select>
            </div>

            <div className="mt-3 max-h-[520px] overflow-auto space-y-2 pr-1">
              {filteredPrayers.length === 0 ? (
                <p className="text-sm text-text-secondary py-3">Doa tidak ditemukan.</p>
              ) : (
                paginatedPrayers.map((item) => (
                  <div
                    key={item.id}
                    className={`w-full rounded-xl border px-3 py-3 transition ${item.id === selectedPrayerId
                        ? "border-action bg-action/10"
                        : "border-surface-secondary hover:border-action/50 hover:bg-surface-secondary/40"
                      }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedPrayerId(item.id)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <p className="text-sm font-semibold text-text-primary line-clamp-1">{item.name}</p>
                        <p className="text-xs text-text-secondary mt-1">{item.slug}</p>
                        <p className="text-[11px] text-text-secondary mt-1">Urutan: {item.sort_order}</p>
                      </button>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${item.is_active
                              ? "bg-status-success/15 text-status-success"
                              : "bg-status-error/10 text-status-error"
                            }`}
                        >
                          {item.is_active ? "Aktif" : "Nonaktif"}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleDeletePrayer(item)}
                          disabled={deletingPrayer}
                          className="inline-flex items-center gap-1 rounded-md border border-status-error/30 px-2 py-1 text-[11px] font-semibold text-status-error hover:bg-status-error/10 disabled:opacity-60"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {filteredPrayers.length > 0 ? (
              <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                <span className="text-text-secondary">
                  Halaman {currentPage} / {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage <= 1}
                    className="rounded-md border border-surface-secondary px-2 py-1 text-text-secondary hover:text-text-primary disabled:opacity-50"
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage >= totalPages}
                    className="rounded-md border border-surface-secondary px-2 py-1 text-text-secondary hover:text-text-primary disabled:opacity-50"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-4">
          {!selectedPrayer ? (
            <div className="rounded-2xl border border-surface-secondary bg-surface-primary p-8 text-center text-text-secondary">
              Pilih salah satu doa dari daftar di sebelah kiri.
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-surface-secondary bg-surface-primary p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-text-primary">Detail Doa</h2>
                    <p className="text-xs text-text-secondary">
                      Edit metadata doa dan status aktif.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleDeletePrayer()}
                    disabled={deletingPrayer}
                    className="inline-flex items-center gap-2 rounded-lg border border-status-error/40 px-3 py-2 text-xs font-semibold text-status-error hover:bg-status-error/10 disabled:opacity-60"
                  >
                    {deletingPrayer ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Hapus Doa
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">Nama Doa</label>
                    <input
                      type="text"
                      value={prayerForm.name}
                      onChange={(event) =>
                        setPrayerForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action/30"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">Slug</label>
                    <input
                      type="text"
                      value={prayerForm.slug}
                      onChange={(event) =>
                        setPrayerForm((prev) => ({ ...prev, slug: toSlug(event.target.value) }))
                      }
                      className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action/30"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">Urutan</label>
                    <input
                      type="number"
                      min={0}
                      value={prayerForm.sortOrder}
                      onChange={(event) =>
                        setPrayerForm((prev) => ({ ...prev, sortOrder: event.target.value }))
                      }
                      className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action/30"
                    />
                  </div>

                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm text-text-primary">
                      <input
                        type="checkbox"
                        checked={prayerForm.isActive}
                        onChange={(event) =>
                          setPrayerForm((prev) => ({ ...prev, isActive: event.target.checked }))
                        }
                        className="h-4 w-4 rounded border-surface-secondary text-action focus:ring-action/30"
                      />
                      Tampilkan untuk user (aktif)
                    </label>
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => void handleSavePrayer()}
                    disabled={savingPrayer}
                    className="inline-flex items-center gap-2 rounded-lg bg-action text-text-inverse px-4 py-2.5 text-sm font-semibold hover:bg-action/90 disabled:opacity-60"
                  >
                    {savingPrayer ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Simpan Data Doa
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-surface-secondary bg-surface-primary p-5 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-text-primary">Terjemahan Doa</h2>
                    <p className="text-xs text-text-secondary">
                      Pilih bahasa, lalu isi doa manual untuk bahasa tersebut.
                    </p>
                  </div>

                  <div className="text-xs text-text-secondary">
                    {loadingTranslations ? "Memuat..." : `${availableLanguageCount} bahasa publish`}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[240px,1fr]">
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">Bahasa</label>
                    <select
                      value={selectedLanguageCode}
                      onChange={(event) => setSelectedLanguageCode(event.target.value)}
                      className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action/30"
                    >
                      {sortedLanguageOptions.map((language) => (
                        <option key={language.code} value={language.code}>
                          {language.name} ({language.code})
                          {translationLanguageSet.has(language.code) ? " • tersedia" : " • belum ada"}
                          {language.is_active ? "" : " - nonaktif"}
                        </option>
                      ))}
                    </select>
                    {selectedLanguageCode && !selectedTranslation ? (
                      <p className="text-[11px] text-status-error mt-1">
                        Teks doa untuk bahasa ini belum tersedia. Pilih bahasa lain atau isi teks baru.
                      </p>
                    ) : (
                      <p className="text-[11px] text-status-success mt-1">
                        Teks doa tersedia untuk bahasa ini.
                      </p>
                    )}
                  </div>

                  <div className="flex items-end justify-start md:justify-end">
                    <button
                      type="button"
                      onClick={() => void refreshCurrentPrayerTranslations()}
                      className="inline-flex items-center gap-2 rounded-lg border border-surface-secondary px-3 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary hover:border-action/40"
                    >
                      <Loader2 className={`w-4 h-4 ${loadingTranslations ? "animate-spin" : "hidden"}`} />
                      Refresh Terjemahan
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">Judul</label>
                    <input
                      type="text"
                      value={translationEditor.title}
                      onChange={(event) =>
                        setTranslationEditor((prev) => ({ ...prev, title: event.target.value }))
                      }
                      placeholder="Contoh: Tanda Salib"
                      className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action/30"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">Isi Doa</label>
                    <textarea
                      value={translationEditor.content}
                      onChange={(event) =>
                        setTranslationEditor((prev) => ({ ...prev, content: event.target.value }))
                      }
                      rows={14}
                      placeholder="Tulis isi doa lengkap di sini..."
                      className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action/30 resize-y"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">Catatan Sumber (opsional)</label>
                    <input
                      type="text"
                      value={translationEditor.sourceNote}
                      onChange={(event) =>
                        setTranslationEditor((prev) => ({ ...prev, sourceNote: event.target.value }))
                      }
                      placeholder="Contoh: Buku doa resmi paroki"
                      className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action/30"
                    />
                  </div>

                  <label className="inline-flex items-center gap-2 text-sm text-text-primary">
                    <input
                      type="checkbox"
                      checked={translationEditor.isPublished}
                      onChange={(event) =>
                        setTranslationEditor((prev) => ({ ...prev, isPublished: event.target.checked }))
                      }
                      className="h-4 w-4 rounded border-surface-secondary text-action focus:ring-action/30"
                    />
                    Publish untuk user
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSaveTranslation()}
                    disabled={savingTranslation || !selectedLanguageCode}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-primary text-text-inverse px-4 py-2.5 text-sm font-semibold hover:bg-brand-primary/90 disabled:opacity-60"
                  >
                    {savingTranslation ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Simpan Terjemahan
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDeleteTranslation()}
                    disabled={deletingTranslation || !selectedTranslation}
                    className="inline-flex items-center gap-2 rounded-lg border border-status-error/40 px-4 py-2.5 text-sm font-semibold text-status-error hover:bg-status-error/10 disabled:opacity-60"
                  >
                    {deletingTranslation ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Hapus Terjemahan
                  </button>
                </div>

                <div className="rounded-lg bg-surface-secondary/50 px-3 py-2 text-xs text-text-secondary">
                  {selectedTranslation ? (
                    <>
                      Terakhir diperbarui:{" "}
                      <span className="font-semibold text-text-primary">
                        {selectedTranslation.updated_at
                          ? new Date(selectedTranslation.updated_at).toLocaleString("id-ID")
                          : "-"}
                      </span>
                    </>
                  ) : (
                    <>Belum ada terjemahan untuk bahasa ini. Isi form lalu klik Simpan Terjemahan.</>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
