"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../../lib/supabaseClient";
import Modal from "../../ui/Modal";
import { useToast } from "../../ui/Toast";
import Image from "next/image";
import {
  Edit2,
  Loader2,
  MapPin,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

const CHURCH_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_CHURCH_BUCKET || "church_images";
const REQUIRED_W = 1080;
const REQUIRED_H = 1350;

function getErrorMessage(err: any): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err.message === "string") return err.message;
  if (typeof err.error === "string") return err.error;
  if (typeof err.error_description === "string") return err.error_description;
  try { return JSON.stringify(err); } catch { return "Unknown error"; }
}

function isValidHttpUrl(string: string) {
  let url;
  try {
    url = new URL(string);
  } catch (_) {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

interface Country {
  id: string;
  name: string;
  flag_emoji: string;
}

interface Diocese {
  id: string;
  name: string;
  country_id: string;
  countries?: Country;
}

interface Church {
  id: string;
  name: string;
  address: string | null;
  diocese_id: string;
  image_url: string | null;
  google_maps_url: string | null;
  latitude: number | null;
  longitude: number | null;
  dioceses?: {
    name: string;
    countries?: Country;
  };
}

type RawCountry = {
  id?: unknown;
  name?: unknown;
  flag_emoji?: unknown;
};

type RawDiocese = {
  name?: unknown;
  countries?: RawCountry | RawCountry[] | null;
};

type RawChurch = {
  id?: unknown;
  name?: unknown;
  address?: unknown;
  diocese_id?: unknown;
  image_url?: unknown;
  google_maps_url?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  dioceses?: RawDiocese | RawDiocese[] | null;
};

type ChurchForm = {
  name: string;
  address: string;
  diocese_id: string;
  image_url: string;
  google_maps_url: string;
  latitude: string;
  longitude: string;
};

const sanitizeOneToOne = <T,>(data: T | T[] | null | undefined): T | null => {
  if (Array.isArray(data)) return data.length > 0 ? data[0] : null;
  return data ?? null;
};

const normalizeHeader = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, "_");

const parseFloatOrNull = (value: unknown): number | null => {
  if (value == null) return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

const isMissingColumnError = (error: any, column: string) => {
  if (!error) return false;
  // Check typical Supabase/Postgres error fields
  const raw = (error.message || error.details || error.hint || String(error)).toLowerCase();
  return raw.includes(column.toLowerCase()) && raw.includes("does not exist");
};

// --- Image Validation Helpers ---
const getImageDimensionsFromFile = (file: File): Promise<{ w: number; h: number }> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = document.createElement("img"); // Use element for raw loading
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = (e) => {
      reject(e);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
};

const getImageDimensionsFromUrl = (url: string): Promise<{ w: number; h: number }> => {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    img.crossOrigin = "Anonymous"; // Try CORS
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = (e) => reject(e);
    img.src = url;
  });
};

export default function ChurchesTab() {
  const { showToast } = useToast();
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [data, setData] = useState<Church[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [hasMapColumns, setHasMapColumns] = useState(true);

  const [search, setSearch] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [filterDiocese, setFilterDiocese] = useState("");

  const [countries, setCountries] = useState<Country[]>([]);
  const [dioceses, setDioceses] = useState<Diocese[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState<Church | null>(null);

  const [formData, setFormData] = useState<ChurchForm>({
    name: "",
    address: "",
    diocese_id: "",
    image_url: "",
    google_maps_url: "",
    latitude: "",
    longitude: "",
  });

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [modalDioceses, setModalDioceses] = useState<Diocese[]>([]);

  const selectChurchesBase = `
    id, name, address, diocese_id, image_url,
    google_maps_url, latitude, longitude,
    dioceses (
      id, name, country_id,
      countries (id, name, flag_emoji)
    )
  `;

  const selectChurchesFallback = `
    id, name, address, diocese_id, image_url,
    dioceses (
      id, name, country_id,
      countries (id, name, flag_emoji)
    )
  `;

  const mapChurchRows = (rows: RawChurch[]): Church[] => {
    return (rows || []).map((item) => {
      const sanitizedDiocese = sanitizeOneToOne<RawDiocese>(item.dioceses);
      const sanitizedCountry = sanitizedDiocese
        ? sanitizeOneToOne<RawCountry>(sanitizedDiocese.countries)
        : null;
      const mappedCountry: Country | undefined = sanitizedCountry
        ? {
          id: String(sanitizedCountry.id || ""),
          name: String(sanitizedCountry.name || ""),
          flag_emoji: String(sanitizedCountry.flag_emoji || ""),
        }
        : undefined;
      return {
        id: String(item.id),
        name: String(item.name || ""),
        address: item.address ? String(item.address) : null,
        diocese_id: String(item.diocese_id || ""),
        image_url: item.image_url ? String(item.image_url) : null,
        google_maps_url: item.google_maps_url ? String(item.google_maps_url) : null,
        latitude: parseFloatOrNull(item.latitude),
        longitude: parseFloatOrNull(item.longitude),
        dioceses: sanitizedDiocese
          ? {
            name: String(sanitizedDiocese.name || ""),
            countries: mappedCountry,
          }
          : undefined,
      };
    });
  };

  const fetchChurches = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from("churches").select(selectChurchesBase).order("name");
      if (filterDiocese) query = query.eq("diocese_id", filterDiocese);
      if (search) query = query.ilike("name", `%${search}%`);

      const firstRes = await query;
      let rows: RawChurch[] = [];
      const firstError = firstRes.error;
      if (!firstError) {
        rows = (firstRes.data || []) as RawChurch[];
      } else if (isMissingColumnError(firstError, "google_maps_url")) {
        setHasMapColumns(false);
        let fallback = supabase
          .from("churches")
          .select(selectChurchesFallback)
          .order("name");
        if (filterDiocese) fallback = fallback.eq("diocese_id", filterDiocese);
        if (search) fallback = fallback.ilike("name", `%${search}%`);
        const fallbackRes = await fallback;
        if (fallbackRes.error) {
          throw fallbackRes.error;
        }
        rows = (fallbackRes.data || []) as RawChurch[];
      } else {
        throw firstError;
      }

      let items = mapChurchRows(rows);
      if (selectedCountry && !filterDiocese) {
        items = items.filter((item) => item.dioceses?.countries?.id === selectedCountry);
      }
      setData(items);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      showToast(`Gagal memuat data: ${message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [
    filterDiocese,
    search,
    selectedCountry,
    selectChurchesBase,
    selectChurchesFallback,
    showToast,
  ]);

  useEffect(() => {
    const fetchCountries = async () => {
      const { data } = await supabase
        .from("countries")
        .select("id, name, flag_emoji")
        .order("name");
      setCountries(data || []);
    };
    fetchCountries();
  }, []);

  useEffect(() => {
    if (!selectedCountry) {
      setDioceses([]);
      setFilterDiocese("");
      return;
    }
    const fetchByCountry = async () => {
      const { data } = await supabase
        .from("dioceses")
        .select("id, name, country_id")
        .eq("country_id", selectedCountry)
        .order("name");
      setDioceses(data || []);
      setFilterDiocese("");
    };
    fetchByCountry();
  }, [selectedCountry]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchChurches();
    }, 220);
    return () => clearTimeout(timer);
  }, [fetchChurches]);

  useEffect(() => {
    if (!isModalOpen) return;
    const loadModalDioceses = async () => {
      let query = supabase.from("dioceses").select("id, name, country_id").order("name");
      if (selectedCountry) query = query.eq("country_id", selectedCountry);
      const { data } = await query;
      setModalDioceses(data || []);
    };
    loadModalDioceses();
  }, [isModalOpen, selectedCountry]);

  const uploadImage = async () => {
    if (!imageFile) return formData.image_url;
    setUploading(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id;

      const safeName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${userId || "public"}/churches/${Date.now()}_${safeName}`;

      const { error } = await supabase.storage
        .from(CHURCH_BUCKET)
        .upload(filePath, imageFile, { upsert: true, contentType: imageFile.type });

      if (error) {
        console.error("Upload error:", error);
        throw error;
      }

      const { data } = supabase.storage.from(CHURCH_BUCKET).getPublicUrl(filePath);
      if (!data?.publicUrl) throw new Error("Gagal mengambil public URL.");

      return data.publicUrl;
    } catch (err) {
      const msg = getErrorMessage(err);
      // Log the full error for debugging
      console.error("Upload failed:", err);
      // We throw a new Error with the clean message so handleSave catches a readable error
      // and we avoid showing double toasts if handleSave also toasts.
      // But handleSave expects to toast. Let's just throw the clean message in an Error.
      throw new Error(`Upload gagal: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormData({
      name: "",
      address: "",
      diocese_id: "",
      image_url: "",
      google_maps_url: "",
      latitude: "",
      longitude: "",
    });
    setPreviewUrl(null);
    setImageFile(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: Church) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      address: item.address || "",
      diocese_id: item.diocese_id,
      image_url: item.image_url || "",
      google_maps_url: item.google_maps_url || "",
      latitude: item.latitude != null ? String(item.latitude) : "",
      longitude: item.longitude != null ? String(item.longitude) : "",
    });
    setPreviewUrl(item.image_url);
    setImageFile(null);
    setIsModalOpen(true);
  };

  const buildPayload = (imageUrl: string | null) => {
    const payload: Record<string, unknown> = {
      name: formData.name.trim(),
      address: formData.address.trim() || null,
      diocese_id: formData.diocese_id,
      image_url: imageUrl || null,
    };
    if (hasMapColumns) {
      payload.google_maps_url = formData.google_maps_url.trim() || null;
      payload.latitude = parseFloatOrNull(formData.latitude);
      payload.longitude = parseFloatOrNull(formData.longitude);
    }
    return payload;
  };

  const saveWithFallback = async (payload: Record<string, unknown>, id?: string) => {
    const query = id
      ? supabase.from("churches").update(payload).eq("id", id)
      : supabase.from("churches").insert(payload);
    const result = await query;
    if (!result.error) return;
    if (
      !isMissingColumnError(result.error, "google_maps_url") &&
      !isMissingColumnError(result.error, "latitude") &&
      !isMissingColumnError(result.error, "longitude")
    ) {
      throw result.error;
    }
    setHasMapColumns(false);
    const fallbackPayload = { ...payload };
    delete fallbackPayload.google_maps_url;
    delete fallbackPayload.latitude;
    delete fallbackPayload.longitude;
    const fallbackQuery = id
      ? supabase.from("churches").update(fallbackPayload).eq("id", id)
      : supabase.from("churches").insert(fallbackPayload);
    const fallbackResult = await fallbackQuery;
    if (fallbackResult.error) throw fallbackResult.error;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.diocese_id || !formData.name.trim()) {
      showToast("Nama paroki dan keuskupan wajib diisi.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const imageUrl = await uploadImage();
      const payload = buildPayload(imageUrl);
      await saveWithFallback(payload, editingItem?.id);
      showToast(editingItem ? "Paroki diperbarui" : "Paroki ditambahkan", "success");
      setIsModalOpen(false);
      await fetchChurches();
    } catch (error: any) {
      console.error("Save error object:", JSON.stringify(error, null, 2));
      const msg = getErrorMessage(error);

      if (msg.toLowerCase().includes("permission denied")) {
        showToast("Izin ditolak: Anda tidak memiliki akses untuk mengubah data Paroki.", "error");
      } else {
        showToast(msg, "error");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus paroki ini?")) return;
    const { error } = await supabase.from("churches").delete().eq("id", id);
    if (error) {
      if (error.code === '23503') {
        showToast("Tidak bisa menghapus karena masih dipakai oleh Jadwal Misa.", "error");
      } else {
        showToast("Gagal menghapus data: " + error.message, "error");
      }
      return;
    }
    showToast("Paroki dihapus", "success");
    await fetchChurches();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });

      const rows = rawRows.map((row) => {
        const normalized: Record<string, unknown> = {};
        Object.entries(row).forEach(([key, value]) => {
          normalized[normalizeHeader(key)] = value;
        });
        return normalized;
      });

      const payload = rows
        .map((row) => {
          const name = String(row.name || row.nama || "").trim();
          const dioceseId = String(
            row.diocese_id || row.keuskupan_id || row.diocese || "",
          ).trim();
          if (!name || !dioceseId) return null;
          const item: Record<string, unknown> = {
            name,
            diocese_id: dioceseId,
            address: String(row.address || row.alamat || "").trim() || null,
            image_url: String(row.image_url || row.foto || "").trim() || null,
          };
          if (hasMapColumns) {
            item.google_maps_url =
              String(row.google_maps_url || row.maps_url || row.map_url || "").trim() ||
              null;
            item.latitude = parseFloatOrNull(row.latitude || row.lat);
            item.longitude = parseFloatOrNull(row.longitude || row.lng);
          }
          return item;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (payload.length === 0) {
        throw new Error("Tidak ada baris valid (wajib ada name dan diocese_id).");
      }

      const insertChunk = async (chunk: Record<string, unknown>[]) => {
        const { error } = await supabase.from("churches").insert(chunk);
        if (!error) return;
        if (
          !isMissingColumnError(error, "google_maps_url") &&
          !isMissingColumnError(error, "latitude") &&
          !isMissingColumnError(error, "longitude")
        ) {
          throw error;
        }
        setHasMapColumns(false);
        const fallback = chunk.map((row) => {
          const copy = { ...row };
          delete copy.google_maps_url;
          delete copy.latitude;
          delete copy.longitude;
          return copy;
        });
        const { error: fallbackError } = await supabase.from("churches").insert(fallback);
        if (fallbackError) throw fallbackError;
      };

      const chunkSize = 200;
      for (let i = 0; i < payload.length; i += chunkSize) {
        await insertChunk(payload.slice(i, i + chunkSize));
      }

      showToast(`Import berhasil: ${payload.length} gereja`, "success");
      await fetchChurches();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      showToast(`Import gagal: ${message}`, "error");
    } finally {
      setImporting(false);
    }
  };



  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300">
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari Paroki..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm text-slate-900 dark:text-white transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={importInputRef}
            // ...
            />
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-slate-700 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Upload className="w-4 h-4" />
              {importing ? "Mengimpor..." : "Import CSV/Excel"}
            </button>
            <a
              href="/templates/gereja_import_template.csv"
              download
              className="flex items-center gap-2 px-4 py-2.5 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-xl text-blue-700 font-semibold"
            >
              <Upload className="w-4 h-4" />
              Template CSV
            </a>
            <a
              href="/templates/gereja_import_template.xlsx"
              download
              className="flex items-center gap-2 px-4 py-2.5 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded-xl text-indigo-700 font-semibold"
            >
              <Upload className="w-4 h-4" />
              Template Excel
            </a>
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary hover:opacity-90 text-white rounded-xl font-bold shadow-lg shadow-brand-primary/20 transition-all text-sm"
            >
              <Plus className="w-4 h-4" />
              Tambah Paroki
            </button>
          </div>
        </div>
        <div className="text-xs text-slate-400">
          Header import: <code>name,diocese_id,address,image_url,google_maps_url,latitude,longitude</code>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select
            className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-primary"
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
          >
            <option value="">-- Semua Negara --</option>
            {countries.map((country) => (
              <option key={country.id} value={country.id}>
                {country.flag_emoji} {country.name}
              </option>
            ))}
          </select>

          <select
            className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-primary disabled:opacity-50"
            value={filterDiocese}
            onChange={(e) => setFilterDiocese(e.target.value)}
            disabled={!selectedCountry}
          >
            <option value="">-- Semua Keuskupan --</option>
            {dioceses.map((diocese) => (
              <option key={diocese.id} value={diocese.id}>
                {diocese.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-xs">
            <tr>
              <th className="p-5">Foto</th>
              <th className="p-5">Paroki</th>
              <th className="p-5">Keuskupan</th>
              <th className="p-5">Maps</th>
              <th className="p-5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-primary" />
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400">
                  Data tidak ditemukan.
                </td>
              </tr>
            ) : (
              data.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                >
                  <td className="p-5">
                    {/* ... */}
                    <div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden relative">
                      {item.image_url ? (
                        <Image src={item.image_url} alt={item.name} fill className="object-cover" />
                      ) : (
                        <div className="flex items-center justify-center h-full text-slate-300">
                          <MapPin className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-5 font-semibold text-slate-900 dark:text-white">
                    {item.name}
                    <div className="text-xs text-slate-400 font-normal mt-1">{item.address || "-"}</div>
                  </td>
                  <td className="p-5 text-slate-500">
                    {item.dioceses?.countries?.flag_emoji} {item.dioceses?.name}
                  </td>
                  <td className="p-5 text-slate-500">
                    {item.google_maps_url && isValidHttpUrl(item.google_maps_url) ? (
                      <a
                        href={item.google_maps_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Buka Maps
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="p-5 flex justify-end gap-2">
                    <button
                      onClick={() => handleOpenEdit(item)}
                      className="p-2 text-slate-400 hover:text-brand-primary hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? "Edit Paroki" : "Tambah Paroki"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {/* Image Upload / URL Section */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Foto Gereja (Wajib 1080x1350 Portrait 4:5)
            </label>
            <div className="flex gap-4 items-start">
              {/* Preview Box - Portrait Aspect Ratio 4:5 */}
              {/* w-24 (96px) -> h should be 120px */}
              <div className="relative w-24 h-[120px] bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 shadow-sm group">
                <div className="relative w-full h-full bg-slate-200">
                  {(previewUrl || formData.image_url) ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={previewUrl || formData.image_url}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  ) : (
                    <div className="flex items-center justify-center w-full h-full text-slate-400">
                      <MapPin className="w-6 h-6 opacity-20" />
                    </div>
                  )}
                </div>
              </div>

              {/* Inputs */}
              <div className="flex-1 space-y-3">
                {/* File Upload Button */}
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*" // Restrict to images
                    className="hidden"
                    id="church-image-upload"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      // Validate Dimensions
                      try {
                        const dims = await getImageDimensionsFromFile(file);
                        // CHANGED: 1080x1920
                        if (dims.w !== REQUIRED_W || dims.h !== REQUIRED_H) {
                          showToast(`Dimensi gambar salah: ${dims.w}x${dims.h}. Wajib ${REQUIRED_W}x${REQUIRED_H} px (Portrait 4:5).`, "error");
                          e.target.value = ""; // Reset
                          return; // Reject
                        }
                        // Valid
                        setImageFile(file);
                        setPreviewUrl(URL.createObjectURL(file));
                        setFormData({ ...formData, image_url: "" });
                      } catch (err) {
                        showToast("Gagal membaca gambar.", "error");
                      }
                    }}
                  />
                  <label
                    htmlFor="church-image-upload"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors shadow-sm"
                  >
                    <Upload className="w-4 h-4 text-brand-primary" />
                    Upload File (1080x1350)
                  </label>
                  {imageFile && <span className="text-xs text-green-600 ml-2 font-medium">File terpilih: {imageFile.name}</span>}
                </div>

                {/* OR divider */}
                <div className="flex items-center gap-3">
                  <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
                  <span className="text-xs text-slate-400 font-medium">ATAU LINK URL</span>
                  <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
                </div>

                {/* URL Input */}
                <div>
                  <input
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-900 dark:text-white text-sm"
                    value={formData.image_url}
                    onChange={(e) => {
                      setFormData({ ...formData, image_url: e.target.value });
                      // If user types URL, clear file upload state
                      if (e.target.value) {
                        setImageFile(null);
                        setPreviewUrl(null);
                      }
                    }}
                    onBlur={async (e) => {
                      const val = e.target.value;
                      if (!val) return;
                      try {
                        const dims = await getImageDimensionsFromUrl(val);
                        // CHANGED: 1080x1350
                        if (dims.w !== REQUIRED_W || dims.h !== REQUIRED_H) {
                          showToast(`URL Gambar dimensi salah: ${dims.w}x${dims.h}. Wajib ${REQUIRED_W}x${REQUIRED_H} px (Portrait 4:5).`, "error");
                          // Optionally clear it or let user fix it. Let's warn only.
                        } else {
                          setPreviewUrl(val);
                        }
                      } catch (err) {
                        // maybe invalid url or cors
                        setPreviewUrl(val); // Try anyway
                      }
                    }}
                    placeholder="https://example.com/poster-misa.jpg"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Pastikan link akses publik dan gambar berukuran 1080x1350 pixel (Portrait 4:5).
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nama Paroki
            </label>
            <input
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-900 dark:text-white"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Contoh: Gereja Katedral"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Alamat
            </label>
            <input
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-900 dark:text-white"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Alamat Lengkap"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Keuskupan
            </label>
            <select
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-900 dark:text-white"
              required
              value={formData.diocese_id}
              onChange={(e) => setFormData({ ...formData, diocese_id: e.target.value })}
            >
              <option value="">Pilih Keuskupan</option>
              {modalDioceses.map((diocese) => (
                <option key={diocese.id} value={diocese.id}>
                  {diocese.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Link Google Maps
              </label>
              <input
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-900 dark:text-white"
                value={formData.google_maps_url}
                onChange={(e) =>
                  setFormData({ ...formData, google_maps_url: e.target.value })
                }
                placeholder="https://maps.google.com/..."
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Latitude
              </label>
              <input
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-900 dark:text-white"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                placeholder="-6.2000"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Longitude
              </label>
              <input
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-900 dark:text-white"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                placeholder="106.8166"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || uploading}
              className="flex-1 py-2.5 bg-brand-primary text-white rounded-xl font-bold hover:opacity-90 flex justify-center items-center gap-2"
            >
              {isSubmitting || uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Simpan
            </button>
          </div>
        </form >
      </Modal >
    </div >
  );

}
