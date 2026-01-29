"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import {
    Calendar,
    Plus,
    Clock,
    MapPin,
    Globe,
    Edit2,
    Trash2,
    Search,
    X,
    Save,
    Loader2
} from "lucide-react";

interface Schedule {
    id: string;
    church_id: string;
    activity_name: string;
    day_of_week: number;
    start_time: string;
    language?: string;
    category?: string;
    churches?: {
        name: string;
    };
}

const DAYS = [
    { value: 1, label: "Senin" },
    { value: 2, label: "Selasa" },
    { value: 3, label: "Rabu" },
    { value: 4, label: "Kamis" },
    { value: 5, label: "Jumat" },
    { value: 6, label: "Sabtu" },
    { value: 7, label: "Minggu" }
];

const LANGUAGES = ["Bahasa Indonesia", "English", "Bahasa Mandarin", "Bahasa Jawa"];
const CATEGORIES = ["Misa Harian", "Misa Mingguan", "Misa Jumat Pertama", "Adorasi", "Pengakuan Dosa"];

export default function SchedulesPage() {
    const { showToast } = useToast();

    // Data State
    const [churches, setChurches] = useState<any[]>([]);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        church_id: "",
        activity_name: "", // Will be auto-filled by category logic if needed, or manual
        day_of_week: 7,
        start_time: "08:00",
        language: "Bahasa Indonesia",
        category: "Misa Mingguan"
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);

            // Parallel fetch
            const [churchRes, scheduleRes] = await Promise.all([
                supabase.from('churches').select('id, name').order('name'),
                supabase.from('mass_schedules').select(`*, churches(name)`).order('day_of_week').order('start_time')
            ]);

            if (churchRes.error) throw churchRes.error;
            if (scheduleRes.error) throw scheduleRes.error;

            setChurches(churchRes.data || []);
            setSchedules(scheduleRes.data as Schedule[] || []);

        } catch (error: any) {
            console.error("Error loading data:", error);
            showToast("Gagal memuat data jadwal", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (schedule?: Schedule) => {
        if (schedule) {
            setEditingId(schedule.id);
            setFormData({
                church_id: schedule.church_id,
                activity_name: schedule.activity_name,
                day_of_week: schedule.day_of_week,
                start_time: schedule.start_time,
                language: schedule.language || "Bahasa Indonesia",
                category: schedule.category || "Misa Mingguan"
            });
        } else {
            setEditingId(null);
            // Reset to defaults
            setFormData({
                church_id: churches.length > 0 ? churches[0].id : "",
                activity_name: "",
                day_of_week: 7,
                start_time: "08:00",
                language: "Bahasa Indonesia",
                category: "Misa Mingguan"
            });
        }
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Hapus jadwal ini?")) return;

        // Optimistic update
        const previous = [...schedules];
        setSchedules(prev => prev.filter(s => s.id !== id));

        const { error } = await supabase.from('mass_schedules').delete().eq('id', id);

        if (error) {
            setSchedules(previous);
            showToast("Gagal menghapus data", "error");
        } else {
            showToast("Jadwal dihapus", "success");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.church_id || !formData.category) {
            showToast("Mohon lengkapi data", "error");
            return;
        }

        setSaving(true);
        try {
            // Auto-generate name if empty? Or just use Category + Language? 
            // Let's ensure activity_name is populated.
            const finalActivityName = formData.activity_name || `${formData.category} (${formData.language})`;

            const payload = {
                church_id: formData.church_id,
                activity_name: finalActivityName,
                day_of_week: Number(formData.day_of_week),
                start_time: formData.start_time,
                language: formData.language,
                category: formData.category
            };

            if (editingId) {
                const { error } = await supabase
                    .from('mass_schedules')
                    .update(payload)
                    .eq('id', editingId);
                if (error) throw error;
                showToast("Jadwal diperbarui", "success");
            } else {
                const { error } = await supabase
                    .from('mass_schedules')
                    .insert(payload);
                if (error) throw error;
                showToast("Jadwal baru ditambahkan", "success");
            }

            setIsModalOpen(false);
            fetchData(); // Refresh list

        } catch (error: any) {
            console.error("Save error:", error);
            showToast(`Error: ${error.message}`, "error");
        } finally {
            setSaving(false);
        }
    };

    const getDayLabel = (val: number) => DAYS.find(d => d.value === val)?.label || "Unknown";

    // Client-side filtering
    const filteredSchedules = schedules.filter(s =>
        (s.activity_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (s.churches?.name?.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Calendar className="w-8 h-8 text-purple-600" />
                        Manajemen Jadwal Misa
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400">
                        Atur jadwal ekaristi, pengakuan dosa, dan event rutin gereja.
                    </p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-lg shadow-purple-200 dark:shadow-purple-900/20 transition-all transform hover:-translate-y-0.5"
                >
                    <Plus className="w-5 h-5" />
                    Tambah Jadwal
                </button>
            </div>

            {/* Toolbar */}
            <div className="flex gap-4 items-center bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Cari berdasarkan nama gereja atau kegiatan..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Gereja</th>
                                <th className="px-6 py-4">Hari & Waktu</th>
                                <th className="px-6 py-4">Kegiatan</th>
                                <th className="px-6 py-4">Kategori / Bahasa</th>
                                <th className="px-6 py-4 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-400">Loading...</td>
                                </tr>
                            ) : filteredSchedules.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-400 italic">Tidak ada jadwal ditemukan.</td>
                                </tr>
                            ) : (
                                filteredSchedules.map((schedule) => (
                                    <tr key={schedule.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                                            {schedule.churches?.name}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-1 rounded text-xs font-bold w-16 text-center ${schedule.day_of_week === 7 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                                                        schedule.day_of_week === 6 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                                                            'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                                    }`}>
                                                    {getDayLabel(schedule.day_of_week)}
                                                </span>
                                                <div className="flex items-center gap-1 font-mono text-slate-600 dark:text-slate-400">
                                                    <Clock className="w-3 h-3" />
                                                    {schedule.start_time.slice(0, 5)}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-medium">
                                            {schedule.activity_name}
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                                            <div className="space-y-1">
                                                {schedule.category && (
                                                    <div className="text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded inline-block">
                                                        {schedule.category}
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-1 text-xs">
                                                    <Globe className="w-3 h-3" /> {schedule.language}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleOpenModal(schedule)}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(schedule.id)}
                                                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                {editingId ? "Edit Jadwal" : "Tambah Jadwal Baru"}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {/* Church Select */}
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Pilih Gereja</label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                    <select
                                        value={formData.church_id}
                                        onChange={(e) => setFormData({ ...formData, church_id: e.target.value })}
                                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-sm"
                                        required
                                    >
                                        <option value="">-- Pilih Gereja --</option>
                                        {churches.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Category & Language */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Kategori</label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-sm"
                                    >
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Bahasa</label>
                                    <select
                                        value={formData.language}
                                        onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-sm"
                                    >
                                        {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Activity Name (Optional Override) */}
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Nama Kegiatan (Opsional)</label>
                                <input
                                    type="text"
                                    placeholder="Ex: Misa Paskah (Default: Kategori + Bahasa)"
                                    value={formData.activity_name}
                                    onChange={(e) => setFormData({ ...formData, activity_name: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-sm"
                                />
                            </div>

                            {/* Day & Time */}
                            <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Hari</label>
                                    <select
                                        value={formData.day_of_week}
                                        onChange={(e) => setFormData({ ...formData, day_of_week: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium"
                                    >
                                        {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Jam</label>
                                    <input
                                        type="time"
                                        value={formData.start_time}
                                        onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono font-bold"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="pt-4 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    disabled={saving}
                                    className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold shadow-md flex items-center gap-2"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Simpan
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
