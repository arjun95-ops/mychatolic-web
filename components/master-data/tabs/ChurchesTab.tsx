"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabaseClient";
import Modal from "../../ui/Modal";
import { useToast } from "../../ui/Toast";
import Image from "next/image";
import { Search, Plus, Edit2, Trash2, MapPin, Loader2, Save, Upload } from "lucide-react";

// --- Interfaces ---

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
    dioceses?: {
        name: string;
        countries?: Country;
    };
}

// Helper to handle one-to-one joins which Supabase might return as array or object
const sanitizeOneToOne = (data: any) => {
    if (Array.isArray(data)) {
        return data.length > 0 ? data[0] : null;
    }
    return data;
};

export default function ChurchesTab() {
    const { showToast } = useToast();
    const [data, setData] = useState<Church[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [search, setSearch] = useState("");
    const [selectedCountry, setSelectedCountry] = useState("");
    const [filterDiocese, setFilterDiocese] = useState("");

    // Dropdown Data
    const [countries, setCountries] = useState<Country[]>([]);
    const [dioceses, setDioceses] = useState<Diocese[]>([]);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingItem, setEditingItem] = useState<Church | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        name: "",
        address: "",
        diocese_id: "",
        image_url: ""
    });

    // Image Upload State
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    // 1. Initial Load: Countries
    useEffect(() => {
        const fetchCountries = async () => {
            const { data } = await supabase.from('countries').select('id, name, flag_emoji').order('name');
            setCountries(data || []);
        };
        fetchCountries();
    }, []);

    // 2. Cascading: Load Dioceses when Country Selected
    useEffect(() => {
        if (selectedCountry) {
            const fetchDioceses = async () => {
                const { data } = await supabase.from('dioceses').select('id, name, country_id').eq('country_id', selectedCountry).order('name');
                setDioceses(data || []);
                setFilterDiocese(""); // Reset child filter
            };
            fetchDioceses();
        } else {
            setDioceses([]);
            setFilterDiocese("");
        }
    }, [selectedCountry]);

    // 3. Fetch Churches (Main Data)
    useEffect(() => {
        const fetchChurches = async () => {
            setLoading(true);
            try {
                let query = supabase
                    .from('churches')
                    .select(`
                        id, name, address, diocese_id, image_url,
                        dioceses (
                            id, name, country_id,
                            countries (id, name, flag_emoji)
                        )
                    `)
                    .order('name');

                if (filterDiocese) {
                    query = query.eq('diocese_id', filterDiocese);
                }

                if (search) {
                    query = query.ilike('name', `%${search}%`);
                }

                const { data: res, error } = await query;
                if (error) throw error;

                // Process Data & Client-side filtering for Country if needed
                let items: Church[] = (res || []).map((item: any) => {
                    const sanitizedDiocese = sanitizeOneToOne(item.dioceses);
                    const sanitizedCountry = sanitizedDiocese ? sanitizeOneToOne(sanitizedDiocese.countries) : null;

                    return {
                        id: item.id,
                        name: item.name,
                        address: item.address,
                        diocese_id: item.diocese_id,
                        image_url: item.image_url,
                        dioceses: sanitizedDiocese ? {
                            name: sanitizedDiocese.name,
                            countries: sanitizedCountry || undefined
                        } : undefined
                    };
                });

                // If Country selected but Diocese NOT selected, filter by Country manually
                if (selectedCountry && !filterDiocese) {
                    items = items.filter(i => i.dioceses?.countries?.id === selectedCountry);
                }

                setData(items);

            } catch (e: any) {
                showToast("Gagal memuat data: " + e.message, "error");
            } finally {
                setLoading(false);
            }
        };

        const timer = setTimeout(fetchChurches, 300);
        return () => clearTimeout(timer);
    }, [search, selectedCountry, filterDiocese]);


    // Handlers
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const uploadImage = async () => {
        if (!imageFile) return formData.image_url;

        setUploading(true);
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `churches/${fileName}`;

        const { error } = await supabase.storage.from('images').upload(filePath, imageFile);
        if (error) {
            setUploading(false);
            throw new Error("Gagal upload gambar");
        }

        const { data } = supabase.storage.from('images').getPublicUrl(filePath);
        setUploading(false);
        return data.publicUrl;
    };

    const handleOpenAdd = () => {
        setEditingItem(null);
        setFormData({ name: "", address: "", diocese_id: "", image_url: "" });
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
            image_url: item.image_url || ""
        });
        setPreviewUrl(item.image_url);
        setImageFile(null);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Hapus paroki ini?")) return;
        const { error } = await supabase.from('churches').delete().eq('id', id);
        if (error) showToast("Gagal menghapus", "error");
        else {
            showToast("Berhasil dihapus", "success");
            // Trigger refresh
            window.location.reload();
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const imageUrl = await uploadImage();
            const payload = {
                name: formData.name,
                address: formData.address,
                diocese_id: formData.diocese_id,
                image_url: imageUrl
            };

            if (editingItem) {
                const { error } = await supabase.from('churches').update(payload).eq('id', editingItem.id);
                if (error) throw error;
                showToast("Berhasil diperbarui", "success");
            } else {
                const { error } = await supabase.from('churches').insert(payload);
                if (error) throw error;
                showToast("Berhasil ditambahkan", "success");
            }
            setIsModalOpen(false);
            window.location.reload();
        } catch (e: any) {
            showToast(e.message, "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Modal Dioceses Logic
    const [modalDioceses, setModalDioceses] = useState<Diocese[]>([]);
    useEffect(() => {
        if (isModalOpen) {
            const loadModalDioceses = async () => {
                let query = supabase.from('dioceses').select('id, name, country_id').order('name');
                if (selectedCountry) {
                    query = query.eq('country_id', selectedCountry);
                }
                const { data } = await query;
                setModalDioceses(data || []);
            };
            loadModalDioceses();
        }
    }, [isModalOpen, selectedCountry]);

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300">
            {/* Toolbar */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 space-y-4">
                <div className="flex flex-col md:flex-row justify-between gap-4">
                    {/* Search */}
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Cari Paroki..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm text-slate-900 dark:text-white transition-colors"
                        />
                    </div>
                    <button
                        onClick={handleOpenAdd}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 text-white rounded-xl font-bold shadow-lg shadow-purple-200 dark:shadow-purple-900/20 transition-all text-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Tambah Paroki
                    </button>
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Country Filter */}
                    <select
                        className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-purple-500"
                        value={selectedCountry}
                        onChange={(e) => setSelectedCountry(e.target.value)}
                    >
                        <option value="">-- Semua Negara --</option>
                        {countries.map(c => <option key={c.id} value={c.id}>{c.flag_emoji} {c.name}</option>)}
                    </select>

                    {/* Diocese Filter */}
                    <select
                        className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                        value={filterDiocese}
                        onChange={(e) => setFilterDiocese(e.target.value)}
                        disabled={!selectedCountry}
                    >
                        <option value="">-- Semua Keuskupan --</option>
                        {dioceses.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-xs">
                        <tr>
                            <th className="p-5">Foto</th>
                            <th className="p-5">Nama Paroki</th>
                            <th className="p-5">Keuskupan</th>
                            <th className="p-5 text-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {loading ? (
                            <tr><td colSpan={4} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-600" /></td></tr>
                        ) : data.length === 0 ? (
                            <tr><td colSpan={4} className="p-8 text-center text-slate-400">Data tidak ditemukan.</td></tr>
                        ) : (
                            data.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                    <td className="p-5">
                                        <div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden relative">
                                            {item.image_url ? (
                                                <Image src={item.image_url} alt={item.name} fill className="object-cover" />
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-slate-300"><MapPin className="w-6 h-6" /></div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-5 font-semibold text-slate-900 dark:text-white">
                                        {item.name}
                                        <div className="text-xs text-slate-400 font-normal mt-1">{item.address}</div>
                                    </td>
                                    <td className="p-5 text-slate-500">
                                        {item.dioceses?.countries?.flag_emoji} {item.dioceses?.name}
                                    </td>
                                    <td className="p-5 flex justify-end gap-2">
                                        <button onClick={() => handleOpenEdit(item)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                                        <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? "Edit Paroki" : "Tambah Paroki"}>
                <form onSubmit={handleSave} className="space-y-4">
                    {/* Image Upload Area */}
                    <div className="flex justify-center mb-4">
                        <div className="relative w-32 h-32 bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-purple-500 transition-colors group">
                            {previewUrl ? (
                                <Image src={previewUrl} alt="Preview" fill className="object-cover" />
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                                    <Upload className="w-8 h-8 mb-2" />
                                    <span className="text-xs">Upload Foto</span>
                                </div>
                            )}
                            <input
                                type="file"
                                onChange={handleImageChange}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                accept="image/*"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Paroki</label>
                        <input
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-slate-900 dark:text-white"
                            required
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Contoh: Gereja Katedral"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Alamat</label>
                        <input
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-slate-900 dark:text-white"
                            value={formData.address || ""}
                            onChange={e => setFormData({ ...formData, address: e.target.value })}
                            placeholder="Alamat Lengkap"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Keuskupan</label>
                        <select
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-slate-900 dark:text-white"
                            required
                            value={formData.diocese_id}
                            onChange={e => setFormData({ ...formData, diocese_id: e.target.value })}
                        >
                            <option value="">Pilih Keuskupan</option>
                            {modalDioceses.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        <p className="text-xs text-slate-400 mt-1">Hanya menampilkan keuskupan dari negara yang dipilih.</p>
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800">
                            Batal
                        </button>
                        <button type="submit" disabled={isSubmitting || uploading} className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-bold hover:opacity-90 flex justify-center items-center gap-2">
                            {(isSubmitting || uploading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Simpan
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
