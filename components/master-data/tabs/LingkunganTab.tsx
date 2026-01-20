"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Search, Plus, Edit2, Trash2, Loader2, ChevronLeft, ChevronRight, Save, Home } from "lucide-react";

export default function LingkunganTab() {
    const { showToast } = useToast();
    const [data, setData] = useState<any[]>([]);
    const [wilayahs, setWilayahs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 10;

    // Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [formData, setFormData] = useState({
        name: "",
        wilayah_id: ""
    });

    const fetchData = async () => {
        setLoading(true);
        let query = supabase
            .from('lingkungan')
            .select(`
                id, name, wilayah_id,
                wilayah ( name, churches(nama_paroki) )
            `)
            .order('name', { ascending: true })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (search) {
            query = query.ilike('name', `%${search}%`);
        }

        const { data: res, error } = await query;
        if (error) {
            console.error(error);
            showToast("Gagal memuat data lingkungan", "error");
        } else {
            setData(res || []);
        }
        setLoading(false);
    };

    const fetchWilayahs = async () => {
        // Fetch all wilayah, ideally we should filter or paginate if too many
        // For now, let's fetch first 100 or all
        const { data } = await supabase.from('wilayah').select('id, name').order('name');
        setWilayahs(data || []);
    };

    useEffect(() => {
        fetchWilayahs();
    }, []);

    useEffect(() => {
        const delay = setTimeout(fetchData, 500);
        return () => clearTimeout(delay);
    }, [search, page]);

    // Handlers
    const handleOpenAdd = () => {
        setEditingItem(null);
        setFormData({ name: "", wilayah_id: "" });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (item: any) => {
        setEditingItem(item);
        setFormData({
            name: item.name,
            wilayah_id: item.wilayah_id
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm("Yakin ingin menghapus lingkungan ini?")) return;

        const { error } = await supabase.from('lingkungan').delete().eq('id', id);
        if (error) {
            showToast("Gagal hapus: " + error.message, "error");
        } else {
            showToast("Lingkungan berhasil dihapus", "success");
            fetchData();
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.wilayah_id) {
            showToast("Nama dan Wilayah wajib diisi", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                name: formData.name,
                wilayah_id: parseInt(formData.wilayah_id)
            };

            if (editingItem) {
                const { error } = await supabase.from('lingkungan').update(payload).eq('id', editingItem.id);
                if (error) throw error;
                showToast("Lingkungan diperbarui", "success");
            } else {
                const { error } = await supabase.from('lingkungan').insert(payload);
                if (error) throw error;
                showToast("Lingkungan ditambahkan", "success");
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
                        placeholder="Cari Lingkungan..."
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
                    Tambah Lingkungan
                </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-xs">
                        <tr>
                            <th className="p-5">Nama Lingkungan</th>
                            <th className="p-5">Wilayah</th>
                            <th className="p-5">Paroki</th>
                            <th className="p-5 text-center">Aksi</th>
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
                                    <td className="p-5 font-semibold text-slate-900 dark:text-white flex items-center gap-3">
                                        <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-600 dark:text-green-400"><Home className="w-4 h-4" /></div>
                                        {item.name}
                                    </td>
                                    <td className="p-5 text-slate-600 dark:text-slate-400">{item.wilayah?.name}</td>
                                    <td className="p-5 text-slate-500 dark:text-slate-500">{item.wilayah?.churches?.nama_paroki}</td>
                                    <td className="p-5 flex justify-center gap-2">
                                        <button onClick={() => handleOpenEdit(item)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                                        <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                <span>Page {page + 1}</span>
                <div className="flex gap-2">
                    <button
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setPage(p => p + 1)}
                        disabled={data.length < PAGE_SIZE}
                        className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? "Edit Lingkungan" : "Tambah Lingkungan"}>
                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Lingkungan</label>
                        <input
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-slate-900 dark:text-white"
                            required
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Contoh: Lingkungan St. Yosef"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Wilayah</label>
                        <select
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-slate-900 dark:text-white"
                            required
                            value={formData.wilayah_id}
                            onChange={e => setFormData({ ...formData, wilayah_id: e.target.value })}
                        >
                            <option value="">Pilih Wilayah</option>
                            {wilayahs.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
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
