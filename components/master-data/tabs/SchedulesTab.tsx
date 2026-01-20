"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Plus, Edit2, Trash2, Loader2, Save, Calendar, Clock, Languages, Tag, MapPin } from "lucide-react";

// --- Interfaces ---

interface Schedule {
    id: string;
    church_id: string;
    day_of_week: number;
    time_start: string;
    language: string;
    label: string | null;
}

interface Country {
    id: string;
    name: string;
    flag_emoji: string;
}

interface Diocese {
    id: string;
    name: string;
}

interface Church {
    id: string;
    name: string;
}

// --- Constants ---

const DAYS = [
    { value: 0, label: "Minggu" },
    { value: 1, label: "Senin" },
    { value: 2, label: "Selasa" },
    { value: 3, label: "Rabu" },
    { value: 4, label: "Kamis" },
    { value: 5, label: "Jumat" },
    { value: 6, label: "Sabtu" },
];

const LABEL_OPTIONS = [
    "Misa Harian",
    "Misa Mingguan",
    "Misa Jumat Pertama",
    "Misa Arwah",
    "Misa Hari Raya"
];

const LANGUAGE_OPTIONS = [
    "Bahasa Indonesia",
    "English",
    "Mandarin",
    "Offline",
    "Online",
    "Offline & Online"
];

export default function SchedulesTab() {
    const { showToast } = useToast();

    // --- State: Cascading Selection ---
    const [selectedCountry, setSelectedCountry] = useState("");
    const [selectedDiocese, setSelectedDiocese] = useState("");
    const [selectedChurch, setSelectedChurch] = useState("");

    // --- State: Data for Dropdowns ---
    const [countries, setCountries] = useState<Country[]>([]);
    const [dioceses, setDioceses] = useState<Diocese[]>([]);
    const [churches, setChurches] = useState<Church[]>([]);

    // --- State: Schedules Data ---
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [loading, setLoading] = useState(false);

    // --- State: Modal & Form ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingItem, setEditingItem] = useState<Schedule | null>(null);

    const [formData, setFormData] = useState({
        day_of_week: 0,
        time_start: "08:00",
        language: "Bahasa Indonesia",
        label: "Misa Mingguan"
    });

    // --- Effects: Cascading Logic ---

    // 1. Load Countries on Mount
    useEffect(() => {
        const fetchCountries = async () => {
            const { data } = await supabase.from('countries').select('id, name, flag_emoji').order('name');
            setCountries(data || []);
        };
        fetchCountries();
    }, []);

    // 2. Load Dioceses when Country changes (Reset lower levels)
    useEffect(() => {
        // Reset Logic
        setDioceses([]);
        setSelectedDiocese("");
        setChurches([]);
        setSelectedChurch("");
        setSchedules([]);

        if (selectedCountry) {
            const fetchDioceses = async () => {
                const { data } = await supabase.from('dioceses').select('id, name').eq('country_id', selectedCountry).order('name');
                setDioceses(data || []);
            };
            fetchDioceses();
        }
    }, [selectedCountry]);

    // 3. Load Churches when Diocese changes (Reset lower levels)
    useEffect(() => {
        // Reset Logic
        setChurches([]);
        setSelectedChurch("");
        setSchedules([]);

        if (selectedDiocese) {
            const fetchChurches = async () => {
                const { data } = await supabase.from('churches').select('id, name').eq('diocese_id', selectedDiocese).order('name');
                setChurches(data || []);
            };
            fetchChurches();
        }
    }, [selectedDiocese]);

    // 4. Load Schedules when Church changes
    useEffect(() => {
        setSchedules([]); // Clear previous church's schedules immediately
        if (selectedChurch) {
            const fetchSchedules = async () => {
                setLoading(true);
                const { data, error } = await supabase
                    .from('mass_schedules')
                    .select('*')
                    .eq('church_id', selectedChurch)
                    .order('day_of_week', { ascending: true })
                    .order('time_start', { ascending: true });

                if (error) {
                    showToast("Gagal memuat jadwal: " + error.message, "error");
                } else {
                    setSchedules(data || []);
                }
                setLoading(false);
            };
            fetchSchedules();
        }
    }, [selectedChurch]);

    // --- Handlers ---

    const handleOpenAdd = () => {
        if (!selectedChurch) {
            showToast("Pilih paroki terlebih dahulu!", "error");
            return;
        }
        setEditingItem(null);
        setFormData({
            day_of_week: 0,
            time_start: "08:00",
            language: "Bahasa Indonesia",
            label: "Misa Mingguan"
        });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (item: Schedule) => {
        setEditingItem(item);
        setFormData({
            day_of_week: item.day_of_week,
            time_start: item.time_start.substring(0, 5), // Ensure HH:MM
            language: item.language || "",
            label: item.label || ""
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Hapus jadwal misa ini?")) return;

        const { error } = await supabase.from('mass_schedules').delete().eq('id', id);
        if (error) {
            showToast("Gagal menghapus data", "error");
        } else {
            showToast("Jadwal berhasil dihapus", "success");
            // Refresh list
            const { data } = await supabase.from('mass_schedules').select('*').eq('church_id', selectedChurch).order('day_of_week').order('time_start');
            setSchedules(data || []);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedChurch || isSubmitting) return;

        setIsSubmitting(true);
        try {
            const payload = {
                church_id: selectedChurch,
                day_of_week: Number(formData.day_of_week),
                time_start: formData.time_start,
                language: formData.language,
                label: formData.label
            };

            if (editingItem) {
                const { error } = await supabase.from('mass_schedules').update(payload).eq('id', editingItem.id);
                if (error) throw error;
                showToast("Jadwal diperbarui", "success");
            } else {
                const { error } = await supabase.from('mass_schedules').insert(payload);
                if (error) throw error;
                showToast("Jadwal ditambahkan", "success");
            }

            // Refresh list manually to avoid complex dep arrays or full page reload
            const { data } = await supabase.from('mass_schedules').select('*').eq('church_id', selectedChurch).order('day_of_week').order('time_start');
            setSchedules(data || []);
            setIsModalOpen(false);

        } catch (e: any) {
            showToast(e.message, "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300">
            {/* Header: Cascading Dropdowns */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <div className="flex items-center gap-2 mb-4 text-purple-600 dark:text-purple-400 font-bold uppercase text-xs tracking-wider">
                    <MapPin className="w-4 h-4" /> Filter Lokasi Gereja
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Country */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1 ml-1">Negara</label>
                        <select
                            className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-purple-500"
                            value={selectedCountry}
                            onChange={(e) => setSelectedCountry(e.target.value)}
                        >
                            <option value="">-- Pilih Negara --</option>
                            {countries.map(c => <option key={c.id} value={c.id}>{c.flag_emoji} {c.name}</option>)}
                        </select>
                    </div>

                    {/* Diocese */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1 ml-1">Keuskupan</label>
                        <select
                            className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                            value={selectedDiocese}
                            onChange={(e) => setSelectedDiocese(e.target.value)}
                            disabled={!selectedCountry}
                        >
                            <option value="">-- Pilih Keuskupan --</option>
                            {dioceses.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>

                    {/* Church */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1 ml-1">Paroki</label>
                        <select
                            className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                            value={selectedChurch}
                            onChange={(e) => setSelectedChurch(e.target.value)}
                            disabled={!selectedDiocese}
                        >
                            <option value="">-- Pilih Paroki --</option>
                            {churches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="p-6">
                {!selectedChurch ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-800/20">
                        <Calendar className="w-16 h-16 text-slate-300 mb-4" />
                        <h3 className="text-lg font-bold text-slate-600 dark:text-slate-300">Pilih Gereja Terlebih Dahulu</h3>
                        <p className="text-sm text-slate-400 max-w-sm mt-1">Silakan pilih Negara, Keuskupan, lalu Paroki di bagian atas untuk melihat dan mengelola jadwal misa.</p>
                    </div>
                ) : (
                    <>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-600">
                                Daftar Jadwal Misa
                            </h2>
                            <button
                                onClick={handleOpenAdd}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 text-white rounded-xl font-bold text-sm shadow-md transition-all"
                            >
                                <Plus className="w-4 h-4" /> Tambah Jadwal
                            </button>
                        </div>

                        {loading ? (
                            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-purple-600" /></div>
                        ) : schedules.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl">Belum ada jadwal misa untuk paroki ini.</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {schedules.map((schedule) => (
                                    <div key={schedule.id} className="relative group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl hover:shadow-lg hover:border-purple-200 dark:hover:border-purple-800 transition-all duration-300">

                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase">
                                                    {DAYS.find(d => d.value === schedule.day_of_week)?.label}
                                                </div>
                                                <div className="px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 text-xs font-bold font-mono">
                                                    {schedule.time_start.slice(0, 5)}
                                                </div>
                                            </div>

                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleOpenEdit(schedule)} className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => handleDelete(schedule.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5 ">
                                            <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold text-sm">
                                                <Tag className="w-3.5 h-3.5 text-slate-400" />
                                                {schedule.label || "Misa"}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                                <Languages className="w-3.5 h-3.5 text-slate-400" />
                                                {schedule.language}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? "Edit Jadwal Misa" : "Tambah Jadwal Misa"}>
                <form onSubmit={handleSave} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Hari</label>
                            <select
                                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 dark:text-white"
                                value={formData.day_of_week}
                                onChange={e => setFormData({ ...formData, day_of_week: Number(e.target.value) })}
                            >
                                {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Waktu</label>
                            <input
                                type="time"
                                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 dark:text-white"
                                value={formData.time_start || ""} /* FORCE NOT NULL */
                                onChange={e => setFormData({ ...formData, time_start: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Kegiatan (Label)</label>
                        <select
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 dark:text-white"
                            value={formData.label || "Misa"} /* FORCE NOT NULL */
                            onChange={e => setFormData({ ...formData, label: e.target.value })}
                        >
                            {LABEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Bahasa / Keterangan</label>
                        <select
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 dark:text-white"
                            value={formData.language || "Bahasa Indonesia"} /* FORCE NOT NULL */
                            onChange={e => setFormData({ ...formData, language: e.target.value })}
                        >
                            {LANGUAGE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800">
                            Batal
                        </button>
                        <button type="submit" disabled={isSubmitting} className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-bold hover:opacity-90 flex justify-center items-center gap-2">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Simpan
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
