"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Search, Plus, Edit2, Trash2, Globe, Loader2, Save } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/ui/Modal";

interface Country {
    id: string;
    name: string;
    iso_code: string;
    flag_emoji: string;
}

export default function CountryTab() {
    const { showToast } = useToast();
    const [countries, setCountries] = useState<Country[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentId, setCurrentId] = useState<string | null>(null);
    const [formData, setFormData] = useState({ name: "", iso_code: "", flag_emoji: "" });
    const [saving, setSaving] = useState(false);

    const fetchCountries = async () => {
        setLoading(true);
        let query = supabase.from('countries').select('*').order('name');
        if (search) query = query.ilike('name', `%${search}%`);

        const { data, error } = await query;
        if (error) showToast("Gagal memuat negara", "error");
        else setCountries(data || []);
        setLoading(false);
    };

    useEffect(() => {
        const delay = setTimeout(fetchCountries, 500);
        return () => clearTimeout(delay);
    }, [search]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (isEditing && currentId) {
                const { error } = await supabase.from('countries').update(formData).eq('id', currentId);
                if (error) throw error;
                showToast("Negara diperbarui", "success");
            } else {
                const { error } = await supabase.from('countries').insert([formData]);
                if (error) throw error;
                showToast("Negara ditambahkan", "success");
            }
            setIsModalOpen(false);
            fetchCountries();
        } catch (error: any) {
            showToast(error.message, "error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Hapus negara ini?")) return;
        const { error } = await supabase.from('countries').delete().eq('id', id);
        if (error) {
            if (error.code === '23503') { // Foreign Key Violation
                showToast("Tidak bisa menghapus karena masih dipakai oleh Keuskupan.", "error");
            } else {
                showToast("Gagal hapus: " + error.message, "error");
            }
        } else {
            showToast("Berhasil hapus", "success");
            fetchCountries();
        }
    };

    const openAdd = () => {
        setFormData({ name: "", iso_code: "", flag_emoji: "" });
        setIsEditing(false);
        setIsModalOpen(true);
    };

    const openEdit = (c: Country) => {
        setFormData({ name: c.name, iso_code: c.iso_code, flag_emoji: c.flag_emoji || "" });
        setCurrentId(c.id);
        setIsEditing(true);
        setIsModalOpen(true);
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300">
            {/* Toolbar */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Cari negara..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm text-slate-900 dark:text-white transition-colors"
                    />
                </div>
                <button
                    onClick={openAdd}
                    className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary hover:opacity-90 text-white rounded-xl font-bold shadow-lg shadow-brand-primary/20 dark:shadow-brand-primary/20 transition-all text-sm"
                >
                    <Plus className="w-4 h-4" /> Tambah Negara
                </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-xs">
                        <tr>
                            <th className="p-5">Nama Negara</th>
                            <th className="p-5">ISO Code</th>
                            <th className="p-5">Bendera</th>
                            <th className="p-5 text-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {loading ? (
                            <tr><td colSpan={4} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-primary" /></td></tr>
                        ) : countries.length === 0 ? (
                            <tr><td colSpan={4} className="p-8 text-center text-slate-400">Tidak ada data.</td></tr>
                        ) : (
                            countries.map((c) => (
                                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                    <td className="p-5 font-semibold text-slate-900 dark:text-white flex items-center gap-3">
                                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-brand-primary dark:text-brand-primary"><Globe className="w-4 h-4" /></div>
                                        {c.name}
                                    </td>
                                    <td className="p-5 font-mono text-slate-500">{c.iso_code || '-'}</td>
                                    <td className="p-5 text-2xl">{c.flag_emoji || ''}</td>
                                    <td className="p-5 flex justify-end gap-2">
                                        <button onClick={() => openEdit(c)} className="p-2 text-slate-400 hover:text-brand-primary hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                                        <button onClick={() => handleDelete(c.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={isEditing ? "Edit Negara" : "Tambah Negara"}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Negara</label>
                        <input
                            required
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-900 dark:text-white"
                            placeholder="Contoh: Indonesia"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">ISO Code (2 Huruf)</label>
                            <input
                                value={formData.iso_code || ""}
                                maxLength={2}
                                onChange={e => setFormData({ ...formData, iso_code: e.target.value.toUpperCase() })}
                                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-900 dark:text-white uppercase"
                                placeholder="ID"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Bendera (Emoji)</label>
                            <input
                                value={formData.flag_emoji || ""}
                                onChange={e => setFormData({ ...formData, flag_emoji: e.target.value })}
                                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-900 dark:text-white"
                                placeholder="🇮🇩"
                            />
                        </div>
                    </div>
                    <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800">Batal</button>
                        <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-brand-primary text-white rounded-xl font-bold hover:opacity-90 flex justify-center items-center gap-2">
                            {saving ? <Loader2 className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />} Simpan
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
