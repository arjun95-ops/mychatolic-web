"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Search, Plus, Edit2, Trash2, Loader2, Save, Map } from "lucide-react";

// --- Interfaces ---
interface Country {
    id: string;
    name: string;
    flag_emoji: string;
}

interface Diocese {
    id: string; // UUID
    name: string;
    country_id: string; // UUID
    // Joined Tables
    countries?: Country | Country[];
    churches?: { id: string; name: string }[];
}

// Interface for Sanitized UI Data
interface DioceseResult {
    id: string;
    name: string;
    country_id: string;
    countries?: Country; // Guaranteed Single Object
}

// --- Helper: Sanitize One-to-One Joins ---
const sanitizeOneToOne = (data: any) => {
    if (Array.isArray(data)) {
        return data.length > 0 ? data[0] : null;
    }
    return data;
};

export default function DioceseTab() {
    const { showToast } = useToast();
    const [data, setData] = useState<DioceseResult[]>([]);
    const [countries, setCountries] = useState<Country[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingItem, setEditingItem] = useState<DioceseResult | null>(null);
    const [formData, setFormData] = useState({ name: "", country_id: "" });

    // Fetch Data
    const fetchData = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('dioceses')
                .select(`
                    id, name, country_id, 
                    countries ( id, name, flag_emoji ),
                    churches ( id, name )
                `)
                .order('name');

            if (search) {
                query = query.ilike('name', `%${search}%`);
            }

            const { data: res, error } = await query;
            if (error) throw error;

            // Sanitize Data
            const sanitizedData: DioceseResult[] = (res || []).map((item: any) => ({
                id: item.id,
                name: item.name,
                country_id: item.country_id,
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
    }, [search]);

    // Handlers
    const handleOpenAdd = () => {
        setEditingItem(null);
        setFormData({ name: "", country_id: "" });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (item: DioceseResult) => {
        setEditingItem(item);
        setFormData({ name: item.name, country_id: item.country_id });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Hapus keuskupan ini?")) return;
        const { error } = await supabase.from('dioceses').delete().eq('id', id);
        if (error) showToast(error.message, "error");
        else {
            showToast("Keuskupan dihapus", "success");
            fetchData();
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.country_id) {
            showToast("Semua field harus diisi", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                name: formData.name,
                country_id: formData.country_id // UUID string
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
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Cari Keuskupan..."
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
                    Tambah Keuskupan
                </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-xs">
                        <tr>
                            <th className="p-5">Nama Keuskupan</th>
                            <th className="p-5">Negara</th>
                            <th className="p-5 text-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {loading ? (
                            <tr><td colSpan={3} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-600" /></td></tr>
                        ) : data.length === 0 ? (
                            <tr><td colSpan={3} className="p-8 text-center text-slate-400">Data tidak ditemukan.</td></tr>
                        ) : (
                            data.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                    <td className="p-5 font-semibold text-slate-900 dark:text-white flex items-center gap-3">
                                        <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-indigo-600 dark:text-indigo-400"><Map className="w-4 h-4" /></div>
                                        {item.name}
                                    </td>
                                    <td className="p-5 text-slate-500 flex items-center gap-2">
                                        <span className="text-xl">{item.countries?.flag_emoji}</span>
                                        {item.countries?.name}
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
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? "Edit Keuskupan" : "Tambah Keuskupan"}>
                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Keuskupan</label>
                        <input
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-slate-900 dark:text-white"
                            required
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Contoh: Keuskupan Agung Jakarta"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Negara</label>
                        <select
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-slate-900 dark:text-white"
                            required
                            value={formData.country_id}
                            onChange={e => setFormData({ ...formData, country_id: e.target.value })}
                        >
                            <option value="">Pilih Negara</option>
                            {countries.map(c => <option key={c.id} value={c.id}>{c.flag_emoji} {c.name}</option>)}
                        </select>
                    </div>
                    <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800">Batal</button>
                        <button type="submit" disabled={isSubmitting} className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-bold hover:opacity-90 flex justify-center items-center gap-2">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Simpan
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
