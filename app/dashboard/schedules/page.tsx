"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Schedule {
    id: string;
    church_id: string;
    activity_name: string;
    day_of_week: string;
    start_time: string;
    language?: string;
    churches?: {
        name: string;
    };
}

const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const LANGUAGES = ["Bahasa Indonesia", "English", "Bahasa Jawa", "Bahasa Mandarin"];

export default function SchedulesPage() {
    // Data State
    const [churches, setChurches] = useState<any[]>([]);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Form State
    const [churchId, setChurchId] = useState("");
    const [activityName, setActivityName] = useState("");
    const [day, setDay] = useState(DAYS[6]); // Default Minggu
    const [time, setTime] = useState("");
    const [language, setLanguage] = useState(LANGUAGES[0]);

    // Edit State
    const [editingId, setEditingId] = useState<string | null>(null);

    // Initial Fetch
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);

            // Fetch Churches
            const { data: churchData } = await supabase
                .from('churches')
                .select('id, name')
                .order('name');
            if (churchData) setChurches(churchData);

            // Fetch Schedules
            await fetchSchedules();

        } catch (error) {
            console.error("Error loading data:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSchedules = async () => {
        const { data, error } = await supabase
            .from('mass_schedules')
            .select(`
                *,
                churches ( name )
            `)
            .order('day_of_week')
            .order('start_time');

        if (error) {
            console.error("Error fetching schedules:", error);
        } else if (data) {
            setSchedules(data as Schedule[]);
        }
    };

    const handleEdit = (schedule: Schedule) => {
        setEditingId(schedule.id);
        setChurchId(schedule.church_id);
        setActivityName(schedule.activity_name);
        setDay(schedule.day_of_week);
        setTime(schedule.start_time);
        setLanguage(schedule.language || LANGUAGES[0]);
        // Scroll to form (optional, simplified by layout)
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setActivityName("");
        setTime("");
        setLanguage(LANGUAGES[0]);
        setDay(DAYS[6]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        if (!churchId || !activityName || !day || !time) {
            alert("Mohon lengkapi semua field required.");
            setSubmitting(false);
            return;
        }

        try {
            if (editingId) {
                // Update Logic
                const { error } = await supabase
                    .from('mass_schedules')
                    .update({
                        church_id: churchId,
                        activity_name: activityName,
                        day_of_week: day,
                        start_time: time,
                        language: language
                    })
                    .eq('id', editingId);

                if (error) throw error;
                alert("Jadwal berhasil diperbarui!");
                handleCancelEdit(); // Reset edit state
            } else {
                // Insert Logic
                const { error } = await supabase.from('mass_schedules').insert({
                    church_id: churchId,
                    activity_name: activityName,
                    day_of_week: day,
                    start_time: time,
                    language: language
                });

                if (error) throw error;
                alert("Jadwal Misa berhasil ditambahkan!");
                // Reset form fields
                setActivityName("");
                setTime("");
            }

            await fetchSchedules();

        } catch (error: any) {
            alert("Gagal menyimpan jadwal: " + error.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Apakah Anda yakin ingin menghapus jadwal ini?")) return;

        try {
            const { error } = await supabase
                .from('mass_schedules')
                .delete()
                .eq('id', id);

            if (error) throw error;

            setSchedules(prev => prev.filter(s => s.id !== id));

        } catch (error: any) {
            alert("Gagal menghapus: " + error.message);
        }
    };

    return (
        <div className="min-h-screen bg-[#2C225B] text-gray-100 font-sans p-6 md:p-12">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-3xl font-bold mb-2">Manajemen Jawal Misa</h1>
                <p className="text-indigo-200 mb-8">Atur jadwal perayaan ekaristi dan kegiatan gereja lainnya.</p>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* LEFT PANEL: FORM */}
                    <div className="lg:col-span-1">
                        <div className="bg-[#1F1842] p-6 rounded-2xl shadow-xl border border-indigo-900/50 sticky top-24">
                            <h2 className="text-xl font-bold mb-6 text-orange-400 flex items-center gap-2">
                                {editingId ? (
                                    <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                        Edit Jadwal
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                                        Tambah Jadwal Baru
                                    </>
                                )}
                            </h2>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Gereja</label>
                                    <select
                                        value={churchId}
                                        onChange={(e) => setChurchId(e.target.value)}
                                        className="w-full bg-[#2C225B] border border-indigo-900 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500 transition-colors"
                                        required
                                    >
                                        <option value="">-- Pilih Gereja --</option>
                                        {churches.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Nama Kegiatan</label>
                                    <input
                                        type="text"
                                        value={activityName}
                                        onChange={(e) => setActivityName(e.target.value)}
                                        placeholder="Contoh: Misa Minggu Pagi"
                                        className="w-full bg-[#2C225B] border border-indigo-900 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500 transition-colors placeholder-indigo-400/50"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Hari</label>
                                        <select
                                            value={day}
                                            onChange={(e) => setDay(e.target.value)}
                                            className="w-full bg-[#2C225B] border border-indigo-900 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500 transition-colors"
                                        >
                                            {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Jam Mulai</label>
                                        <input
                                            type="time"
                                            value={time}
                                            onChange={(e) => setTime(e.target.value)}
                                            className="w-full bg-[#2C225B] border border-indigo-900 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500 transition-colors"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Bahasa (Opsional)</label>
                                    <select
                                        value={language}
                                        onChange={(e) => setLanguage(e.target.value)}
                                        className="w-full bg-[#2C225B] border border-indigo-900 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500 transition-colors"
                                    >
                                        <option value="">-- Tidak Spesifik --</option>
                                        {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className={`w-full font-bold py-3 rounded-lg shadow-lg transition-all active:scale-95 mt-4 disabled:opacity-50 ${editingId
                                            ? 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 shadow-blue-900/20 text-white'
                                            : 'bg-gradient-to-r from-orange-500 to-pink-600 hover:from-orange-400 hover:to-pink-500 shadow-orange-900/20 text-white'
                                        }`}
                                >
                                    {submitting ? 'Menyimpan...' : (editingId ? 'Update Jadwal' : 'Simpan Jadwal')}
                                </button>

                                {editingId && (
                                    <button
                                        type="button"
                                        onClick={handleCancelEdit}
                                        className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-3 rounded-lg transition-colors mt-2"
                                    >
                                        Batal Edit
                                    </button>
                                )}
                            </form>
                        </div>
                    </div>

                    {/* RIGHT PANEL: LIST */}
                    <div className="lg:col-span-2">
                        <div className="bg-[#1F1842] rounded-2xl shadow-xl border border-indigo-900/50 overflow-hidden">
                            <div className="p-6 border-b border-indigo-900/50">
                                <h2 className="text-xl font-bold text-white">Daftar Jadwal Misa</h2>
                            </div>

                            {loading ? (
                                <div className="p-8 text-center text-gray-400 animate-pulse">Memuat data...</div>
                            ) : schedules.length === 0 ? (
                                <div className="p-8 text-center text-gray-500">
                                    Belum ada jadwal yang ditambahkan.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-indigo-900/50">
                                        <thead className="bg-[#181236]">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Gereja</th>
                                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Kegiatan</th>
                                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Waktu</th>
                                                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-indigo-900/50">
                                            {schedules.map((schedule) => (
                                                <tr key={schedule.id} className={`transition-colors ${editingId === schedule.id ? 'bg-indigo-900/30 border-l-2 border-orange-500' : 'hover:bg-indigo-900/20'}`}>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm font-medium text-white">{schedule.churches?.name}</div>
                                                        <div className="text-xs text-indigo-300">{schedule.language}</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm text-gray-200">{schedule.activity_name}</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">
                                                            {schedule.day_of_week}, {schedule.start_time.slice(0, 5)}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                onClick={() => handleEdit(schedule)}
                                                                className="text-blue-400 hover:text-blue-300 bg-blue-900/20 p-2 rounded-lg border border-blue-900/50 hover:bg-blue-900/40 transition-colors"
                                                                title="Edit"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(schedule.id)}
                                                                className="text-red-400 hover:text-red-300 bg-red-900/20 p-2 rounded-lg border border-red-900/50 hover:bg-red-900/40 transition-colors"
                                                                title="Hapus"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
