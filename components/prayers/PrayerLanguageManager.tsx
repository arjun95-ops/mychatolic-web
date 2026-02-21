"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Search, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { supabase } from "@/lib/supabaseClient";

type PrayerLanguageRow = {
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

type LanguageFormState = {
  code: string;
  name: string;
  sortOrder: string;
  isActive: boolean;
};

const EMPTY_FORM: LanguageFormState = {
  code: "",
  name: "",
  sortOrder: "10",
  isActive: true,
};

function normalizeLanguageCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}

function normalizeSortOrder(raw: string, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
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

function getNextSortOrder(rows: PrayerLanguageRow[]): number {
  const currentMax = rows.reduce((max, item) => Math.max(max, item.sort_order || 0), 0);
  return currentMax + 10;
}

export default function PrayerLanguageManager() {
  const PAGE_SIZE = 8;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [languages, setLanguages] = useState<PrayerLanguageRow[]>([]);
  const [translationStats, setTranslationStats] = useState<
    Record<string, { total: number; published: number }>
  >({});
  const [selectedCode, setSelectedCode] = useState("");

  const [newForm, setNewForm] = useState<LanguageFormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<LanguageFormState>(EMPTY_FORM);

  const selectedLanguage = useMemo(
    () => languages.find((item) => item.code === selectedCode) ?? null,
    [languages, selectedCode]
  );

  const filteredLanguages = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized) return languages;
    return languages.filter((item) => {
      return item.code.toLowerCase().includes(normalized) || item.name.toLowerCase().includes(normalized);
    });
  }, [languages, searchQuery]);

  const totalPages = useMemo(() => {
    if (filteredLanguages.length === 0) return 1;
    return Math.ceil(filteredLanguages.length / PAGE_SIZE);
  }, [filteredLanguages.length, PAGE_SIZE]);

  const paginatedLanguages = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredLanguages.slice(start, start + PAGE_SIZE);
  }, [filteredLanguages, currentPage, PAGE_SIZE]);

  const overallStats = useMemo(() => {
    const values = Object.values(translationStats);
    return values.reduce(
      (acc, item) => {
        acc.total += item.total;
        acc.published += item.published;
        return acc;
      },
      { total: 0, published: 0 }
    );
  }, [translationStats]);

  const loadLanguages = async () => {
    setLoading(true);
    try {
      const [languagesRes, translationsRes] = await Promise.all([
        supabase
          .from("prayer_languages")
          .select("code, name, sort_order, is_active")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase.from("prayer_translations").select("language_code, is_published"),
      ]);

      if (languagesRes.error) throw languagesRes.error;
      if (translationsRes.error) throw translationsRes.error;

      const rows = (languagesRes.data || []) as PrayerLanguageRow[];
      setLanguages(rows);
      setSelectedCode((current) => current || rows[0]?.code || "");
      setNewForm((prev) => ({ ...prev, sortOrder: String(getNextSortOrder(rows)) }));

      const statsMap: Record<string, { total: number; published: number }> = {};
      for (const row of translationsRes.data || []) {
        const code = String(row.language_code || "").trim();
        if (!code) continue;
        if (!statsMap[code]) {
          statsMap[code] = { total: 0, published: 0 };
        }
        statsMap[code].total += 1;
        if (row.is_published === true) {
          statsMap[code].published += 1;
        }
      }
      setTranslationStats(statsMap);
    } catch (error: unknown) {
      toast.error(safeErrorMessage(error, "Gagal memuat data bahasa doa."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLanguages();
  }, []);

  useEffect(() => {
    if (!selectedLanguage) {
      setEditForm(EMPTY_FORM);
      return;
    }
    setEditForm({
      code: selectedLanguage.code,
      name: selectedLanguage.name,
      sortOrder: String(selectedLanguage.sort_order),
      isActive: selectedLanguage.is_active,
    });
  }, [selectedLanguage]);

  useEffect(() => {
    if (!selectedCode && languages.length > 0) {
      setSelectedCode(languages[0].code);
    }
  }, [languages, selectedCode]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleCreateLanguage = async () => {
    const code = normalizeLanguageCode(newForm.code);
    const name = newForm.name.trim();
    const sortOrder = normalizeSortOrder(newForm.sortOrder, getNextSortOrder(languages));

    if (!code) {
      toast.error("Kode bahasa wajib diisi.");
      return;
    }
    if (!name) {
      toast.error("Nama bahasa wajib diisi.");
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("prayer_languages")
        .insert({
          code,
          name,
          sort_order: sortOrder,
          is_active: newForm.isActive,
        })
        .select("code, name, sort_order, is_active")
        .single();

      if (error) throw error;

      const created = data as PrayerLanguageRow;
      const nextRows = [...languages, created].sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.name.localeCompare(b.name);
      });
      setLanguages(nextRows);
      setSelectedCode(created.code);
      setNewForm({
        ...EMPTY_FORM,
        sortOrder: String(getNextSortOrder(nextRows)),
      });
      setTranslationStats((prev) => ({
        ...prev,
        [created.code]: prev[created.code] || { total: 0, published: 0 },
      }));

      toast.success("Bahasa baru berhasil ditambahkan.");
    } catch (error: unknown) {
      toast.error(safeErrorMessage(error, "Gagal menambah bahasa."));
    } finally {
      setCreating(false);
    }
  };

  const handleSaveLanguage = async () => {
    if (!selectedLanguage) {
      toast.error("Pilih bahasa terlebih dahulu.");
      return;
    }

    const name = editForm.name.trim();
    const sortOrder = normalizeSortOrder(editForm.sortOrder, selectedLanguage.sort_order);

    if (!name) {
      toast.error("Nama bahasa wajib diisi.");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("prayer_languages")
        .update({
          name,
          sort_order: sortOrder,
          is_active: editForm.isActive,
        })
        .eq("code", selectedLanguage.code)
        .select("code, name, sort_order, is_active")
        .single();

      if (error) throw error;

      const updated = data as PrayerLanguageRow;
      setLanguages((prev) => {
        const next = prev.map((item) => (item.code === updated.code ? updated : item));
        return next.sort((a, b) => {
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return a.name.localeCompare(b.name);
        });
      });

      toast.success("Bahasa berhasil diperbarui.");
    } catch (error: unknown) {
      toast.error(safeErrorMessage(error, "Gagal menyimpan bahasa."));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLanguage = async () => {
    if (!selectedLanguage) {
      toast.error("Pilih bahasa terlebih dahulu.");
      return;
    }

    const accepted = window.confirm(
      `Hapus bahasa "${selectedLanguage.name}" (${selectedLanguage.code})?\nTerjemahan doa yang memakai bahasa ini mungkin perlu dihapus dulu.`
    );
    if (!accepted) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from("prayer_languages")
        .delete()
        .eq("code", selectedLanguage.code);

      if (error) throw error;

      const nextRows = languages.filter((item) => item.code !== selectedLanguage.code);
      setLanguages(nextRows);
      setSelectedCode(nextRows[0]?.code || "");
      setNewForm((prev) => ({ ...prev, sortOrder: String(getNextSortOrder(nextRows)) }));
      setTranslationStats((prev) => {
        const next = { ...prev };
        delete next[selectedLanguage.code];
        return next;
      });

      toast.success("Bahasa berhasil dihapus.");
    } catch (error: unknown) {
      toast.error(
        safeErrorMessage(
          error,
          "Gagal menghapus bahasa. Pastikan tidak ada terjemahan doa yang masih memakai bahasa ini."
        )
      );
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[55vh] flex items-center justify-center">
        <div className="flex items-center gap-2 text-text-secondary">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Memuat daftar bahasa...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-text-primary tracking-tight">Bahasa Doa</h1>
        <p className="text-sm text-text-secondary">
          Kelola bahasa yang tersedia untuk input konten doa manual di menu Kumpulan Doa.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px,1fr]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-surface-secondary bg-surface-primary p-4 shadow-sm">
            <h2 className="text-base font-bold text-text-primary">Tambah Bahasa Baru</h2>
            <p className="text-xs text-text-secondary mt-1">
              Gunakan kode standar (contoh: id, en, fr, ja, ko).
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Kode</label>
                <input
                  type="text"
                  value={newForm.code}
                  onChange={(event) =>
                    setNewForm((prev) => ({ ...prev, code: normalizeLanguageCode(event.target.value) }))
                  }
                  placeholder="id"
                  className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Nama</label>
                <input
                  type="text"
                  value={newForm.name}
                  onChange={(event) => setNewForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Indonesia"
                  className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Urutan</label>
                <input
                  type="number"
                  min={0}
                  value={newForm.sortOrder}
                  onChange={(event) => setNewForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                  className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action/30"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={newForm.isActive}
                  onChange={(event) => setNewForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                  className="h-4 w-4 rounded border-surface-secondary text-action focus:ring-action/30"
                />
                Aktifkan bahasa ini
              </label>

              <button
                type="button"
                onClick={() => void handleCreateLanguage()}
                disabled={creating}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand-primary text-text-inverse px-4 py-2.5 text-sm font-semibold hover:bg-brand-primary/90 disabled:opacity-60"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Tambah Bahasa
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-surface-secondary bg-surface-primary p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-text-primary">Daftar Bahasa</h2>
              <span className="text-xs text-text-secondary">{filteredLanguages.length} item</span>
            </div>

            <div className="mt-3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Cari kode atau nama bahasa"
                className="w-full rounded-lg border border-surface-secondary bg-surface-primary pl-9 pr-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action/30"
              />
            </div>

            <div className="mt-3 max-h-[520px] overflow-auto space-y-2 pr-1">
              {filteredLanguages.length === 0 ? (
                <p className="text-sm text-text-secondary py-3">Bahasa tidak ditemukan.</p>
              ) : (
                paginatedLanguages.map((item) => {
                  const stats = translationStats[item.code] || { total: 0, published: 0 };
                  return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setSelectedCode(item.code)}
                    className={`w-full text-left rounded-xl border px-3 py-3 transition ${item.code === selectedCode
                        ? "border-action bg-action/10"
                        : "border-surface-secondary hover:border-action/50 hover:bg-surface-secondary/40"
                      }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-text-primary line-clamp-1">{item.name}</p>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full ${item.is_active
                            ? "bg-status-success/15 text-status-success"
                            : "bg-status-error/10 text-status-error"
                          }`}
                      >
                        {item.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary mt-1">{item.code}</p>
                    <p className="text-[11px] text-text-secondary mt-1">Urutan: {item.sort_order}</p>
                    <p className="text-[11px] text-text-secondary mt-1">
                      Terjemahan: {stats.total} total • {stats.published} publish
                    </p>
                  </button>
                );
                })
              )}
            </div>

            {filteredLanguages.length > 0 ? (
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

        <section>
          {!selectedLanguage ? (
            <div className="rounded-2xl border border-surface-secondary bg-surface-primary p-8 text-center text-text-secondary">
              Pilih salah satu bahasa dari daftar di sebelah kiri.
            </div>
          ) : (
            <div className="rounded-2xl border border-surface-secondary bg-surface-primary p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-text-primary">Detail Bahasa</h2>
                  <p className="text-xs text-text-secondary">Edit nama, urutan, dan status aktif bahasa.</p>
                  <p className="text-xs text-text-secondary mt-1">
                    Terjemahan bahasa ini:{" "}
                    <span className="font-semibold text-text-primary">
                      {translationStats[selectedLanguage.code]?.total || 0}
                    </span>{" "}
                    total,{" "}
                    <span className="font-semibold text-text-primary">
                      {translationStats[selectedLanguage.code]?.published || 0}
                    </span>{" "}
                    publish.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleDeleteLanguage()}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 rounded-lg border border-status-error/40 px-3 py-2 text-xs font-semibold text-status-error hover:bg-status-error/10 disabled:opacity-60"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Hapus Bahasa
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">Kode</label>
                  <input
                    type="text"
                    value={editForm.code}
                    disabled
                    className="w-full rounded-lg border border-surface-secondary bg-surface-secondary/40 px-3 py-2 text-sm text-text-secondary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">Nama</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                    className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">Urutan</label>
                  <input
                    type="number"
                    min={0}
                    value={editForm.sortOrder}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                    className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action/30"
                  />
                </div>

                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2 text-sm text-text-primary">
                    <input
                      type="checkbox"
                      checked={editForm.isActive}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                      className="h-4 w-4 rounded border-surface-secondary text-action focus:ring-action/30"
                    />
                    Tampilkan untuk pilihan bahasa user
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleSaveLanguage()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-action text-text-inverse px-4 py-2.5 text-sm font-semibold hover:bg-action/90 disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan Bahasa
              </button>
            </div>
          )}
        </section>
      </div>

      <div className="rounded-xl border border-surface-secondary bg-surface-primary px-4 py-3 text-xs text-text-secondary">
        Statistik keseluruhan:{" "}
        <span className="font-semibold text-text-primary">{overallStats.total}</span> terjemahan,{" "}
        <span className="font-semibold text-text-primary">{overallStats.published}</span> publish.
      </div>
    </div>
  );
}
