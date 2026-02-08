"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Search, Plus, Edit2, Trash2, Loader2, Save, Map, Upload, X, ExternalLink, User } from "lucide-react";

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

// --- Constants ---
const REQUIRED_W = 1080;
const REQUIRED_H = 1350;

// --- Helper: Sanitize One-to-One Joins ---
const sanitizeOneToOne = (data: any) => {
    if (Array.isArray(data)) {
        return data.length > 0 ? data[0] : null;
    }
    return data;
};

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

export default function DioceseTab() {
    const { showToast } = useToast();

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

    // --- Fetch Data ---
    const fetchData = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('dioceses')
                .select(`
                    id, name, country_id,
                    address, google_maps_url, bishop_name, bishop_image_url,
                    countries ( id, name, flag_emoji )
                `)
                .order('name');

            if (search) {
                query = query.ilike('name', `%${search}%`);
            }
            if (selectedCountryFilter) {
                query = query.eq('country_id', selectedCountryFilter);
            }

            const { data: res, error } = await query;
            if (error) throw error;

            // Sanitize Data
            const sanitizedData: DioceseResult[] = (res || []).map((item: any) => ({
                id: item.id,
                name: item.name,
                country_id: item.country_id,
                address: item.address,
                google_maps_url: item.google_maps_url,
                bishop_name: item.bishop_name,
                bishop_image_url: item.bishop_image_url,
                countries: sanitizeOneToOne(item.countries) as Country
            }));

            setData(sanitizedData);
        } catch (error: any) {
            showToast("Gagal memuat data: " + error.message, "error");
        } finally {
            setLoading(false);
        }
    };

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, selectedCountryFilter]);

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
        const { error } = await supabase.from('dioceses').delete().eq('id', id);
        if (error) {
            if (error.code === '23503') {
                showToast("Tidak bisa menghapus karena masih dipakai oleh Paroki.", "error");
            } else {
                showToast(error.message, "error");
            }
        } else {
            showToast("Keuskupan dihapus", "success");
            fetchData();
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

            if (editingItem) {
                const { error } = await supabase.from('dioceses').update(payload).eq('id', editingItem.id);
                if (error) throw error;
                showToast("Keuskupan diperbarui", "success");
            } else {
                const { error } = await supabase.from('dioceses').insert(payload);
                if (error) throw error;
                showToast("Keuskupan ditambahkan", "success");
            }
            setIsModalOpen(false);
            fetchData();
        } catch (e: any) {
            showToast(e.message, "error");
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
                    <div className="relative min-w-[200px]">
                        <select
                            className="w-full pl-3 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm text-slate-900 dark:text-white appearance-none"
                            value={selectedCountryFilter}
                            onChange={(e) => setSelectedCountryFilter(e.target.value)}
                        >
                            <option value="">Semua Negara</option>
                            {countries.map(c => <option key={c.id} value={c.id}>{c.flag_emoji} {c.name}</option>)}
                        </select>
                        {/* Clear Filter Button if active */}
                        {selectedCountryFilter && (
                            <button
                                onClick={() => setSelectedCountryFilter("")}
                                className="absolute right-8 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-red-500"
                                title="Clear Filter"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleOpenAdd}
                    className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary hover:opacity-90 text-white rounded-xl font-bold shadow-lg shadow-brand-primary/20 transition-all text-sm whitespace-nowrap"
                >
                    <Plus className="w-4 h-4" />
                    Tambah Keuskupan
                </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-xs">
                        <tr>
                            <th className="p-5">Nama Keuskupan</th>
                            <th className="p-5">Uskup</th>
                            <th className="p-5">Negara</th>
                            <th className="p-5 text-center">Maps</th>
                            <th className="p-5 text-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {loading ? (
                            <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-primary" /></td></tr>
                        ) : data.length === 0 ? (
                            <tr><td colSpan={5} className="p-8 text-center text-slate-400">Data tidak ditemukan.</td></tr>
                        ) : (
                            data.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                    <td className="p-5 font-semibold text-slate-900 dark:text-white">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-brand-primary shrink-0">
                                                <Map className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <span>{item.name}</span>
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
                        <select
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-900 dark:text-white"
                            required
                            value={formData.country_id}
                            onChange={e => setFormData({ ...formData, country_id: e.target.value })}
                        >
                            <option value="">Pilih Negara</option>
                            {countries.map(c => <option key={c.id} value={c.id}>{c.flag_emoji} {c.name}</option>)}
                        </select>
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
                                                    } catch (err) {
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
                                                } catch (err) {
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
