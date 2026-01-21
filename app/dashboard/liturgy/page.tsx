"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { Save, Calendar, CheckCircle2, AlertCircle, BookOpen } from "lucide-react";

type LiturgicalColor = "green" | "red" | "white" | "purple";

interface Readings {
    bacaan1: string;
    mazmur: string;
    bacaan2?: string;
    injil: string;
}

interface BibleVerseCheck {
    [key: string]: boolean; // key is the reference string (e.g. "Injil"), boolean is Found/NotFound
}

export default function LiturgyPage() {
    const { showToast } = useToast();
    const [date, setDate] = useState<string>("");
    const [feastName, setFeastName] = useState("");
    const [color, setColor] = useState<LiturgicalColor>("green");

    // Split readings state
    const [bacaan1, setBacaan1] = useState("");
    const [mazmur, setMazmur] = useState("");
    const [bacaan2, setBacaan2] = useState("");
    const [injil, setInjil] = useState("");

    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);

    // Bonus: Check status
    const [injilFound, setInjilFound] = useState<boolean | null>(null);

    // Initial date default: Today
    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        setDate(today);
    }, []);

    // Fetch schema on date change
    useEffect(() => {
        if (!date) return;

        const fetchData = async () => {
            setFetching(true);
            try {
                const { data, error } = await supabase
                    .from('daily_liturgy')
                    .select('*')
                    .eq('date', date)
                    .single();

                if (error && error.code !== 'PGRST116') throw error;

                if (data) {
                    setFeastName(data.feast_name || "");
                    setColor(data.color as LiturgicalColor || "green");

                    const r = data.readings as Readings || {};
                    setBacaan1(r.bacaan1 || "");
                    setMazmur(r.mazmur || "");
                    setBacaan2(r.bacaan2 || "");
                    setInjil(r.injil || "");

                    // Reset validation status on load
                    setInjilFound(null);
                } else {
                    // Reset form if no data found for this date
                    setFeastName("");
                    setColor("green");
                    setBacaan1("");
                    setMazmur("");
                    setBacaan2("");
                    setInjil("");
                    setInjilFound(null);
                }
            } catch (err: any) {
                console.error("Error fetching liturgy:", err);
                showToast("Gagal mengambil data liturgi", "error");
            } finally {
                setFetching(false);
            }
        };

        fetchData();
    }, [date, showToast]);

    // Simple validation logic (Bonus)
    // Tries to find if the text input resembles a valid book in our system
    // Very naive implementation as requested 'Bonus'
    const validateInjil = async (text: string) => {
        if (!text) {
            setInjilFound(null);
            return;
        }

        // Try to extract book name/abbr. e.g., "Mrk 1:1" -> "Mrk"
        const match = text.trim().split(' ')[0];
        if (!match) return;

        // Remove numbers if attached (unlikely in standardized inputs but possible)
        const bookQuery = match.replace(/[0-9:,-]/g, '');

        if (bookQuery.length < 2) return;

        // Check if bible_books has a match for name or abbreviation
        const { data, error } = await supabase
            .from('bible_books')
            .select('id')
            .or(`name.ilike.%${bookQuery}%,abbreviation.ilike.${bookQuery}`)
            .limit(1);

        if (data && data.length > 0) {
            setInjilFound(true);
        } else {
            setInjilFound(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const readings: Readings = {
                bacaan1,
                mazmur,
                injil
            };
            if (bacaan2.trim()) readings.bacaan2 = bacaan2;

            const { error } = await supabase
                .from('daily_liturgy')
                .upsert({
                    date: date,
                    feast_name: feastName,
                    color: color,
                    readings: readings
                });

            if (error) throw error;

            showToast("Data Liturgi Tersimpan", "success");
        } catch (err: any) {
            console.error("Error saving liturgy:", err);
            showToast(`Gagal menyimpan: ${err.message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    const colors = [
        { value: 'green', label: 'Hijau (Masa Biasa)', bg: 'bg-green-600' },
        { value: 'red', label: 'Merah (Martir/Roh Kudus)', bg: 'bg-red-600' },
        { value: 'white', label: 'Putih (Hari Raya)', bg: 'bg-slate-100 border-slate-300' }, // visible on white
        { value: 'purple', label: 'Ungu (Adven/Prapaskah)', bg: 'bg-purple-600' },
    ];

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Calendar className="w-8 h-8 text-blue-600" />
                    Manajemen Liturgi Harian
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                    Atur kalender liturgi, warna, dan bacaan harian.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left Column: Date & Colors */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            Tanggal Liturgi
                        </label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
                            Warna Liturgi
                        </label>
                        <div className="space-y-3">
                            {colors.map((c) => (
                                <label
                                    key={c.value}
                                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${color === c.value
                                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                                            : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'
                                        }`}
                                >
                                    <input
                                        type="radio"
                                        name="color"
                                        value={c.value}
                                        checked={color === c.value}
                                        onChange={() => setColor(c.value as LiturgicalColor)}
                                        className="sr-only"
                                    />
                                    <div className={`w-6 h-6 rounded-full shadow-sm ${c.bg} ${c.value === 'white' ? 'border' : ''}`}></div>
                                    <span className={`text-sm font-medium ${color === c.value ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-400'}`}>
                                        {c.label}
                                    </span>
                                    {color === c.value && <CheckCircle2 className="w-5 h-5 text-blue-600 ml-auto" />}
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column: Details Form */}
                <div className="md:col-span-2">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm h-full relative">
                        {fetching && (
                            <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">
                                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        )}

                        <form onSubmit={handleSave} className="space-y-6">
                            {/* Feast Name */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                    Nama Perayaan / Pesta
                                </label>
                                <input
                                    type="text"
                                    value={feastName}
                                    onChange={(e) => setFeastName(e.target.value)}
                                    placeholder="Contoh: Hari Raya Natal, Peringatan Wajib St. Petrus"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 placeholder:text-slate-400"
                                />
                            </div>

                            <div className="border-t border-slate-100 dark:border-slate-800 my-4"></div>

                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Bacaan Kitab Suci</h3>

                            {/* Readings Inputs */}
                            <div className="grid grid-cols-1 gap-5">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Bacaan 1
                                    </label>
                                    <div className="relative">
                                        <BookOpen className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                                        <input
                                            type="text"
                                            value={bacaan1}
                                            onChange={(e) => setBacaan1(e.target.value)}
                                            placeholder="Contoh: Kej 1:1-31"
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 font-mono text-sm"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Mazmur Tanggapan
                                    </label>
                                    <div className="relative">
                                        <BookOpen className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                                        <input
                                            type="text"
                                            value={mazmur}
                                            onChange={(e) => setMazmur(e.target.value)}
                                            placeholder="Contoh: Mzm 23:1-6"
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 font-mono text-sm"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Bacaan 2 <span className="text-slate-400 font-normal ml-1">(Opsional)</span>
                                    </label>
                                    <div className="relative">
                                        <BookOpen className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                                        <input
                                            type="text"
                                            value={bacaan2}
                                            onChange={(e) => setBacaan2(e.target.value)}
                                            placeholder="Contoh: Why 21:1-5"
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 font-mono text-sm"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex justify-between">
                                        <span>Injil</span>
                                        {/* Status Badge */}
                                        {injilFound === true && (
                                            <span className="text-xs text-green-600 flex items-center gap-1 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                                                <CheckCircle2 className="w-3 h-3" /> Valid Book
                                            </span>
                                        )}
                                        {injilFound === false && (
                                            <span className="text-xs text-orange-600 flex items-center gap-1 bg-orange-50 dark:bg-orange-900/30 px-2 py-0.5 rounded-full">
                                                <AlertCircle className="w-3 h-3" /> Unknown Book
                                            </span>
                                        )}
                                    </label>
                                    <div className="relative">
                                        <BookOpen className="absolute left-3 top-3 w-5 h-5 text-blue-500" />
                                        <input
                                            type="text"
                                            value={injil}
                                            onChange={(e) => setInjil(e.target.value)}
                                            onBlur={(e) => validateInjil(e.target.value)}
                                            placeholder="Contoh: Mrk 1:1-8"
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/30 dark:bg-blue-900/10 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 font-mono text-sm"
                                            required
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1 pl-1">
                                        *Format: SingkatanPasal:Ayat (Misal: Mrk 1:1-8)
                                    </p>
                                </div>
                            </div>

                            <div className="pt-4">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-blue-200 dark:shadow-blue-900/20 transform transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Menyimpan...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-5 h-5" />
                                            Simpan Liturgi
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
