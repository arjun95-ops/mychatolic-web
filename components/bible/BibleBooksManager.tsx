"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Edit2, Loader2, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useBibleWorkspace } from "@/components/bible/BibleWorkspaceProvider";
import type { BibleGrouping } from "@/lib/bible-admin";

type BookItem = {
  id: string;
  language_code: string;
  version_code: string;
  name: string;
  abbreviation: string | null;
  grouping: BibleGrouping;
  order_index: number;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

type FormState = {
  id: string | null;
  name: string;
  abbreviation: string;
  grouping: BibleGrouping;
  orderIndex: string;
};

const DEFAULT_LIMIT = 20;

const INITIAL_FORM: FormState = {
  id: null,
  name: "",
  abbreviation: "",
  grouping: "old",
  orderIndex: "1",
};

function buildErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}

export default function BibleBooksManager() {
  const { showToast } = useToast();
  const { lang, version } = useBibleWorkspace();

  const [items, setItems] = useState<BookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: DEFAULT_LIMIT,
    total: 0,
    total_pages: 1,
  });
  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        lang,
        version,
        page: String(page),
        limit: String(DEFAULT_LIMIT),
      });
      if (search) params.set("q", search);

      const response = await fetch(`/api/admin/bible/books?${params.toString()}`, {
        cache: "no-store",
      });
      const result = (await response.json().catch(() => ({}))) as {
        items?: BookItem[];
        pagination?: Pagination;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(
          buildErrorMessage(result, `Gagal memuat kitab (${response.status}).`),
        );
      }

      const nextItems = Array.isArray(result.items) ? result.items : [];
      const nextPagination = result.pagination || {
        page,
        limit: DEFAULT_LIMIT,
        total: nextItems.length,
        total_pages: 1,
      };
      setItems(nextItems);
      setPagination(nextPagination);
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [lang, page, search, showToast, version]);

  useEffect(() => {
    void fetchBooks();
  }, [fetchBooks]);

  const maxOrderFromPage = useMemo(() => {
    if (items.length === 0) return 1;
    return Math.max(...items.map((item) => Number(item.order_index || 0)), 0) + 1;
  }, [items]);

  const resetForm = useCallback(() => {
    setForm({
      ...INITIAL_FORM,
      orderIndex: String(maxOrderFromPage),
    });
  }, [maxOrderFromPage]);

  useEffect(() => {
    if (!form.id && (!form.orderIndex || form.orderIndex === "1")) {
      setForm((prev) => ({
        ...prev,
        orderIndex: String(maxOrderFromPage),
      }));
    }
  }, [form.id, form.orderIndex, maxOrderFromPage]);

  const handleEdit = (item: BookItem) => {
    setForm({
      id: item.id,
      name: item.name,
      abbreviation: item.abbreviation || "",
      grouping: item.grouping,
      orderIndex: String(item.order_index),
    });
  };

  const handleCancelEdit = () => {
    resetForm();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!lang || !version) return;

    const orderIndex = Number(form.orderIndex);
    if (!form.name.trim()) {
      showToast("Nama kitab wajib diisi.", "error");
      return;
    }
    if (!Number.isInteger(orderIndex) || orderIndex <= 0) {
      showToast("order_index harus angka bulat positif.", "error");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/bible/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          language_code: lang,
          version_code: version,
          name: form.name.trim(),
          abbreviation: form.abbreviation.trim() || null,
          grouping: form.grouping,
          order_index: orderIndex,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        order_index_conflict?: boolean;
      };

      if (!response.ok) {
        throw new Error(buildErrorMessage(result, `Gagal menyimpan kitab (${response.status}).`));
      }

      if (result.order_index_conflict) {
        showToast(
          "Data tersimpan, tetapi order_index bentrok dengan kitab lain di versi ini.",
          "info",
        );
      } else {
        showToast(result.message || "Kitab berhasil disimpan.", "success");
      }

      resetForm();
      await fetchBooks();
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: BookItem) => {
    if (!lang || !version) return;
    const confirmed = window.confirm(
      `Hapus kitab "${item.name}"?\nSemua pasal dan ayat dalam kitab ini juga akan dihapus.`,
    );
    if (!confirmed) return;

    setDeletingId(item.id);
    try {
      const response = await fetch("/api/admin/bible/books/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          language_code: lang,
          version_code: version,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(buildErrorMessage(result, `Gagal menghapus kitab (${response.status}).`));
      }
      showToast(result.message || "Kitab berhasil dihapus.", "success");
      await fetchBooks();
      if (form.id === item.id) {
        resetForm();
      }
    } catch (errorValue: unknown) {
      const message = errorValue instanceof Error ? errorValue.message : "Unknown error";
      showToast(message, "error");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-surface-secondary bg-surface-primary p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-text-primary">Kelola Kitab</h2>
            <p className="text-sm text-text-secondary">
              Kelola metadata kitab per bahasa+versi: nama, grouping, dan urutan.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchBooks()}
            className="inline-flex items-center gap-2 rounded-lg border border-surface-secondary px-3 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-secondary/60"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-surface-secondary p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-text-primary">
              {form.id ? "Edit Kitab" : "Tambah Kitab"}
            </p>
            {form.id ? (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="inline-flex items-center gap-1 rounded-lg border border-surface-secondary px-2 py-1 text-xs font-semibold text-text-secondary hover:bg-surface-secondary/50"
              >
                <X size={14} />
                Batal
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Nama Kitab
              </span>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
                placeholder="Contoh: Kejadian"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Singkatan
              </span>
              <input
                type="text"
                value={form.abbreviation}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, abbreviation: event.target.value }))
                }
                className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
                placeholder="Kej"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Grouping
              </span>
              <select
                value={form.grouping}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    grouping: event.target.value as BibleGrouping,
                  }))
                }
                className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
              >
                <option value="old">old</option>
                <option value="new">new</option>
                <option value="deutero">deutero</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                order_index
              </span>
              <input
                type="number"
                min={1}
                value={form.orderIndex}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, orderIndex: event.target.value }))
                }
                className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm outline-none focus:border-action"
                required
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-text-inverse hover:bg-action/90 disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : form.id ? <Save size={16} /> : <Plus size={16} />}
            {saving ? "Menyimpan..." : form.id ? "Update Kitab" : "Tambah Kitab"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-surface-secondary bg-surface-primary p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full max-w-md">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            />
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary py-2 pl-9 pr-3 text-sm outline-none focus:border-action"
              placeholder="Cari nama/singkatan kitab..."
            />
          </div>
          <p className="text-sm text-text-secondary">
            Total kitab: <span className="font-semibold text-text-primary">{pagination.total}</span>
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-surface-secondary">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-secondary/60 text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-3 py-3">Order</th>
                <th className="px-3 py-3">Nama</th>
                <th className="px-3 py-3">Singkatan</th>
                <th className="px-3 py-3">Grouping</th>
                <th className="px-3 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-text-secondary">
                    <Loader2 size={18} className="mx-auto animate-spin" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-text-secondary">
                    Belum ada data kitab.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-t border-surface-secondary/70">
                    <td className="px-3 py-3 font-semibold text-text-primary">{item.order_index}</td>
                    <td className="px-3 py-3 text-text-primary">{item.name}</td>
                    <td className="px-3 py-3 text-text-secondary">{item.abbreviation || "-"}</td>
                    <td className="px-3 py-3">
                      <span className="rounded bg-action/10 px-2 py-1 text-xs font-semibold uppercase text-action">
                        {item.grouping}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-surface-secondary px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-secondary/60"
                        >
                          <Edit2 size={14} />
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === item.id}
                          onClick={() => void handleDelete(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-status-error/30 px-2.5 py-1.5 text-xs font-semibold text-status-error hover:bg-status-error/10 disabled:opacity-60"
                        >
                          {deletingId === item.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
          <span>
            Halaman {pagination.page} dari {Math.max(pagination.total_pages, 1)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              className="rounded-lg border border-surface-secondary px-3 py-1.5 font-semibold hover:bg-surface-secondary/60 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={pagination.page >= Math.max(pagination.total_pages, 1)}
              onClick={() =>
                setPage((prev) => Math.min(prev + 1, Math.max(pagination.total_pages, 1)))
              }
              className="rounded-lg border border-surface-secondary px-3 py-1.5 font-semibold hover:bg-surface-secondary/60 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
