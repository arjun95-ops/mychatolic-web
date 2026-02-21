"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Search, Plus, Edit2, Trash2, Loader2, Save, Map, Upload, ExternalLink, User, RefreshCw, ChevronDown } from "lucide-react";

const BISHOP_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BISHOP_BUCKET || "bishop_images";

// --- Interfaces ---
interface Country {
    id: string;
    name: string;
    flag_emoji: string;
}

// Interface for Sanitized UI Data
interface DioceseResult {
    id: string;
    name: string;
    country_id: string;
    address?: string | null;
    google_maps_url?: string | null;
    bishop_name?: string | null;
    bishop_image_url?: string | null;

    // Joined Data
    countries?: Country; // Guaranteed Single Object
}

type RawCountry = {
    id?: unknown;
    name?: unknown;
    flag_emoji?: unknown;
};

type RawDioceseRow = {
    id?: unknown;
    name?: unknown;
    country_id?: unknown;
    address?: unknown;
    google_maps_url?: unknown;
    bishop_name?: unknown;
    bishop_image_url?: unknown;
    countries?: RawCountry | RawCountry[] | null;
};

// --- Constants ---
const REQUIRED_W = 1080;
const REQUIRED_H = 1350;
const DIOCESE_FETCH_PAGE_SIZE = 1000;

// --- Helper: Sanitize One-to-One Joins ---
const sanitizeOneToOne = <T,>(data: T | T[] | null | undefined): T | null => {
    if (Array.isArray(data)) {
        return data.length > 0 ? data[0] : null;
    }
    return data ?? null;
};

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return "Unknown error";
};

const normalizeName = (value: string) =>
    value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

// --- Image Validation Helpers ---
const getImageDimensionsFromFile = (file: File): Promise<{ w: number; h: number }> => {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = document.createElement("img");
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
        img.crossOrigin = "Anonymous";
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = (e) => reject(e);
        img.src = url;
    });
};

type DioceseTabProps = {
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
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm text-slate-900 dark:text-white disabled:opacity-50 flex items-center justify-between gap-2"
            >
                <span className="truncate text-left">{selectedLabel}</span>
                <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />
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
                                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-slate-900 dark:text-white"
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
                                                ? "bg-brand-primary/10 text-brand-primary font-semibold"
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

export default function DioceseTab({ onDataChanged }: DioceseTabProps) {
    const { showToast } = useToast();
    const showSyncButtons = false;

    // Data State
    const [data, setData] = useState<DioceseResult[]>([]);
    const [countries, setCountries] = useState<Country[]>([]);
    const [loading, setLoading] = useState(true);

    // Filter State
    const [search, setSearch] = useState("");
    const [selectedCountryFilter, setSelectedCountryFilter] = useState<string>("");

    // Modal & Form State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingItem, setEditingItem] = useState<DioceseResult | null>(null);
    const [syncingIndonesia, setSyncingIndonesia] = useState(false);
    const [syncingWorld, setSyncingWorld] = useState(false);

    // Form Data
    const [formData, setFormData] = useState({
        name: "",
        country_id: "",
        address: "",
        google_maps_url: "",
        bishop_name: "",
        bishop_image_url: ""
    });

    // Image State
    const [bishopFile, setBishopFile] = useState<File | null>(null);
    const [bishopPreviewUrl, setBishopPreviewUrl] = useState<string | null>(null);
    const [isValidBishopImage, setIsValidBishopImage] = useState(true); // Default true if empty, but validates on input

    const duplicateDioceseNameSet = useMemo(() => {
        const counts = new globalThis.Map<string, number>();
        data.forEach((item) => {
            const key = normalizeName(item.name || "");
            if (!key) return;
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        const duplicates = new Set<string>();
        counts.forEach((count, key) => {
            if (count > 1) duplicates.add(key);
        });
        return duplicates;
    }, [data]);

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

    // --- Fetch Data ---
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const rows: RawDioceseRow[] = [];
            for (let from = 0; ; from += DIOCESE_FETCH_PAGE_SIZE) {
                let query = supabase
                    .from('dioceses')
                    .select(`
                    id, name, country_id,
                    address, google_maps_url, bishop_name, bishop_image_url,
                    countries ( id, name, flag_emoji )
                `)
                    .order('name')
                    .range(from, from + DIOCESE_FETCH_PAGE_SIZE - 1);

                if (search) {
                    query = query.ilike('name', `%${search}%`);
                }
                if (selectedCountryFilter) {
                    query = query.eq('country_id', selectedCountryFilter);
                }

                const { data: res, error } = await query;
                if (error) throw error;

                const batch = (res || []) as RawDioceseRow[];
                rows.push(...batch);
                if (batch.length < DIOCESE_FETCH_PAGE_SIZE) break;
            }

            // Sanitize Data
            const sanitizedData: DioceseResult[] = rows.map((item) => {
                const country = sanitizeOneToOne<RawCountry>(item.countries);
                return {
                    id: String(item.id ?? ""),
                    name: String(item.name ?? ""),
                    country_id: String(item.country_id ?? ""),
                    address: item.address ? String(item.address) : null,
                    google_maps_url: item.google_maps_url ? String(item.google_maps_url) : null,
                    bishop_name: item.bishop_name ? String(item.bishop_name) : null,
                    bishop_image_url: item.bishop_image_url ? String(item.bishop_image_url) : null,
                    countries: country ? {
                        id: String(country.id ?? ""),
                        name: String(country.name ?? ""),
                        flag_emoji: String(country.flag_emoji ?? ""),
                    } : undefined
                };
            });

            setData(sanitizedData);
        } catch (error: unknown) {
            showToast("Gagal memuat data: " + getErrorMessage(error), "error");
        } finally {
            setLoading(false);
        }
    }, [search, selectedCountryFilter, showToast]);

    // Fetch Countries for Dropdown
    const fetchCountries = async () => {
        const { data } = await supabase.from('countries').select('id, name, flag_emoji').order('name');
        setCountries(data || []);
    };

    useEffect(() => {
        fetchCountries();
    }, []);

    useEffect(() => {
        const delay = setTimeout(fetchData, 500);
        return () => clearTimeout(delay);
    }, [fetchData]);

    // --- Handlers ---

    const handleOpenAdd = () => {
        setEditingItem(null);
        setFormData({ name: "", country_id: "", address: "", google_maps_url: "", bishop_name: "", bishop_image_url: "" });
        setBishopFile(null);
        setBishopPreviewUrl(null);
        setIsValidBishopImage(true);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (item: DioceseResult) => {
        setEditingItem(item);
        setFormData({
            name: item.name,
            country_id: item.country_id,
            address: item.address || "",
            google_maps_url: item.google_maps_url || "",
            bishop_name: item.bishop_name || "",
            bishop_image_url: item.bishop_image_url || ""
        });
        setBishopFile(null);
        setBishopPreviewUrl(null);
        setIsValidBishopImage(true); // Assume existing is valid or let user re-validate if they change it
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Hapus keuskupan ini?")) return;

        try {
            const response = await fetch("/api/admin/master-data/dioceses/delete", {
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
                        `${result.message || "Tidak bisa menghapus keuskupan."} Dipakai oleh: ${referenceText}.`,
                        "error",
                    );
                } else {
                    showToast(result.message || "Tidak bisa menghapus keuskupan.", "error");
                }
                return;
            }

            showToast(result.message || "Keuskupan dihapus", "success");
            void fetchData();
            onDataChanged?.();
        } catch {
            showToast("Gagal menghapus keuskupan (network error).", "error");
        }
    };

    const handleSyncIndonesiaDioceses = async () => {
        if (!window.confirm("Sinkronkan seluruh keuskupan Indonesia ke database? Proses ini akan menambah atau memperbarui nama keuskupan yang sudah ada.")) {
            return;
        }

        setSyncingIndonesia(true);
        try {
            const response = await fetch("/api/admin/master-data/dioceses/sync-indonesia", {
                method: "POST",
            });
            const result = (await response.json().catch(() => ({}))) as { message?: string };
            if (!response.ok) {
                throw new Error(result.message || "Gagal sinkronisasi keuskupan Indonesia.");
            }

            showToast(result.message || "Sinkronisasi keuskupan Indonesia selesai.", "success");
            void fetchCountries();
            void fetchData();
            onDataChanged?.();
        } catch (error: unknown) {
            showToast(getErrorMessage(error), "error");
        } finally {
            setSyncingIndonesia(false);
        }
    };

    const handleSyncWorldDioceses = async () => {
        if (!window.confirm("Sinkronkan keuskupan seluruh dunia ke database? Proses ini bisa memakan waktu lebih lama.")) {
            return;
        }

        setSyncingWorld(true);
        try {
            const response = await fetch("/api/admin/master-data/dioceses/sync-world", {
                method: "POST",
            });
            const result = (await response.json().catch(() => ({}))) as { message?: string };
            if (!response.ok) {
                throw new Error(result.message || "Gagal sinkronisasi keuskupan dunia.");
            }

            showToast(result.message || "Sinkronisasi keuskupan dunia selesai.", "success");
            void fetchCountries();
            void fetchData();
            onDataChanged?.();
        } catch (error: unknown) {
            showToast(getErrorMessage(error), "error");
        } finally {
            setSyncingWorld(false);
        }
    };

    const handleUploadImage = async (file: File): Promise<string | null> => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `bishops/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from(BISHOP_BUCKET)
            .upload(filePath, file);

        if (uploadError) {
            if (uploadError.message.includes("Bucket not found")) {
                showToast(`Bucket ${BISHOP_BUCKET} tidak ditemukan. Buat bucket tersebut di Supabase Storage.`, "error");
            }
            throw uploadError;
        }

        const { data } = supabase.storage.from(BISHOP_BUCKET).getPublicUrl(filePath);
        return data.publicUrl;
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.country_id) {
            showToast("Nama dan Negara harus diisi", "error");
            return;
        }

        // Check Image Validity Gate
        if ((bishopFile || formData.bishop_image_url) && !isValidBishopImage) {
            showToast("Gambar Uskup tidak valid (harus 1080x1350). Perbaiki sebelum simpan.", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            let finalImageUrl = formData.bishop_image_url;

            // 1. Upload File if exists
            if (bishopFile) {
                const uploadedUrl = await handleUploadImage(bishopFile);
                if (uploadedUrl) finalImageUrl = uploadedUrl;
            }

            const payload = {
                name: formData.name,
                country_id: formData.country_id,
                address: formData.address || null,
                google_maps_url: formData.google_maps_url || null,
                bishop_name: formData.bishop_name || null,
                bishop_image_url: finalImageUrl || null
            };

            const response = await fetch("/api/admin/master-data/dioceses/upsert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: editingItem?.id,
                    ...payload,
                }),
            });

            const result = (await response.json().catch(() => ({}))) as { message?: string };
            if (!response.ok) {
                throw new Error(result.message || "Gagal menyimpan keuskupan.");
            }

            showToast(
                result.message || (editingItem ? "Keuskupan diperbarui" : "Keuskupan ditambahkan"),
                "success",
            );
            setIsModalOpen(false);
            void fetchData();
            onDataChanged?.();
        } catch (error: unknown) {
            showToast(getErrorMessage(error), "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300">
            {/* Toolbar */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between gap-4 items-center">
                <div className="flex-1 w-full flex flex-col md:flex-row gap-3">
                    {/* Search */}
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Cari Keuskupan..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm text-slate-900 dark:text-white transition-colors"
                        />
                    </div>
                    {/* Filter Country */}
                    <div className="min-w-[220px]">
                        <SearchableSelect
                            value={selectedCountryFilter}
                            options={countryOptions}
                            allLabel="Semua Negara"
                            searchPlaceholder="Cari negara..."
                            emptyLabel="Tidak ada negara ditemukan"
                            onChange={setSelectedCountryFilter}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    {showSyncButtons ? (
                        <button
                            onClick={handleSyncWorldDioceses}
                            disabled={syncingWorld || syncingIndonesia}
                            className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-800 dark:text-amber-200 rounded-xl font-bold transition-all text-sm whitespace-nowrap disabled:opacity-60"
                        >
                            {syncingWorld ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Sinkron Keuskupan Dunia
                        </button>
                    ) : null}
                    {showSyncButtons ? (
                        <button
                            onClick={handleSyncIndonesiaDioceses}
                            disabled={syncingIndonesia || syncingWorld}
                            className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold transition-all text-sm whitespace-nowrap disabled:opacity-60"
                        >
                            {syncingIndonesia ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Sinkron Keuskupan Indonesia
                        </button>
                    ) : null}
                    <button
                        onClick={handleOpenAdd}
                        className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary hover:opacity-90 text-white rounded-xl font-bold shadow-lg shadow-brand-primary/20 transition-all text-sm whitespace-nowrap"
                    >
                        <Plus className="w-4 h-4" />
                        Tambah Keuskupan
                    </button>
                </div>
            </div>
            <div className="px-6 py-2 text-xs text-red-600 dark:text-red-300 bg-red-50/70 dark:bg-red-900/10 border-b border-red-100 dark:border-red-900/30">
                Baris merah menandakan nama keuskupan duplikat.
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-xs">
                        <tr>
                            <th className="p-5 w-16 text-center">No</th>
                            <th className="p-5">Nama Keuskupan</th>
                            <th className="p-5">Uskup</th>
                            <th className="p-5">Negara</th>
                            <th className="p-5 text-center">Maps</th>
                            <th className="p-5 text-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {loading ? (
                            <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-primary" /></td></tr>
                        ) : data.length === 0 ? (
                            <tr><td colSpan={6} className="p-8 text-center text-slate-400">Data tidak ditemukan.</td></tr>
                        ) : (
                            data.map((item, index) => (
                                <tr
                                    key={item.id}
                                    className={`transition-colors group ${
                                        duplicateDioceseNameSet.has(normalizeName(item.name || ""))
                                            ? "bg-red-50/80 hover:bg-red-50 dark:bg-red-900/10 dark:hover:bg-red-900/20"
                                            : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                    }`}
                                >
                                    <td className="p-5 text-center font-semibold text-slate-500 dark:text-slate-400">
                                        {index + 1}
                                    </td>
                                    <td className="p-5 font-semibold text-slate-900 dark:text-white">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-brand-primary shrink-0">
                                                <Map className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span>{item.name}</span>
                                                    {duplicateDioceseNameSet.has(normalizeName(item.name || "")) && (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
                                                            Duplikat
                                                        </span>
                                                    )}
                                                </div>
                                                {item.address && <p className="text-xs text-slate-400 font-normal mt-0.5 line-clamp-1">{item.address}</p>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        {item.bishop_name ? (
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden shrink-0">
                                                    {item.bishop_image_url ? (
                                                        /* eslint-disable-next-line @next/next/no-img-element */
                                                        <img src={item.bishop_image_url} alt="Uskup" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <User className="w-full h-full p-1.5 text-slate-400" />
                                                    )}
                                                </div>
                                                <span className="font-medium text-slate-700 dark:text-slate-300">{item.bishop_name}</span>
                                            </div>
                                        ) : (
                                            <span className="text-slate-400 italic text-xs">-</span>
                                        )}
                                    </td>
                                    <td className="p-5">
                                        {item.countries && (
                                            <button
                                                onClick={() => setSelectedCountryFilter(item.country_id)}
                                                className="flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700 px-2 py-1 rounded-lg transition-colors text-left"
                                                title={`Filter by ${item.countries.name}`}
                                            >
                                                <span className="text-xl">{item.countries.flag_emoji}</span>
                                                <span className="font-medium">{item.countries.name}</span>
                                            </button>
                                        )}
                                    </td>
                                    <td className="p-5 text-center">
                                        {item.google_maps_url ? (
                                            <a
                                                href={item.google_maps_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center justify-center p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                        ) : (
                                            <span className="text-slate-300">-</span>
                                        )}
                                    </td>
                                    <td className="p-5 flex justify-end gap-2">
                                        <button onClick={() => handleOpenEdit(item)} className="p-2 text-slate-400 hover:text-brand-primary hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                                        <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? "Edit Keuskupan" : "Tambah Keuskupan"}>
                <form onSubmit={handleSave} className="space-y-4">
                    {/* Basic Info */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Keuskupan</label>
                        <input
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-900 dark:text-white"
                            required
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Contoh: Keuskupan Agung Jakarta"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Negara</label>
                        <SearchableSelect
                            value={formData.country_id}
                            options={countryOptions}
                            allLabel="Pilih Negara"
                            searchPlaceholder="Cari negara..."
                            emptyLabel="Tidak ada negara ditemukan"
                            disabled={isSubmitting}
                            onChange={(value) => setFormData({ ...formData, country_id: value })}
                        />
                    </div>

                    {/* Address & Maps */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Alamat Kantor</label>
                        <textarea
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-900 dark:text-white min-h-[80px]"
                            value={formData.address}
                            onChange={e => setFormData({ ...formData, address: e.target.value })}
                            placeholder="Alamat lengkap keuskupan..."
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Link Google Maps</label>
                        <input
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-900 dark:text-white"
                            value={formData.google_maps_url}
                            onChange={e => setFormData({ ...formData, google_maps_url: e.target.value })}
                            placeholder="https://maps.google.com/..."
                        />
                    </div>

                    {/* Bishop Section */}
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 uppercase tracking-wider">Informasi Uskup</h4>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Uskup</label>
                                <input
                                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-900 dark:text-white"
                                    value={formData.bishop_name}
                                    onChange={e => setFormData({ ...formData, bishop_name: e.target.value })}
                                    placeholder="Contoh: Ignatius Kardinal Suharyo"
                                />
                            </div>

                            {/* Bishop Image Upload */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Foto Uskup (Wajib 1080x1350 px - Ratio 4:5)
                                </label>
                                <div className="flex gap-4 items-start">
                                    {/* Preview 4:5 Aspect Ratio */}
                                    <div className="relative w-24 h-[120px] bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 shadow-sm">
                                        {(bishopPreviewUrl || formData.bishop_image_url) ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img
                                                src={bishopPreviewUrl || formData.bishop_image_url}
                                                alt="Bishop"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex items-center justify-center w-full h-full text-slate-400">
                                                <User className="w-8 h-8 opacity-20" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 space-y-3">
                                        {/* File Input */}
                                        <div className="relative">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                id="bishop-upload"
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (!file) return;

                                                    try {
                                                        const dims = await getImageDimensionsFromFile(file);
                                                        if (dims.w !== REQUIRED_W || dims.h !== REQUIRED_H) {
                                                            setIsValidBishopImage(false);
                                                            setBishopPreviewUrl(null);
                                                            setBishopFile(null);
                                                            showToast(`Dimensi salah: ${dims.w}x${dims.h}. Wajib ${REQUIRED_W}x${REQUIRED_H}px.`, "error");
                                                            e.target.value = ""; // reset
                                                            return;
                                                        }
                                                        // Valid
                                                        setIsValidBishopImage(true);
                                                        setBishopFile(file);
                                                        setBishopPreviewUrl(URL.createObjectURL(file));
                                                        setFormData({ ...formData, bishop_image_url: "" }); // Prefer file
                                                    } catch {
                                                        showToast("Gagal membaca gambar", "error");
                                                    }
                                                }}
                                            />
                                            <label htmlFor="bishop-upload" className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors shadow-sm">
                                                <Upload className="w-4 h-4 text-brand-primary" />
                                                Upload Foto (1080x1350)
                                            </label>
                                            {bishopFile && <span className="text-xs text-green-600 block mt-1 font-medium">{bishopFile.name}</span>}
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
                                            <span className="text-[10px] text-slate-400 font-medium tracking-wide">ATAU URL</span>
                                            <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
                                        </div>

                                        {/* URL Input */}
                                        <input
                                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-900 dark:text-white text-sm"
                                            placeholder="https://example.com/foto-uskup.jpg"
                                            value={formData.bishop_image_url}
                                            onChange={(e) => {
                                                setFormData({ ...formData, bishop_image_url: e.target.value });
                                                if (e.target.value) {
                                                    setBishopFile(null);
                                                    setBishopPreviewUrl(null);
                                                }
                                            }}
                                            onBlur={async (e) => {
                                                const val = e.target.value;
                                                if (!val) {
                                                    // Empty is fine if we don't strictly require image, but if entered it must be valid
                                                    setIsValidBishopImage(true);
                                                    return;
                                                }
                                                try {
                                                    const dims = await getImageDimensionsFromUrl(val);
                                                    if (dims.w !== REQUIRED_W || dims.h !== REQUIRED_H) {
                                                        setIsValidBishopImage(false);
                                                        showToast(`Dimensi URL salah: ${dims.w}x${dims.h}. Wajib ${REQUIRED_W}x${REQUIRED_H}px.`, "error");
                                                    } else {
                                                        setIsValidBishopImage(true);
                                                    }
                                                } catch {
                                                    // If URL invalid/cors, we might allow save but warn, or strictly block.
                                                    // Let's strictly block to ensure quality
                                                    setIsValidBishopImage(false);
                                                    showToast("Gagal akses URL gambar (CORS/Invalid). Coba upload file.", "error");
                                                }
                                            }}
                                        />
                                        {!isValidBishopImage && <p className="text-xs text-red-500 font-bold">Gambar tidak valid! Harap perbaiki dimensi.</p>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-6 border-t border-slate-100 dark:border-slate-800">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800">Batal</button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !isValidBishopImage}
                            className={`flex-1 py-2.5 text-white rounded-xl font-bold flex justify-center items-center gap-2 ${isSubmitting || !isValidBishopImage ? 'bg-slate-400 cursor-not-allowed' : 'bg-brand-primary hover:opacity-90'}`}
                        >
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Simpan
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
