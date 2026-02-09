"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Search, Plus, Edit2, Trash2, Loader2, ChevronLeft, ChevronRight, Save, MapPin } from "lucide-react";

type RawChurch = {
    id?: unknown;
    nama_paroki?: unknown;
};

type RawWilayah = {
    id?: unknown;
    name?: unknown;
    church_id?: unknown;
    churches?: RawChurch | RawChurch[] | null;
};

type WilayahItem = {
    id: number;
    name: string;
    church_id: number;
    churches?: {
        nama_paroki: string;
    };
};

type ChurchOption = {
    id: number;
    nama_paroki: string;
};

const sanitizeOneToOne = <T,>(value: T | T[] | null | undefined): T | null => {
    if (Array.isArray(value)) return value.length > 0 ? value[0] : null;
    return value ?? null;
};

const toErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return "Terjadi kesalahan";
};

export default function WilayahTab() {
    const { showToast } = useToast();
    const [data, setData] = useState<WilayahItem[]>([]);
    const [churches, setChurches] = useState<ChurchOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 10;

    // Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingItem, setEditingItem] = useState<WilayahItem | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        church_id: ""
    });

    const fetchData = useCallback(async () => {
        setLoading(true);
        let query = supabase
            .from('wilayah')
            .select(`
                id, name, church_id,
                churches ( nama_paroki )
            `)
            .order('name', { ascending: true })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (search) {
            query = query.ilike('name', `%${search}%`);
        }

        const { data: res, error } = await query;
        if (error) {
            // If table doesn't exist yet, this might fail. We assume it exists.
            console.error(error);
            showToast("Gagal memuat data wilayah", "error");
        } else {
            const mapped = ((res || []) as RawWilayah[]).map((item) => {
                const church = sanitizeOneToOne<RawChurch>(item.churches);
                return {
                    id: Number(item.id ?? 0),
                    name: String(item.name ?? ""),
                    church_id: Number(item.church_id ?? 0),
                    churches: church ? { nama_paroki: String(church.nama_paroki ?? "") } : undefined,
                };
            });
            setData(mapped);
        }
        setLoading(false);
    }, [page, search, showToast]);

    const fetchChurches = useCallback(async () => {
        const { data } = await supabase.from('churches').select('id, nama_paroki').order('nama_paroki');
        const mapped = ((data || []) as RawChurch[]).map((item) => ({
            id: Number(item.id ?? 0),
            nama_paroki: String(item.nama_paroki ?? ""),
        }));
        setChurches(mapped);
    }, []);

    useEffect(() => {
        fetchChurches();
    }, [fetchChurches]);

    useEffect(() => {
        const delay = setTimeout(fetchData, 500);
        return () => clearTimeout(delay);
    }, [fetchData]);

    // Handlers
    const handleOpenAdd = () => {
        setEditingItem(null);
        setFormData({ name: "", church_id: "" });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (item: WilayahItem) => {
        setEditingItem(item);
        setFormData({
            name: item.name,
            church_id: String(item.church_id)
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm("Yakin ingin menghapus wilayah ini?")) return;

        const { error } = await supabase.from('wilayah').delete().eq('id', id);
        if (error) {
            showToast("Gagal hapus: " + error.message, "error");
        } else {
            showToast("Wilayah berhasil dihapus", "success");
            fetchData();
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.church_id) {
            showToast("Nama dan Paroki wajib diisi", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                name: formData.name,
                church_id: parseInt(formData.church_id)
            };

            if (editingItem) {
                const { error } = await supabase.from('wilayah').update(payload).eq('id', editingItem.id);
                if (error) throw error;
                showToast("Wilayah diperbarui", "success");
            } else {
                const { error } = await supabase.from('wilayah').insert(payload);
                if (error) throw error;
                showToast("Wilayah ditambahkan", "success");
            }
            setIsModalOpen(false);
            fetchData();
        } catch (error: unknown) {
            showToast(toErrorMessage(error), "error");
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
                        placeholder="Cari Wilayah..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm text-slate-900 dark:text-white transition-colors"
                    />
                </div>
                <button
                    onClick={handleOpenAdd}
                    className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary hover:opacity-90 text-white rounded-xl font-bold shadow-lg shadow-brand-primary/20 dark:shadow-brand-primary/20 transition-all text-sm"
                >
                    <Plus className="w-4 h-4" />
                    Tambah Wilayah
                </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-xs">
                        <tr>
                            <th className="p-5">Nama Wilayah</th>
                            <th className="p-5">Paroki</th>
                            <th className="p-5 text-center">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {loading ? (
                            <tr><td colSpan={3} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-primary" /></td></tr>
                        ) : data.length === 0 ? (
                            <tr><td colSpan={3} className="p-8 text-center text-slate-400">Data tidak ditemukan.</td></tr>
                        ) : (
                            data.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                    <td className="p-5 font-semibold text-slate-900 dark:text-white flex items-center gap-3">
                                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-brand-primary dark:text-brand-primary"><MapPin className="w-4 h-4" /></div>
                                        {item.name}
                                    </td>
                                    <td className="p-5 text-slate-600 dark:text-slate-400">{item.churches?.nama_paroki}</td>
                                    <td className="p-5 flex justify-center gap-2">
                                        <button onClick={() => handleOpenEdit(item)} className="p-2 text-slate-400 hover:text-brand-primary hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
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
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? "Edit Wilayah" : "Tambah Wilayah"}>
                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Wilayah</label>
                        <input
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-900 dark:text-white"
                            required
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Contoh: Wilayah I"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Paroki</label>
                        <select
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-900 dark:text-white"
                            required
                            value={formData.church_id}
                            onChange={e => setFormData({ ...formData, church_id: e.target.value })}
                        >
                            <option value="">Pilih Paroki</option>
                            {churches.map(c => <option key={c.id} value={c.id}>{c.nama_paroki}</option>)}
                        </select>
                    </div>
                    <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800">Batal</button>
                        <button type="submit" disabled={isSubmitting} className="flex-1 py-2.5 bg-brand-primary text-white rounded-xl font-bold hover:opacity-90 flex justify-center items-center gap-2">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Simpan
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
