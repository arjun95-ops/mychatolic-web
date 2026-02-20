"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../../lib/supabaseClient";
import Modal from "../../ui/Modal";
import { useToast } from "../../ui/Toast";
import Image from "next/image";
import {
  ChevronDown,
  Edit2,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

const CHURCH_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_CHURCH_BUCKET || "church_images";
const REQUIRED_W = 1080;
const REQUIRED_H = 1350;
const CLIENT_FETCH_PAGE_SIZE = 1000;

type ErrorLike = {
  message?: unknown;
  error?: unknown;
  error_description?: unknown;
  details?: unknown;
  hint?: unknown;
};

function getErrorMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const shaped = err as ErrorLike;
    if (typeof shaped.message === "string") return shaped.message;
    if (typeof shaped.error === "string") return shaped.error;
    if (typeof shaped.error_description === "string") return shaped.error_description;
  }
  try { return JSON.stringify(err); } catch { return "Unknown error"; }
}

function isValidHttpUrl(string: string) {
  let url;
  try {
    url = new URL(string);
  } catch {
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

type BatchDioceseRow = {
  id?: unknown;
  name?: unknown;
};

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

type ChurchDuplicateRow = {
  id: string;
  name: string | null;
};

type DownloadChurchRow = {
  name?: unknown;
  diocese_id?: unknown;
  address?: unknown;
  image_url?: unknown;
  google_maps_url?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};

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

const normalizeFlagEmoji = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const lowered = trimmed.toLowerCase();
  if (lowered === "null" || lowered === "undefined") return "";
  return trimmed;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DIOCESE_PLACEHOLDERS = new Set([
  "REPLACE_DIOCESE_UUID",
  "REPLACE_DIOCESE_ID",
  "DIOCESE_UUID",
  "DIOCESE_ID",
  "ISI_DENGAN_DIOCESE_ID",
]);

const isUuid = (value: string) => UUID_REGEX.test(value.trim());

const normalizeLookupText = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildChurchDuplicateKey = (name: string, dioceseId: string) =>
  `${dioceseId}::${normalizeLookupText(name)}`;

const isTemplateDiocesePlaceholder = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return true;
  return DIOCESE_PLACEHOLDERS.has(normalized.toUpperCase());
};

const buildImportErrorMessage = (errors: string[]) => {
  if (errors.length === 0) return "";
  const preview = errors.slice(0, 5).join(" | ");
  if (errors.length > 5) {
    return `${preview} | (+${errors.length - 5} error lainnya)`;
  }
  return preview;
};

const isMissingColumnError = (error: unknown, column: string) => {
  if (!error) return false;
  // Check typical Supabase/Postgres error fields
  const shaped = (typeof error === "object" ? error : {}) as ErrorLike;
  const message =
    (typeof shaped.message === "string" && shaped.message) ||
    (typeof shaped.details === "string" && shaped.details) ||
    (typeof shaped.hint === "string" && shaped.hint) ||
    String(error);
  const raw = message.toLowerCase();
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

type ChurchesTabProps = {
  onDataChanged?: () => void;
};

type SearchableOption = {
  value: string;
  label: string;
  searchText?: string;
};

type SearchableSelectProps = {
  value: string;
  options: SearchableOption[];
  allLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

type WorldSyncCheckpoint = {
  offset: number;
  page: number;
  processed: number;
  inserted: number;
  updated: number;
  unchanged: number;
  unresolvedDiocese: number;
  unresolvedCountry: number;
  skippedNoIso: number;
  updatedAt: string;
};

const WORLD_SYNC_CHECKPOINT_KEY = "mychatolic::churches::world-sync-checkpoint::v1";

const parseWorldSyncCheckpoint = (value: unknown): WorldSyncCheckpoint | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as {
    offset?: unknown;
    page?: unknown;
    processed?: unknown;
    inserted?: unknown;
    updated?: unknown;
    unchanged?: unknown;
    unresolvedDiocese?: unknown;
    unresolvedCountry?: unknown;
    skippedNoIso?: unknown;
    updatedAt?: unknown;
  };

  const asNumber = (input: unknown): number => {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  };

  const parsed: WorldSyncCheckpoint = {
    offset: asNumber(row.offset),
    page: asNumber(row.page),
    processed: asNumber(row.processed),
    inserted: asNumber(row.inserted),
    updated: asNumber(row.updated),
    unchanged: asNumber(row.unchanged),
    unresolvedDiocese: asNumber(row.unresolvedDiocese),
    unresolvedCountry: asNumber(row.unresolvedCountry),
    skippedNoIso: asNumber(row.skippedNoIso),
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
  };

  if (parsed.offset <= 0 || parsed.page <= 0) return null;
  return parsed;
};

const readWorldSyncCheckpoint = (): WorldSyncCheckpoint | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WORLD_SYNC_CHECKPOINT_KEY);
    if (!raw) return null;
    return parseWorldSyncCheckpoint(JSON.parse(raw));
  } catch {
    return null;
  }
};

function SearchableSelect({
  value,
  options,
  allLabel,
  searchPlaceholder,
  emptyLabel,
  disabled,
  onChange,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedLabel = useMemo(() => {
    if (!value) return allLabel;
    return options.find((item) => item.value === value)?.label || allLabel;
  }, [allLabel, options, value]);

  const visibleOptions = useMemo(() => {
    const merged: SearchableOption[] = [{ value: "", label: allLabel }, ...options];
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return merged;
    return merged.filter((item) => {
      const haystack = (item.searchText || item.label).toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [allLabel, options, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="w-full p-2.5 bg-surface-primary dark:bg-surface-inverse border border-surface-secondary dark:border-surface-secondary/20 rounded-xl text-sm outline-none focus:ring-2 focus:ring-action/20 focus:border-action disabled:opacity-50 flex items-center justify-between gap-2"
      >
        <span className="truncate text-left">{selectedLabel}</span>
        <ChevronDown className="w-4 h-4 shrink-0 text-slate-500" />
      </button>

      {open && !disabled ? (
        <div className="absolute z-40 mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
          <div className="p-2 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-action/20 focus:border-action text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="max-h-60 overflow-auto py-1">
            {visibleOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500">{emptyLabel}</div>
            ) : (
              visibleOptions.map((item) => {
                const isSelected = value === item.value;
                return (
                  <button
                    key={item.value || "__all__"}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(item.value)}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? "bg-action/10 text-action font-semibold"
                        : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ChurchesTab({ onDataChanged }: ChurchesTabProps) {
  const { showToast } = useToast();
  const showSyncButtons = false;
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const duplicateRowRefs = useRef<Map<string, HTMLTableRowElement | null>>(new Map());

  const [data, setData] = useState<Church[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [syncingIndonesia, setSyncingIndonesia] = useState(false);
  const [syncingSelectedDiocese, setSyncingSelectedDiocese] = useState(false);
  const [syncingAllDioceses, setSyncingAllDioceses] = useState(false);
  const [syncAllProgress, setSyncAllProgress] = useState({ done: 0, total: 0 });
  const [syncingWorld, setSyncingWorld] = useState(false);
  const [syncWorldProgress, setSyncWorldProgress] = useState({ page: 0, processed: 0 });
  const [worldSyncCheckpoint, setWorldSyncCheckpoint] = useState<WorldSyncCheckpoint | null>(null);
  const [hasMapColumns, setHasMapColumns] = useState(true);
  const [activeDuplicateRowId, setActiveDuplicateRowId] = useState<string>("");
  const [duplicateCursor, setDuplicateCursor] = useState(-1);

  const [search, setSearch] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [filterDiocese, setFilterDiocese] = useState("");

  const [countries, setCountries] = useState<Country[]>([]);
  const [dioceses, setDioceses] = useState<Diocese[]>([]);

  const duplicateChurchKeySet = useMemo(() => {
    const counts = new Map<string, number>();
    data.forEach((item) => {
      const key = buildChurchDuplicateKey(item.name || "", item.diocese_id || "");
      if (!normalizeLookupText(item.name || "")) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const duplicates = new Set<string>();
    counts.forEach((count, key) => {
      if (count > 1) duplicates.add(key);
    });
    return duplicates;
  }, [data]);
  const duplicateChurchCount = duplicateChurchKeySet.size;
  const duplicateRowIds = useMemo(
    () =>
      data
        .filter((item) =>
          duplicateChurchKeySet.has(buildChurchDuplicateKey(item.name || "", item.diocese_id || "")),
        )
        .map((item) => item.id),
    [data, duplicateChurchKeySet],
  );

  const countryOptions = useMemo<SearchableOption[]>(
    () =>
      countries.map((country) => {
        const label = [country.flag_emoji, country.name].filter(Boolean).join(" ");
        return {
          value: country.id,
          label,
          searchText: label,
        };
      }),
    [countries],
  );

  const dioceseOptions = useMemo<SearchableOption[]>(
    () =>
      dioceses.map((diocese) => ({
        value: diocese.id,
        label: diocese.name,
        searchText: diocese.name,
      })),
    [dioceses],
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState<Church | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState<"csv" | "xlsx" | null>(null);

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

  useEffect(() => {
    setWorldSyncCheckpoint(readWorldSyncCheckpoint());
  }, []);

  useEffect(() => {
    if (duplicateRowIds.length === 0) {
      setActiveDuplicateRowId("");
      setDuplicateCursor(-1);
      return;
    }
    if (!activeDuplicateRowId || !duplicateRowIds.includes(activeDuplicateRowId)) {
      setActiveDuplicateRowId("");
      setDuplicateCursor(-1);
    }
  }, [activeDuplicateRowId, duplicateRowIds]);

  const persistWorldSyncCheckpoint = useCallback((checkpoint: WorldSyncCheckpoint) => {
    setWorldSyncCheckpoint(checkpoint);
    try {
      window.localStorage.setItem(WORLD_SYNC_CHECKPOINT_KEY, JSON.stringify(checkpoint));
    } catch {
      // Ignore localStorage write failure.
    }
  }, []);

  const clearWorldSyncCheckpoint = useCallback(() => {
    setWorldSyncCheckpoint(null);
    try {
      window.localStorage.removeItem(WORLD_SYNC_CHECKPOINT_KEY);
    } catch {
      // Ignore localStorage remove failure.
    }
  }, []);

  const jumpToDuplicateRow = useCallback(
    (mode: "first" | "next") => {
      if (duplicateRowIds.length === 0) {
        showToast("Tidak ada baris duplikat di tampilan saat ini.", "error");
        return;
      }

      const nextCursor =
        mode === "first"
          ? 0
          : duplicateCursor >= 0
            ? (duplicateCursor + 1) % duplicateRowIds.length
            : 0;

      const rowId = duplicateRowIds[nextCursor] || "";
      if (!rowId) return;
      const rowEl = duplicateRowRefs.current.get(rowId);
      if (!rowEl) {
        showToast("Baris duplikat tidak ditemukan di tabel saat ini.", "error");
        return;
      }

      setDuplicateCursor(nextCursor);
      setActiveDuplicateRowId(rowId);
      rowEl.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => rowEl.focus(), 120);
    },
    [duplicateCursor, duplicateRowIds, showToast],
  );

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
          flag_emoji: normalizeFlagEmoji(sanitizedCountry.flag_emoji),
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
      const fetchChurchRowsPaged = async (selectClause: string) => {
        const rows: RawChurch[] = [];
        let from = 0;

        while (true) {
          let query = supabase
            .from("churches")
            .select(selectClause)
            .order("name")
            .range(from, from + CLIENT_FETCH_PAGE_SIZE - 1);
          if (filterDiocese) query = query.eq("diocese_id", filterDiocese);
          if (search) query = query.ilike("name", `%${search}%`);

          const response = await query;
          if (response.error) {
            return { rows: [] as RawChurch[], error: response.error };
          }

          const batch = (response.data || []) as RawChurch[];
          rows.push(...batch);
          if (batch.length < CLIENT_FETCH_PAGE_SIZE) {
            return { rows, error: null };
          }

          from += CLIENT_FETCH_PAGE_SIZE;
        }
      };

      const firstRes = await fetchChurchRowsPaged(selectChurchesBase);
      let rows: RawChurch[] = [];
      const firstError = firstRes.error;
      if (!firstError) {
        rows = firstRes.rows;
      } else if (isMissingColumnError(firstError, "google_maps_url")) {
        setHasMapColumns(false);
        const fallbackRes = await fetchChurchRowsPaged(selectChurchesFallback);
        if (fallbackRes.error) {
          throw fallbackRes.error;
        }
        rows = fallbackRes.rows;
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
      const normalizedCountries: Country[] = (data || []).map((country) => ({
        id: String(country.id || ""),
        name: String(country.name || ""),
        flag_emoji: normalizeFlagEmoji(country.flag_emoji),
      }));
      setCountries(normalizedCountries);
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.diocese_id || !formData.name.trim()) {
      showToast("Nama paroki dan keuskupan wajib diisi.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const normalizedNewName = normalizeLookupText(formData.name);
      const { data: sameDioceseRows, error: duplicateCheckError } = await supabase
        .from("churches")
        .select("id, name")
        .eq("diocese_id", formData.diocese_id);

      if (duplicateCheckError) {
        throw duplicateCheckError;
      }

      const duplicateExists = (sameDioceseRows as ChurchDuplicateRow[] | null | undefined)
        ?.some((row) => {
          if (!row?.id) return false;
          if (editingItem?.id && row.id === editingItem.id) return false;
          return normalizeLookupText(row.name || "") === normalizedNewName;
        });

      if (duplicateExists) {
        showToast("Nama paroki sudah ada di keuskupan ini. Gunakan nama lain.", "error");
        return;
      }

      const imageUrl = await uploadImage();
      const payload = buildPayload(imageUrl);
      const response = await fetch("/api/admin/master-data/churches/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingItem?.id,
          ...payload,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        map_columns_available?: boolean;
      };

      if (!response.ok) {
        throw new Error(result.message || "Gagal menyimpan paroki.");
      }

      if (result.map_columns_available === false) {
        setHasMapColumns(false);
      }

      showToast(
        result.message || (editingItem ? "Paroki diperbarui" : "Paroki ditambahkan"),
        "success",
      );
      setIsModalOpen(false);
      await fetchChurches();
      onDataChanged?.();
    } catch (error: unknown) {
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
    try {
      const response = await fetch("/api/admin/master-data/churches/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        references?: Array<{ label?: string; table?: string; count?: number }>;
      };

      if (!response.ok) {
        const references = Array.isArray(result.references) ? result.references : [];
        if (references.length > 0) {
          const referenceText = references
            .map((item) => {
              const label = String(item.label || item.table || "Relasi");
              const count = Number(item.count || 0);
              return `${label} (${count})`;
            })
            .join(", ");
          showToast(
            `${result.message || "Gagal menghapus data."} Dipakai oleh: ${referenceText}.`,
            "error",
          );
        } else {
          showToast(result.message || "Gagal menghapus data.", "error");
        }
        return;
      }

      showToast("Paroki dihapus", "success");
      await fetchChurches();
      onDataChanged?.();
    } catch {
      showToast("Gagal menghapus data (network error).", "error");
    }
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

      if (rows.length === 0) {
        throw new Error("File kosong. Isi minimal 1 baris data.");
      }

      const { data: allDioceses, error: allDiocesesError } = await supabase
        .from("dioceses")
        .select("id, name");
      if (allDiocesesError) {
        throw new Error(`Gagal membaca daftar keuskupan: ${allDiocesesError.message}`);
      }

      const dioceseIdSet = new Set((allDioceses || []).map((item) => String(item.id || "")));
      const dioceseNameToId = new Map<string, string>();
      const ambiguousDioceseNameSet = new Set<string>();
      for (const item of allDioceses || []) {
        const id = String(item.id || "").trim();
        const name = String(item.name || "").trim();
        if (!id || !name) continue;
        const key = normalizeLookupText(name);
        if (!key) continue;
        if (dioceseNameToId.has(key) && dioceseNameToId.get(key) !== id) {
          ambiguousDioceseNameSet.add(key);
          continue;
        }
        dioceseNameToId.set(key, id);
      }

      const rowErrors: string[] = [];
      const preparedRows: Array<{ rowNumber: number; data: Record<string, unknown> }> = [];

      rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const name = String(row.name || row.nama || "").trim();
        if (!name) {
          rowErrors.push(`Baris ${rowNumber}: kolom name wajib diisi.`);
          return;
        }

        const rawDioceseValue = String(
          row.diocese_id || row.keuskupan_id || row.diocese || row.diocese_name || row.keuskupan || "",
        ).trim();

        let resolvedDioceseId = rawDioceseValue;
        if (isTemplateDiocesePlaceholder(resolvedDioceseId)) {
          resolvedDioceseId = filterDiocese || "";
        }

        if (!resolvedDioceseId) {
          rowErrors.push(
            `Baris ${rowNumber}: diocese_id kosong. Pilih keuskupan filter aktif atau isi diocese_id UUID.`,
          );
          return;
        }

        if (!isUuid(resolvedDioceseId)) {
          const lookupKey = normalizeLookupText(resolvedDioceseId);
          if (ambiguousDioceseNameSet.has(lookupKey)) {
            rowErrors.push(
              `Baris ${rowNumber}: nama keuskupan "${resolvedDioceseId}" ambigu. Gunakan diocese_id UUID.`,
            );
            return;
          }
          resolvedDioceseId = dioceseNameToId.get(lookupKey) || resolvedDioceseId;
        }

        if (!isUuid(resolvedDioceseId)) {
          rowErrors.push(
            `Baris ${rowNumber}: diocese_id "${rawDioceseValue}" tidak valid (harus UUID).`,
          );
          return;
        }

        if (!dioceseIdSet.has(resolvedDioceseId)) {
          rowErrors.push(
            `Baris ${rowNumber}: diocese_id "${resolvedDioceseId}" tidak ditemukan di database.`,
          );
          return;
        }

        const imageUrl = String(row.image_url || row.foto || "").trim();
        if (imageUrl && !isValidHttpUrl(imageUrl)) {
          rowErrors.push(`Baris ${rowNumber}: image_url tidak valid (harus http/https).`);
          return;
        }

        const mapsUrl = String(row.google_maps_url || row.maps_url || row.map_url || "").trim();
        if (mapsUrl && !isValidHttpUrl(mapsUrl)) {
          rowErrors.push(`Baris ${rowNumber}: google_maps_url tidak valid (harus http/https).`);
          return;
        }

        const lat = parseFloatOrNull(row.latitude ?? row.lat);
        if (lat != null && (lat < -90 || lat > 90)) {
          rowErrors.push(`Baris ${rowNumber}: latitude harus antara -90 sampai 90.`);
          return;
        }

        const lng = parseFloatOrNull(row.longitude ?? row.lng);
        if (lng != null && (lng < -180 || lng > 180)) {
          rowErrors.push(`Baris ${rowNumber}: longitude harus antara -180 sampai 180.`);
          return;
        }

        const item: Record<string, unknown> = {
          name,
          diocese_id: resolvedDioceseId,
          address: String(row.address || row.alamat || "").trim() || null,
          image_url: imageUrl || null,
        };
        if (hasMapColumns) {
          item.google_maps_url = mapsUrl || null;
          item.latitude = lat;
          item.longitude = lng;
        }
        preparedRows.push({ rowNumber, data: item });
      });

      if (rowErrors.length > 0) {
        throw new Error(buildImportErrorMessage(rowErrors));
      }

      if (preparedRows.length === 0) {
        throw new Error("Tidak ada baris yang siap diimpor.");
      }

      const response = await fetch("/api/admin/master-data/churches/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: preparedRows.map((item) => ({ rowNumber: item.rowNumber, data: item.data })),
        }),
      });

      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        successCount?: number;
        failedRows?: string[];
      };

      if (!response.ok) {
        const message = result.message || "Gagal import paroki.";
        const failedRows = Array.isArray(result.failedRows) ? result.failedRows : [];
        throw new Error(
          failedRows.length > 0
            ? `${message} ${buildImportErrorMessage(failedRows)}`
            : message,
        );
      }

      const successCount = Number(result.successCount || 0);
      const failedRows = Array.isArray(result.failedRows) ? result.failedRows : [];

      if (failedRows.length > 0) {
        throw new Error(buildImportErrorMessage(failedRows));
      }

      if (successCount <= 0) {
        throw new Error("Tidak ada data yang diimpor.");
      }

      showToast(`Import berhasil: ${successCount} paroki`, "success");
      await fetchChurches();
      onDataChanged?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.toLowerCase().includes("google_maps_url")) {
        setHasMapColumns(false);
      }
      showToast(`Import gagal: ${message}`, "error");
    } finally {
      setImporting(false);
    }
  };

  const toSafeFilePart = (value: string) => {
    const normalized = value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return normalized || "keuskupan";
  };

  const handleDownloadTemplate = async (ext: "csv" | "xlsx") => {
    const selectedDioceseName = dioceses.find((item) => item.id === filterDiocese)?.name || "";
    if (!selectedDioceseName) {
      showToast("Pilih negara dan keuskupan terlebih dahulu.", "error");
      return;
    }

    setDownloadingTemplate(ext);
    try {
      let rows: DownloadChurchRow[] = [];
      if (hasMapColumns) {
        const fullRes = await supabase
          .from("churches")
          .select("name, diocese_id, address, image_url, google_maps_url, latitude, longitude")
          .eq("diocese_id", filterDiocese)
          .order("name");
        if (fullRes.error) {
          if (
            isMissingColumnError(fullRes.error, "google_maps_url") ||
            isMissingColumnError(fullRes.error, "latitude") ||
            isMissingColumnError(fullRes.error, "longitude")
          ) {
            setHasMapColumns(false);
          } else {
            throw fullRes.error;
          }
        } else {
          rows = (fullRes.data || []) as DownloadChurchRow[];
        }
      }

      if (!hasMapColumns || rows.length === 0) {
        const basicRes = await supabase
          .from("churches")
          .select("name, diocese_id, address, image_url")
          .eq("diocese_id", filterDiocese)
          .order("name");
        if (basicRes.error) throw basicRes.error;
        rows = (basicRes.data || []).map((row) => ({
          ...row,
          google_maps_url: "",
          latitude: "",
          longitude: "",
        })) as DownloadChurchRow[];
      }

      const header = [
        "name",
        "diocese_id",
        "address",
        "image_url",
        "google_maps_url",
        "latitude",
        "longitude",
      ];

      const exportRows = rows.map((row) => [
        String(row.name || ""),
        String(row.diocese_id || filterDiocese),
        String(row.address || ""),
        String(row.image_url || ""),
        String(row.google_maps_url || ""),
        row.latitude == null ? "" : String(row.latitude),
        row.longitude == null ? "" : String(row.longitude),
      ]);

      if (exportRows.length === 0) {
        exportRows.push(["", filterDiocese, "", "", "", "", ""]);
      }

      const sheet = XLSX.utils.aoa_to_sheet([header, ...exportRows]);

      let blob: Blob;
      if (ext === "csv") {
        const csv = XLSX.utils.sheet_to_csv(sheet);
        blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
      } else {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, "Gereja");
        const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        blob = new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      }

      const filename = `template_paroki_${toSafeFilePart(selectedDioceseName)}.${ext}`;
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(blobUrl);
    } catch (error: unknown) {
      showToast(`Gagal download template: ${getErrorMessage(error)}`, "error");
    } finally {
      setDownloadingTemplate(null);
    }
  };

  const handleSyncIndonesiaChurches = async () => {
    if (!window.confirm("Sinkronkan data paroki/gereja Indonesia ke database? Proses ini akan menambah atau memperbarui nama gereja berdasarkan sumber publik.")) {
      return;
    }

    setSyncingIndonesia(true);
    try {
      const response = await fetch("/api/admin/master-data/churches/sync-indonesia", {
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(result.message || "Gagal sinkronisasi paroki/gereja Indonesia.");
      }

      showToast(result.message || "Sinkronisasi paroki/gereja Indonesia selesai.", "success");
      await fetchChurches();
      onDataChanged?.();
    } catch (error: unknown) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setSyncingIndonesia(false);
    }
  };

  const handleSyncSelectedDioceseChurches = async () => {
    if (!filterDiocese) {
      showToast("Pilih keuskupan terlebih dahulu.", "error");
      return;
    }

    const selected = dioceses.find((item) => item.id === filterDiocese);
    const selectedName = selected?.name || "keuskupan terpilih";
    if (!window.confirm(`Sinkronkan data paroki/gereja untuk ${selectedName}?`)) {
      return;
    }

    setSyncingSelectedDiocese(true);
    try {
      const response = await fetch("/api/admin/master-data/churches/sync-diocese", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diocese_id: filterDiocese }),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(result.message || "Gagal sinkronisasi keuskupan terpilih.");
      }

      showToast(result.message || "Sinkronisasi keuskupan selesai.", "success");
      await fetchChurches();
      onDataChanged?.();
    } catch (error: unknown) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setSyncingSelectedDiocese(false);
    }
  };

  const handleSyncWorldChurches = async () => {
    let checkpoint = worldSyncCheckpoint || readWorldSyncCheckpoint();
    if (checkpoint) {
      setWorldSyncCheckpoint(checkpoint);
    }

    if (checkpoint) {
      const savedDate = new Date(checkpoint.updatedAt);
      const savedAtLabel = Number.isFinite(savedDate.getTime())
        ? savedDate.toLocaleString("id-ID")
        : checkpoint.updatedAt || "waktu tidak diketahui";
      const resumeConfirmed = window.confirm(
        `Ditemukan checkpoint sinkron dunia (${savedAtLabel}). Lanjutkan dari halaman ${checkpoint.page + 1}?`,
      );
      if (!resumeConfirmed) {
        if (
          !window.confirm(
            "Mulai sinkron dunia dari awal? Checkpoint lama akan dihapus.",
          )
        ) {
          return;
        }
        checkpoint = null;
        clearWorldSyncCheckpoint();
      }
    } else if (
      !window.confirm(
        "Sinkronkan data paroki/gereja dunia ke database? Proses ini bisa cukup lama.",
      )
    ) {
      return;
    }

    setSyncingWorld(true);

    try {
      const pageLimit = 5000;
      let offset = checkpoint?.offset ?? 0;
      let page = checkpoint?.page ?? 0;
      let processedTotal = checkpoint?.processed ?? 0;
      let insertedTotal = checkpoint?.inserted ?? 0;
      let updatedTotal = checkpoint?.updated ?? 0;
      let unchangedTotal = checkpoint?.unchanged ?? 0;
      let unresolvedDioceseTotal = checkpoint?.unresolvedDiocese ?? 0;
      let unresolvedCountryTotal = checkpoint?.unresolvedCountry ?? 0;
      let skippedNoIsoTotal = checkpoint?.skippedNoIso ?? 0;
      let hasMore = true;

      setSyncWorldProgress({ page, processed: processedTotal });

      while (hasMore) {
        page += 1;

        let attempt = 0;
        let pageResult: {
          message?: string;
          sourcePageCount?: number;
          nextOffset?: number;
          hasMore?: boolean;
          insertedCount?: number;
          updatedCount?: number;
          unchangedCount?: number;
          unresolvedDioceseCount?: number;
          unresolvedCountryCount?: number;
          skippedNoCountryIsoCount?: number;
        } | null = null;

        while (attempt < 3) {
          attempt += 1;
          const response = await fetch("/api/admin/master-data/churches/sync-world", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ offset, limit: pageLimit }),
          });
          const result = (await response.json().catch(() => ({}))) as { message?: string };
          if (response.ok) {
            pageResult = result;
            break;
          }

          const message = result.message || `Gagal sinkronisasi halaman ${page}.`;
          const normalized = message.toLowerCase();
          const isTransient =
            normalized.includes("429") ||
            normalized.includes("504") ||
            normalized.includes("timeout") ||
            normalized.includes("temporarily");

          if (isTransient && attempt < 3) {
            await new Promise((resolve) => {
              window.setTimeout(resolve, 1200 * attempt);
            });
            continue;
          }

          throw new Error(message);
        }

        if (!pageResult) {
          throw new Error(`Gagal memproses halaman ${page}.`);
        }

        const sourcePageCount = Number(pageResult.sourcePageCount || 0);
        processedTotal += sourcePageCount;
        insertedTotal += Number(pageResult.insertedCount || 0);
        updatedTotal += Number(pageResult.updatedCount || 0);
        unchangedTotal += Number(pageResult.unchangedCount || 0);
        unresolvedDioceseTotal += Number(pageResult.unresolvedDioceseCount || 0);
        unresolvedCountryTotal += Number(pageResult.unresolvedCountryCount || 0);
        skippedNoIsoTotal += Number(pageResult.skippedNoCountryIsoCount || 0);

        setSyncWorldProgress({ page, processed: processedTotal });

        const nextOffset = Number(pageResult.nextOffset ?? offset + sourcePageCount);
        hasMore = Boolean(pageResult.hasMore) && sourcePageCount > 0;
        if (hasMore) {
          const resolvedOffset =
            Number.isFinite(nextOffset) && nextOffset > offset
              ? nextOffset
              : offset + Math.max(1, sourcePageCount);
          offset = resolvedOffset;

          persistWorldSyncCheckpoint({
            offset: resolvedOffset,
            page,
            processed: processedTotal,
            inserted: insertedTotal,
            updated: updatedTotal,
            unchanged: unchangedTotal,
            unresolvedDiocese: unresolvedDioceseTotal,
            unresolvedCountry: unresolvedCountryTotal,
            skippedNoIso: skippedNoIsoTotal,
            updatedAt: new Date().toISOString(),
          });

          await new Promise((resolve) => {
            window.setTimeout(resolve, 250);
          });
        }
      }

      clearWorldSyncCheckpoint();
      await fetchChurches();
      onDataChanged?.();

      showToast(
        `Sinkron gereja dunia selesai. Halaman: ${page}, Sumber: ${processedTotal}, Insert: ${insertedTotal}, Update: ${updatedTotal}, Tidak berubah: ${unchangedTotal}, Keuskupan tidak cocok: ${unresolvedDioceseTotal}, Negara tidak cocok: ${unresolvedCountryTotal}, Tanpa ISO: ${skippedNoIsoTotal}.`,
        "success",
      );
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      const saved = readWorldSyncCheckpoint();
      if (saved) {
        setWorldSyncCheckpoint(saved);
        showToast(
          `${message} Progress tersimpan di halaman ${saved.page} (${saved.processed} sumber). Klik Sinkron Dunia lagi untuk lanjut.`,
          "error",
        );
      } else {
        showToast(message, "error");
      }
    } finally {
      setSyncingWorld(false);
      setSyncWorldProgress({ page: 0, processed: 0 });
    }
  };

  const handleSyncAllDiocesesChurches = async () => {
    if (
      !window.confirm(
        "Sinkronkan semua keuskupan Indonesia? Proses ini bisa memakan waktu beberapa menit.",
      )
    ) {
      return;
    }

    setSyncingAllDioceses(true);
    setSyncAllProgress({ done: 0, total: 0 });

    try {
      let indonesiaCountryId = "";

      const countryByIsoRes = await supabase
        .from("countries")
        .select("id, name")
        .eq("iso_code", "ID")
        .maybeSingle();

      if (countryByIsoRes.error && !isMissingColumnError(countryByIsoRes.error, "iso_code")) {
        throw countryByIsoRes.error;
      }

      if (!countryByIsoRes.error) {
        indonesiaCountryId = String(countryByIsoRes.data?.id || "");
      }
      if (!indonesiaCountryId) {
        const countryByNameRes = await supabase
          .from("countries")
          .select("id, name")
          .ilike("name", "Indonesia")
          .order("name")
          .limit(1)
          .maybeSingle();

        if (countryByNameRes.error) {
          throw countryByNameRes.error;
        }

        indonesiaCountryId = String(countryByNameRes.data?.id || "");
      }

      if (!indonesiaCountryId) {
        throw new Error("Negara Indonesia belum ada di master data.");
      }

      const diocesesRes = await supabase
        .from("dioceses")
        .select("id, name")
        .eq("country_id", indonesiaCountryId)
        .order("name");

      if (diocesesRes.error) {
        throw diocesesRes.error;
      }

      const allDioceses = ((diocesesRes.data || []) as BatchDioceseRow[])
        .map((row) => ({
          id: String(row.id || ""),
          name: String(row.name || ""),
        }))
        .filter((row) => Boolean(row.id) && Boolean(row.name));

      if (allDioceses.length === 0) {
        throw new Error("Belum ada data keuskupan Indonesia. Sinkronkan data keuskupan dulu.");
      }

      setSyncAllProgress({ done: 0, total: allDioceses.length });

      let successCount = 0;
      let insertedTotal = 0;
      let updatedTotal = 0;
      let unchangedTotal = 0;
      const failedDioceses: string[] = [];
      const skippedNoSourceDioceses: string[] = [];

      for (let i = 0; i < allDioceses.length; i += 1) {
        const diocese = allDioceses[i];

        try {
          const response = await fetch("/api/admin/master-data/churches/sync-diocese", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ diocese_id: diocese.id }),
          });

          const result = (await response.json().catch(() => ({}))) as {
            message?: string;
            insertedCount?: number;
            updatedCount?: number;
            unchangedCount?: number;
          };

          if (!response.ok) {
            const message = result.message || `Gagal sinkronisasi ${diocese.name}.`;
            const normalizedMessage = message.toLowerCase();
            if (normalizedMessage.includes("sumber publik belum menyediakan data paroki/gereja")) {
              skippedNoSourceDioceses.push(diocese.name);
              continue;
            }
            throw new Error(message);
          }

          successCount += 1;
          insertedTotal += Number(result.insertedCount || 0);
          updatedTotal += Number(result.updatedCount || 0);
          unchangedTotal += Number(result.unchangedCount || 0);
        } catch (error: unknown) {
          failedDioceses.push(`${diocese.name}: ${getErrorMessage(error)}`);
        } finally {
          setSyncAllProgress({ done: i + 1, total: allDioceses.length });
        }
      }

      await fetchChurches();
      onDataChanged?.();

      if (failedDioceses.length === 0) {
        const skippedSuffix =
          skippedNoSourceDioceses.length > 0
            ? ` Dilewati (belum ada sumber publik): ${skippedNoSourceDioceses.length} keuskupan.`
            : "";
        showToast(
          `Sinkron semua keuskupan selesai. Berhasil ${successCount}/${allDioceses.length}. Insert: ${insertedTotal}, Update: ${updatedTotal}, Tidak berubah: ${unchangedTotal}.${skippedSuffix}`,
          "success",
        );
      } else {
        const skippedSuffix =
          skippedNoSourceDioceses.length > 0
            ? ` Dilewati (belum ada sumber publik): ${skippedNoSourceDioceses.length}.`
            : "";
        const failedPreview = failedDioceses.slice(0, 2).join(" | ");
        showToast(
          `Sinkron selesai dengan ${failedDioceses.length} gagal dari ${allDioceses.length} keuskupan. Berhasil: ${successCount}.${skippedSuffix} ${failedPreview}`,
          "error",
        );
      }
    } catch (error: unknown) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setSyncingAllDioceses(false);
      setSyncAllProgress({ done: 0, total: 0 });
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
              type="file"
              accept=".csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-slate-700 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Upload className="w-4 h-4" />
              {importing ? "Mengimpor..." : "Import CSV/Excel"}
            </button>
            <button
              type="button"
              onClick={() => handleDownloadTemplate("csv")}
              disabled={!filterDiocese || downloadingTemplate !== null}
              className="flex items-center gap-2 px-4 py-2.5 border border-action/20 bg-action/5 hover:bg-action/10 rounded-xl text-action font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="w-4 h-4" />
              {downloadingTemplate === "csv" ? "Menyiapkan..." : "Template CSV"}
            </button>
            <button
              type="button"
              onClick={() => handleDownloadTemplate("xlsx")}
              disabled={!filterDiocese || downloadingTemplate !== null}
              className="flex items-center gap-2 px-4 py-2.5 border border-action/20 bg-action/5 hover:bg-action/10 rounded-xl text-action font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="w-4 h-4" />
              {downloadingTemplate === "xlsx" ? "Menyiapkan..." : "Template Excel"}
            </button>
            {showSyncButtons ? (
              <button
                type="button"
                onClick={handleSyncIndonesiaChurches}
                disabled={
                  syncingIndonesia ||
                  syncingSelectedDiocese ||
                  syncingAllDioceses ||
                  syncingWorld ||
                  Boolean(filterDiocese)
                }
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-slate-700 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {syncingIndonesia ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Sinkron Nasional (Wikidata)
              </button>
            ) : null}
            {showSyncButtons ? (
              <button
                type="button"
                onClick={handleSyncSelectedDioceseChurches}
                disabled={syncingSelectedDiocese || syncingIndonesia || syncingAllDioceses || syncingWorld || !filterDiocese}
                className="flex items-center gap-2 px-4 py-2.5 border border-action/20 bg-action/5 hover:bg-action/10 rounded-xl text-action font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncingSelectedDiocese ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Sinkron Keuskupan (One-by-one)
              </button>
            ) : null}
            {showSyncButtons ? (
              <button
                type="button"
                onClick={handleSyncWorldChurches}
                disabled={syncingWorld || syncingIndonesia || syncingSelectedDiocese || syncingAllDioceses}
                className="flex items-center gap-2 px-4 py-2.5 border border-cyan-200 bg-cyan-50 hover:bg-cyan-100 rounded-xl text-cyan-800 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncingWorld ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {syncingWorld
                  ? `Sinkron Dunia (${syncWorldProgress.page}, ${syncWorldProgress.processed})`
                  : worldSyncCheckpoint
                    ? `Lanjutkan Dunia (${worldSyncCheckpoint.page}, ${worldSyncCheckpoint.processed})`
                    : "Sinkron Dunia (Wikidata)"}
              </button>
            ) : null}
            {showSyncButtons ? (
              <button
                type="button"
                onClick={handleSyncAllDiocesesChurches}
                disabled={syncingAllDioceses || syncingIndonesia || syncingSelectedDiocese || syncingWorld}
                className="flex items-center gap-2 px-4 py-2.5 border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-xl text-amber-800 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncingAllDioceses ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {syncingAllDioceses && syncAllProgress.total > 0
                  ? `Sinkron Semua (${syncAllProgress.done}/${syncAllProgress.total})`
                  : "Sinkron Semua Keuskupan"}
              </button>
            ) : null}
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-2 px-5 py-2.5 bg-action hover:bg-action/90 text-text-inverse rounded-xl font-bold shadow-lg shadow-action/20 transition-all text-sm"
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
          <div>
            <SearchableSelect
              value={selectedCountry}
              options={countryOptions}
              allLabel="-- Semua Negara --"
              searchPlaceholder="Cari negara..."
              emptyLabel="Tidak ada negara ditemukan"
              onChange={setSelectedCountry}
            />
          </div>

          <div>
            <SearchableSelect
              value={filterDiocese}
              options={dioceseOptions}
              allLabel="-- Semua Keuskupan --"
              searchPlaceholder={selectedCountry ? "Cari keuskupan..." : "Pilih negara dulu"}
              emptyLabel="Tidak ada keuskupan ditemukan"
              disabled={!selectedCountry}
              onChange={setFilterDiocese}
            />
          </div>
        </div>
        {duplicateChurchCount > 0 ? (
          <div className="text-xs text-red-600 dark:text-red-300 bg-red-50/70 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl px-3 py-2 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <span>
              Ditemukan {duplicateChurchCount} nama paroki duplikat di keuskupan yang sama. Baris merah perlu dibersihkan.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => jumpToDuplicateRow("first")}
                className="px-2.5 py-1 rounded-lg border border-red-300 dark:border-red-800 bg-white/80 dark:bg-red-950/30 hover:bg-white dark:hover:bg-red-950/50 text-red-700 dark:text-red-200 font-semibold transition-colors"
              >
                Lihat Baris Merah
              </button>
              <button
                type="button"
                onClick={() => jumpToDuplicateRow("next")}
                className="px-2.5 py-1 rounded-lg border border-red-300 dark:border-red-800 bg-white/80 dark:bg-red-950/30 hover:bg-white dark:hover:bg-red-950/50 text-red-700 dark:text-red-200 font-semibold transition-colors"
              >
                Duplikat Berikutnya
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-xs">
            <tr>
              <th className="p-5 w-16 text-center">No</th>
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
                <td colSpan={6} className="p-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-action" />
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  Data tidak ditemukan.
                </td>
              </tr>
            ) : (
              data.map((item, index) => (
                <tr
                  key={item.id}
                  ref={(el) => {
                    duplicateRowRefs.current.set(item.id, el);
                  }}
                  tabIndex={-1}
                  className={`transition-colors group ${
                    duplicateChurchKeySet.has(
                      buildChurchDuplicateKey(item.name || "", item.diocese_id || ""),
                    )
                      ? activeDuplicateRowId === item.id
                        ? "bg-red-100 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/30 ring-2 ring-red-300 dark:ring-red-700"
                        : "bg-red-50/80 hover:bg-red-50 dark:bg-red-900/10 dark:hover:bg-red-900/20"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <td className="p-5 text-center font-semibold text-slate-500 dark:text-slate-400">
                    {index + 1}
                  </td>
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
                    <div className="flex items-center gap-2">
                      <span>{item.name}</span>
                      {duplicateChurchKeySet.has(
                        buildChurchDuplicateKey(item.name || "", item.diocese_id || ""),
                      ) && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
                          Duplikat
                        </span>
                      )}
                    </div>
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
                        className="text-action hover:underline"
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
                      className="p-2 text-text-secondary hover:text-action hover:bg-surface-secondary dark:hover:bg-surface-inverse rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-2 text-text-secondary hover:text-status-error hover:bg-status-error/10 rounded-lg transition-colors"
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
                      } catch {
                        showToast("Gagal membaca gambar.", "error");
                      }
                    }}
                  />
                  <label
                    htmlFor="church-image-upload"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-surface-primary dark:bg-surface-inverse border border-surface-secondary dark:border-surface-secondary/20 rounded-xl text-sm font-medium hover:bg-surface-secondary dark:hover:bg-surface-inverse/80 cursor-pointer transition-colors shadow-sm"
                  >
                    <Upload className="w-4 h-4 text-action" />
                    Upload File (1080x1350)
                  </label>
                  {imageFile && <span className="text-xs text-status-success ml-2 font-medium">File terpilih: {imageFile.name}</span>}
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
                    className="w-full p-2.5 bg-surface-secondary dark:bg-surface-inverse border border-surface-secondary dark:border-surface-secondary/20 rounded-xl focus:ring-2 focus:ring-action/20 focus:border-action outline-none text-text-primary dark:text-text-inverse text-sm"
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
                      } catch {
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
              className="w-full p-2.5 bg-surface-secondary dark:bg-surface-inverse border border-surface-secondary dark:border-surface-secondary/20 rounded-xl focus:ring-2 focus:ring-action/20 focus:border-action outline-none text-text-primary dark:text-text-inverse"
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
              className="w-full p-2.5 bg-surface-secondary dark:bg-surface-inverse border border-surface-secondary dark:border-surface-secondary/20 rounded-xl focus:ring-2 focus:ring-action/20 focus:border-action outline-none text-text-primary dark:text-text-inverse"
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
                className="w-full p-2.5 bg-surface-secondary dark:bg-surface-inverse border border-surface-secondary dark:border-surface-secondary/20 rounded-xl focus:ring-2 focus:ring-action/20 focus:border-action outline-none text-text-primary dark:text-text-inverse"
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
              className="flex-1 py-2.5 bg-action text-text-inverse rounded-xl font-bold hover:bg-action/90 flex justify-center items-center gap-2 shadow-lg shadow-action/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
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
