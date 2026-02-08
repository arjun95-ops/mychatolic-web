"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Plus, Edit2, Trash2, Loader2, Calendar, Clock, MapPin } from "lucide-react";

// --- Interfaces (Schema Agnostic) ---

interface AnySchedule {
    id: string;
    church_id: string;
    // Variations of day column
    day?: number;
    day_of_week?: number;
    day_number?: number;
    // Variations of time column
    time_start?: string;
    start_time?: string;
    time?: string;
    // Variations of label/activity
    label?: string;
    category?: string;
    activity_name?: string;
    // Language usually consistent
    language?: string;
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

// --- Constants & Helpers ---

const DAYS_MAP: Record<number, string> = {
    0: "Minggu",
    1: "Senin",
    2: "Selasa",
    3: "Rabu",
    4: "Kamis",
    5: "Jumat",
    6: "Sabtu",
    7: "Minggu"
};

const LABEL_OPTIONS = [
    "Misa Mingguan",
    "Misa Harian",
    "Misa Jumat Pertama",
    "Misa Arwah",
    "Misa Hari Raya",
    "Lainnya"
];

// Normalize helpers
const getDay = (s: AnySchedule): number => s.day ?? s.day_of_week ?? s.day_number ?? 0;
// Internal logic uses 24h format "HH:MM"
const getTime = (s: AnySchedule): string => (s.time_start ?? s.start_time ?? s.time ?? "00:00").substring(0, 5);
const getLabel = (s: AnySchedule): string => s.label ?? s.category ?? s.activity_name ?? "Lainnya";
const getLang = (s: AnySchedule): string => s.language ?? "Offline";

// Time Format Helpers
const formatAmPm = (time24: string): string => {
    if (!time24) return "";
    const [hStr, mStr] = time24.split(":");
    let h = parseInt(hStr, 10);
    const m = mStr || "00";
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    h = h ? h : 12; // the hour '0' should be '12'
    return `${h}:${m} ${ampm}`;
};

const to12h = (time24: string) => {
    const [hStr, mStr] = time24.split(":");
    let h = parseInt(hStr || "0", 10);
    const m = mStr || "00";
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    h = h ? h : 12;
    return { hour: h, minute: m, ampm };
};

const to24h = (hour12: number, minute: string, ampm: string): string => {
    let h = hour12;
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    const hStr = h.toString().padStart(2, "0");
    return `${hStr}:${minute}`;
};

// Generate Time Dropdown Options
const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = ["00", "15", "30", "45"];
const MINUTES_DETAILED = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, "0"));

export default function SchedulesTab() {
    const { showToast } = useToast();

    // --- State: Cascading Selection ---
    const [selectedCountry, setSelectedCountry] = useState("");
    const [selectedDiocese, setSelectedDiocese] = useState("");
    const [selectedChurch, setSelectedChurch] = useState("");

    // --- State: Data ---
    const [countries, setCountries] = useState<Country[]>([]);
    const [dioceses, setDioceses] = useState<Diocese[]>([]);
    const [churches, setChurches] = useState<Church[]>([]);

    // Raw schedules from DB
    const [rawSchedules, setRawSchedules] = useState<AnySchedule[]>([]);
    const [loading, setLoading] = useState(false);

    // --- State: Modal ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingItem, setEditingItem] = useState<AnySchedule | null>(null);

    // Form data
    // We store split time for UI
    const [formData, setFormData] = useState({
        day: 0,
        hour: 8,
        minute: "00",
        ampm: "AM",
        label: "Misa Mingguan",
        language: "Bahasa Indonesia"
    });

    // --- Effects: Selection Logic ---

    useEffect(() => {
        const fetchCountries = async () => {
            const { data } = await supabase.from('countries').select('id, name, flag_emoji').order('name');
            setCountries(data || []);
        };
        fetchCountries();
    }, []);

    useEffect(() => {
        setDioceses([]); setSelectedDiocese("");
        setChurches([]); setSelectedChurch("");
        setRawSchedules([]);
        if (selectedCountry) {
            supabase.from('dioceses').select('id, name').eq('country_id', selectedCountry).order('name')
                .then(({ data }) => setDioceses(data || []));
        }
    }, [selectedCountry]);

    useEffect(() => {
        setChurches([]); setSelectedChurch("");
        setRawSchedules([]);
        if (selectedDiocese) {
            supabase.from('churches').select('id, name').eq('diocese_id', selectedDiocese).order('name')
                .then(({ data }) => setChurches(data || []));
        }
    }, [selectedDiocese]);

    useEffect(() => {
        setRawSchedules([]);
        if (selectedChurch) fetchSchedules();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedChurch]);

    // --- Fetch Logic (Schema Agnostic) ---
    const fetchSchedules = async () => {
        setLoading(true);
        // Simple select *, handle sorting in JS
        const { data, error } = await supabase
            .from('mass_schedules')
            .select('*')
            .eq('church_id', selectedChurch);

        if (error) {
            console.error("Fetch Error:", error);
            showToast("Gagal memuat jadwal. Cek koneksi atau schema.", "error");
        } else {
            // Sort in JS: Day -> Time (using 24h format for consistent sort)
            const sorted = (data || []).sort((a: AnySchedule, b: AnySchedule) => {
                const da = getDay(a);
                const db = getDay(b);
                const daNorm = da === 0 ? 7 : da;
                const dbNorm = db === 0 ? 7 : db;

                if (daNorm !== dbNorm) return daNorm - dbNorm;
                return getTime(a).localeCompare(getTime(b));
            });
            setRawSchedules(sorted);
        }
        setLoading(false);
    };

    // --- CRUD Handlers ---

    const handleOpenAdd = () => {
        if (!selectedChurch) return showToast("Pilih paroki dulu!", "error");
        setEditingItem(null);
        setFormData({
            day: 0,
            hour: 8,
            minute: "00",
            ampm: "AM",
            label: "Misa Mingguan",
            language: "Bahasa Indonesia"
        });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (item: AnySchedule) => {
        setEditingItem(item);
        const t = to12h(getTime(item));
        setFormData({
            day: getDay(item),
            hour: t.hour,
            minute: t.minute,
            ampm: t.ampm,
            label: getLabel(item),
            language: getLang(item)
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Hapus jadwal ini?")) return;
        const { error } = await supabase.from('mass_schedules').delete().eq('id', id);
        if (error) showToast("Gagal hapus: " + error.message, "error");
        else {
            showToast("Terhapus", "success");
            fetchSchedules();
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);

        try {
            const time24 = to24h(formData.hour, formData.minute, formData.ampm);

            // Try Payload V1 (day, time_start, label)
            const payloadV1 = {
                church_id: selectedChurch,
                day: Number(formData.day),
                time_start: time24,
                label: formData.label,
                language: formData.language
            };

            // Try Payload V2 (day_of_week, start_time, activity_name/category)
            const payloadV2 = {
                church_id: selectedChurch,
                day_of_week: Number(formData.day),
                start_time: time24,
                activity_name: formData.label,
                category: formData.label,
                language: formData.language
            };

            let finalError = null;
            let success = false;

            const tryOperation = async (payload: any) => {
                if (editingItem) {
                    return await supabase.from('mass_schedules').update(payload).eq('id', editingItem.id);
                } else {
                    return await supabase.from('mass_schedules').insert(payload);
                }
            };

            // Attempt 1
            const res1 = await tryOperation(payloadV1);
            if (!res1.error) {
                success = true;
            } else {
                console.warn("V1 Failed, trying V2", res1.error);
                const res2 = await tryOperation(payloadV2);
                if (!res2.error) {
                    success = true;
                } else {
                    finalError = res2.error;
                }
            }

            if (!success && finalError) throw finalError;

            showToast("Berhasil disimpan", "success");
            setIsModalOpen(false);
            fetchSchedules();

        } catch (e: any) {
            console.error(e);
            showToast(e.message || "Gagal menyimpan", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Render Logic ---

    // Constants for styles
    const labelStyle = "block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1";
    const inputStyle = "w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 dark:text-white transition-all";

    // Sub-component: Time Row
    const renderTimeRow = (s: AnySchedule) => (
        <div key={s.id} className="flex justify-between items-center py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0 group">
            <div className="flex items-center gap-6">
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300 w-24 text-center bg-slate-100 dark:bg-slate-800 rounded-lg py-1.5 shadow-sm border border-slate-200 dark:border-slate-700">
                    {formatAmPm(getTime(s))}
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-400 font-medium uppercase tracking-wide flex items-center gap-2">
                    {getLang(s).toUpperCase()}
                </span>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleOpenEdit(s)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={16} /></button>
                <button onClick={() => handleDelete(s.id)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
            </div>
        </div>
    );

    // Grouping
    const grouped = {
        mingguan: [] as AnySchedule[],
        harian: [] as AnySchedule[],
        jumatPertama: [] as AnySchedule[],
        others: [] as AnySchedule[]
    };

    rawSchedules.forEach(s => {
        const lbl = getLabel(s).toLowerCase();
        if (lbl.includes("harian") || lbl.includes("senin")) {
            grouped.harian.push(s);
        } else if (lbl.includes("mingguan") || lbl.includes("sabtu") || lbl.includes("minggu")) {
            grouped.mingguan.push(s);
        } else if (lbl.includes("jumat pertama") || lbl.includes("jum'at pertama")) {
            grouped.jumatPertama.push(s);
        } else {
            grouped.others.push(s);
        }
    });

    const renderSection = (title: string, items: AnySchedule[]) => {
        if (items.length === 0) return null;

        // Group by Day Loop
        // Order: Senin(1)..Sabtu(6)..Minggu(0/7)
        const dayKeys = [1, 2, 3, 4, 5, 6, 7, 0];

        return (
            <div className="mb-10 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 border-b-2 border-slate-100 dark:border-slate-800 pb-2 inline-block">
                    {title}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10">
                    {dayKeys.map(dKey => {
                        const filtered = items.filter(i => {
                            const d = getDay(i);
                            return d === dKey || (dKey === 0 && d === 7) || (dKey === 7 && d === 0);
                        });

                        // Dedup items with exact same ID (in case 0/7 Logic overlaps)
                        const uniqueFiltered = Array.from(new Map(filtered.map(item => [item.id, item])).values())
                            .sort((a, b) => getTime(a).localeCompare(getTime(b)));

                        if (uniqueFiltered.length === 0) return null;
                        if (dKey === 7) return null; // Avoid duplicate printing if we handle 0 as Minggu

                        return (
                            <div key={dKey}>
                                <h4 className="font-bold text-purple-600 dark:text-purple-400 mb-4 uppercase text-sm flex items-center gap-2">
                                    <Calendar className="w-4 h-4" /> {DAYS_MAP[dKey]}
                                </h4>
                                <div className="space-y-1">
                                    {uniqueFiltered.map(renderTimeRow)}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        );
    };

    const renderDailyMass = () => {
        const items = grouped.harian;
        if (items.length === 0) return null;

        const weekdayItems = items.filter(i => { const d = getDay(i); return d >= 1 && d <= 5; });
        const saturdayItems = items.filter(i => getDay(i) === 6);

        // Union logic for Weekdays: Distinct by Time+Lang
        const unionWeekdays = Array.from(new Map(weekdayItems.map(item => [getTime(item) + getLang(item), item])).values())
            .sort((a, b) => getTime(a).localeCompare(getTime(b)));

        return (
            <div className="mb-10 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 border-b-2 border-slate-100 dark:border-slate-800 pb-2 inline-block">
                    Misa Harian
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10">
                    <div>
                        <h4 className="font-bold text-blue-600 dark:text-blue-400 mb-4 uppercase text-sm flex items-center gap-2">
                            <Calendar className="w-4 h-4" /> Senin - Jum&apos;at
                        </h4>
                        <div className="space-y-1">
                            {unionWeekdays.length > 0 ? unionWeekdays.map(renderTimeRow) : <p className="text-slate-400 italic text-sm">Tidak ada jadwal.</p>}
                        </div>
                    </div>
                    {saturdayItems.length > 0 && (
                        <div>
                            <h4 className="font-bold text-blue-600 dark:text-blue-400 mb-4 uppercase text-sm flex items-center gap-2">
                                <Calendar className="w-4 h-4" /> Sabtu
                            </h4>
                            <div className="space-y-1">
                                {saturdayItems.sort((a, b) => getTime(a).localeCompare(getTime(b))).map(renderTimeRow)}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const renderFirstFriday = () => {
        const items = grouped.jumatPertama;
        if (items.length === 0) return null;

        const sorted = items.sort((a, b) => getTime(a).localeCompare(getTime(b)));

        return (
            <div className="mb-10 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 border-b-2 border-slate-100 dark:border-slate-800 pb-2 inline-block">
                    Jumat Pertama
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10">
                    <div>
                        <h4 className="font-bold text-pink-600 dark:text-pink-400 mb-4 uppercase text-sm flex items-center gap-2">
                            <Calendar className="w-4 h-4" /> Jumat
                        </h4>
                        <div className="space-y-1">
                            {sorted.map(renderTimeRow)}
                        </div>
                    </div>
                </div>
            </div>
        );
    }


    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300">
            {/* Header: Locations */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <div className="flex items-center gap-2 mb-4 text-purple-600 dark:text-purple-400 font-bold uppercase text-xs tracking-wider">
                    <MapPin className="w-4 h-4" /> Filter Lokasi Gereja
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Country */}
                    <div>
                        <select className={inputStyle} value={selectedCountry} onChange={e => setSelectedCountry(e.target.value)}>
                            <option value="">-- Pilih Negara --</option>
                            {countries.map(c => <option key={c.id} value={c.id}>{c.flag_emoji} {c.name}</option>)}
                        </select>
                    </div>
                    {/* Diocese */}
                    <div>
                        <select className={inputStyle} value={selectedDiocese} onChange={e => setSelectedDiocese(e.target.value)} disabled={!selectedCountry}>
                            <option value="">-- Pilih Keuskupan --</option>
                            {dioceses.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                    {/* Church */}
                    <div>
                        <select className={inputStyle} value={selectedChurch} onChange={e => setSelectedChurch(e.target.value)} disabled={!selectedDiocese}>
                            <option value="">-- Pilih Paroki --</option>
                            {churches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* List Area */}
            <div className="p-8 bg-slate-50/30 dark:bg-slate-900/10 min-h-[500px]">
                {!selectedChurch ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 shadow-inner">
                            <Calendar className="w-10 h-10 opacity-30" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-600 dark:text-slate-300">Pilih Paroki</h3>
                        <p className="max-w-xs text-center mt-2 text-sm">Pilih lokasi gereja di menu filter atas untuk menampilkan tabel jadwal misa.</p>
                    </div>
                ) : loading ? (
                    <div className="flex justify-center py-32"><Loader2 className="w-10 h-10 animate-spin text-purple-600" /></div>
                ) : (
                    <>
                        <div className="flex justify-between items-center mb-10 pb-6 border-b border-slate-200 dark:border-slate-800">
                            <div>
                                <h2 className="text-3xl font-serif font-bold text-slate-800 dark:text-white">Jadwal Misa</h2>
                                <p className="text-slate-500 mt-1 flex items-center gap-2 text-sm">
                                    <Clock className="w-4 h-4" /> Mengelola jadwal ekaristi paroki
                                </p>
                            </div>
                            <button
                                onClick={handleOpenAdd}
                                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-purple-200 dark:shadow-purple-900/20 transition-all hover:-translate-y-0.5"
                            >
                                <Plus className="w-4 h-4" /> Tambah Jadwal
                            </button>
                        </div>

                        {rawSchedules.length === 0 ? (
                            <div className="text-center py-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm text-slate-500">
                                <p className="font-medium">Belum ada data jadwal misa untuk paroki ini.</p>
                                <button onClick={handleOpenAdd} className="text-purple-600 font-bold mt-2 hover:underline">Tambah Sekarang</button>
                            </div>
                        ) : (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {renderSection("Misa Mingguan", grouped.mingguan)}
                                {renderDailyMass()}
                                {renderFirstFriday()}
                                {renderSection("Kategori Lainnya", grouped.others)}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? "Edit Jadwal" : "Tambah Jadwal"}>
                <form onSubmit={handleSave} className="space-y-5">

                    {/* Custom Category Input with Datalist */}
                    <div>
                        <label className={labelStyle}>Kategori Misa</label>
                        <input
                            list="categoryList"
                            className={inputStyle}
                            placeholder="Ketik atau pilih (Contoh: Misa Mingguan)"
                            value={formData.label}
                            onChange={e => setFormData({ ...formData, label: e.target.value })}
                            required
                        />
                        <datalist id="categoryList">
                            {LABEL_OPTIONS.map(opt => <option key={opt} value={opt} />)}
                        </datalist>
                        <p className="text-xs text-slate-400 mt-1">Kategori ini menentukan pengelompokan (Grouping) di tampilan jadwal.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                        <div>
                            <label className={labelStyle}>Hari</label>
                            <select className={inputStyle} value={formData.day} onChange={e => setFormData({ ...formData, day: Number(e.target.value) })}>
                                {Object.entries(DAYS_MAP).map(([val, label]) => {
                                    // Only show 0-6 in dropdown (Minggu-Sabtu)
                                    if (val === '7') return null;
                                    return <option key={val} value={val}>{label}</option>
                                })}
                            </select>
                        </div>
                        <div>
                            <label className={labelStyle}>Keterangan / Bahasa</label>
                            <input type="text" className={inputStyle} placeholder="Contoh: OFFLINE / ONLINE" value={formData.language} onChange={e => setFormData({ ...formData, language: e.target.value })} />
                        </div>
                    </div>

                    {/* Time Input Section */}
                    <div>
                        <label className={labelStyle}>Jam Mulai</label>
                        <div className="flex gap-2">
                            <select
                                className={`${inputStyle} text-center font-mono`}
                                value={formData.hour}
                                onChange={(e) => setFormData({ ...formData, hour: Number(e.target.value) })}
                            >
                                {HOURS_12.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                            <span className="self-center font-bold px-1">:</span>
                            <select
                                className={`${inputStyle} text-center font-mono`}
                                value={formData.minute}
                                onChange={(e) => setFormData({ ...formData, minute: e.target.value })}
                            >
                                {MINUTES_DETAILED.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <select
                                className={`${inputStyle} text-center font-bold`}
                                value={formData.ampm}
                                onChange={(e) => setFormData({ ...formData, ampm: e.target.value })}
                            >
                                <option value="AM">AM</option>
                                <option value="PM">PM</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-6 border-t border-slate-100 dark:border-slate-800">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="py-2.5 px-4 flex-1 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                            Batal
                        </button>
                        <button type="submit" disabled={isSubmitting} className="py-2.5 px-4 flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-bold hover:opacity-90 transition-opacity flex justify-center items-center gap-2 shadow-lg shadow-purple-200 dark:shadow-purple-900/20">
                            {isSubmitting && <Loader2 className="animate-spin w-4 h-4" />} Simpan
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
