"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Plus, Edit2, Trash2, Loader2, Calendar, Clock, MapPin } from "lucide-react";

interface AnySchedule {
  id: string;
  church_id: string;
  day_number?: number | string;
  start_time?: string;
  title?: string;
  language?: string;
  // Legacy fallback fields
  day?: number | string;
  day_of_week?: number | string;
  time_start?: string;
  time?: string;
  label?: string;
  category?: string;
  activity_name?: string;
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

const DAY_OPTIONS = [
  { value: 1, label: "Senin" },
  { value: 2, label: "Selasa" },
  { value: 3, label: "Rabu" },
  { value: 4, label: "Kamis" },
  { value: 5, label: "Jumat" },
  { value: 6, label: "Sabtu" },
  { value: 7, label: "Minggu" },
] as const;

const DAYS_MAP: Record<number, string> = {
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
  6: "Sabtu",
  7: "Minggu",
  0: "Minggu", // legacy fallback
};

const LABEL_OPTIONS = [
  "Misa Mingguan",
  "Misa Harian",
  "Misa Jumat Pertama",
  "Misa Arwah",
  "Misa Hari Raya",
  "Lainnya",
];

const toNumberOrDefault = (value: unknown, defaultValue: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

const getDay = (s: AnySchedule): number => {
  const parsed = toNumberOrDefault(s.day_number ?? s.day_of_week ?? s.day, 7);
  if (parsed === 0) return 7;
  if (parsed < 1 || parsed > 7) return 7;
  return parsed;
};

const getTime = (s: AnySchedule): string => {
  const raw = String(s.start_time ?? s.time_start ?? s.time ?? "00:00");
  return raw.substring(0, 5);
};

const getLabel = (s: AnySchedule): string =>
  String(s.title ?? s.label ?? s.category ?? s.activity_name ?? "Lainnya");

const getLang = (s: AnySchedule): string => String(s.language ?? "Offline");

const formatAmPm = (time24: string): string => {
  if (!time24) return "";
  const [hStr, mStr] = time24.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr || "00";
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  h = h ? h : 12;
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

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Gagal menyimpan";
};

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES_DETAILED = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, "0"));

export default function SchedulesTab() {
  const { showToast } = useToast();

  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedDiocese, setSelectedDiocese] = useState("");
  const [selectedChurch, setSelectedChurch] = useState("");

  const [countries, setCountries] = useState<Country[]>([]);
  const [dioceses, setDioceses] = useState<Diocese[]>([]);
  const [churches, setChurches] = useState<Church[]>([]);

  const [rawSchedules, setRawSchedules] = useState<AnySchedule[]>([]);
  const [loading, setLoading] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState<AnySchedule | null>(null);

  const [formData, setFormData] = useState({
    day: 7,
    hour: 8,
    minute: "00",
    ampm: "AM",
    label: "Misa Mingguan",
    language: "Bahasa Indonesia",
  });

  useEffect(() => {
    const fetchCountries = async () => {
      const { data, error } = await supabase
        .from("countries")
        .select("id, name, flag_emoji")
        .order("name");
      if (error) {
        showToast("Gagal memuat negara.", "error");
        return;
      }
      setCountries(data || []);
    };
    void fetchCountries();
  }, [showToast]);

  useEffect(() => {
    setDioceses([]);
    setSelectedDiocese("");
    setChurches([]);
    setSelectedChurch("");
    setRawSchedules([]);

    if (!selectedCountry) return;

    const fetchDioceses = async () => {
      const { data, error } = await supabase
        .from("dioceses")
        .select("id, name")
        .eq("country_id", selectedCountry)
        .order("name");
      if (error) {
        showToast("Gagal memuat keuskupan.", "error");
        return;
      }
      setDioceses(data || []);
    };

    void fetchDioceses();
  }, [selectedCountry, showToast]);

  useEffect(() => {
    setChurches([]);
    setSelectedChurch("");
    setRawSchedules([]);

    if (!selectedDiocese) return;

    const fetchChurches = async () => {
      const { data, error } = await supabase
        .from("churches")
        .select("id, name")
        .eq("diocese_id", selectedDiocese)
        .order("name");
      if (error) {
        showToast("Gagal memuat paroki.", "error");
        return;
      }
      setChurches(data || []);
    };

    void fetchChurches();
  }, [selectedDiocese, showToast]);

  const fetchSchedules = useCallback(async () => {
    if (!selectedChurch) {
      setRawSchedules([]);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("mass_schedules")
      .select("*")
      .eq("church_id", selectedChurch);

    if (error) {
      console.error("Fetch schedules error:", error);
      showToast("Gagal memuat jadwal misa.", "error");
      setLoading(false);
      return;
    }

    const sorted = (data || []).sort((a: AnySchedule, b: AnySchedule) => {
      const da = getDay(a);
      const db = getDay(b);
      if (da !== db) return da - db;
      return getTime(a).localeCompare(getTime(b));
    });

    setRawSchedules(sorted);
    setLoading(false);
  }, [selectedChurch, showToast]);

  useEffect(() => {
    if (!selectedChurch) {
      setRawSchedules([]);
      return;
    }
    void fetchSchedules();
  }, [selectedChurch, fetchSchedules]);

  const handleOpenAdd = () => {
    if (!selectedChurch) {
      showToast("Pilih paroki dulu.", "error");
      return;
    }

    setEditingItem(null);
    setFormData({
      day: 7,
      hour: 8,
      minute: "00",
      ampm: "AM",
      label: "Misa Mingguan",
      language: "Bahasa Indonesia",
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
      language: getLang(item),
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus jadwal ini?")) return;

    try {
      const response = await fetch("/api/admin/master-data/schedules/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        references?: Array<{ label?: string; table?: string; count?: number }>;
      };

      if (!response.ok) {
        const references = Array.isArray(result.references) ? result.references : [];
        if (references.length > 0) {
          const referenceText = references
            .map((item) => {
              const label = String(item.label || item.table || "Relasi");
              const count = Number(item.count || 0);
              return `${label} (${count})`;
            })
            .join(", ");
          showToast(
            `${result.message || "Gagal menghapus jadwal."} Dipakai oleh: ${referenceText}.`,
            "error",
          );
        } else {
          showToast(result.message || "Gagal menghapus jadwal.", "error");
        }
        return;
      }

      showToast(result.message || "Jadwal dihapus.", "success");
      void fetchSchedules();
    } catch {
      showToast("Gagal menghapus jadwal (network error).", "error");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!selectedChurch) {
      showToast("Pilih paroki dulu.", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      const time24 = to24h(formData.hour, formData.minute, formData.ampm);
      const payload = {
        id: editingItem?.id,
        church_id: selectedChurch,
        day_number: Number(formData.day),
        start_time: time24,
        title: formData.label,
        language: formData.language,
      };

      const response = await fetch("/api/admin/master-data/schedules/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.message || "Gagal menyimpan jadwal.");
      }

      showToast(result.message || "Berhasil disimpan", "success");
      setIsModalOpen(false);
      void fetchSchedules();
    } catch (error: unknown) {
      console.error("Save schedule error:", error);
      showToast(getErrorMessage(error), "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const labelStyle = "block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1";
  const inputStyle =
    "w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-brand-primary text-slate-900 dark:text-white transition-all";

  const renderTimeRow = (s: AnySchedule) => (
    <div
      key={s.id}
      className="flex justify-between items-center py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0 group"
    >
      <div className="flex items-center gap-6">
        <span className="font-mono font-bold text-slate-700 dark:text-slate-300 w-24 text-center bg-slate-100 dark:bg-slate-800 rounded-lg py-1.5 shadow-sm border border-slate-200 dark:border-slate-700">
          {formatAmPm(getTime(s))}
        </span>
        <span className="text-sm text-slate-600 dark:text-slate-400 font-medium uppercase tracking-wide flex items-center gap-2">
          {getLang(s).toUpperCase()}
        </span>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => handleOpenEdit(s)}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"
        >
          <Edit2 size={16} />
        </button>
        <button
          onClick={() => handleDelete(s.id)}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-600 transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );

  const grouped = {
    mingguan: [] as AnySchedule[],
    harian: [] as AnySchedule[],
    jumatPertama: [] as AnySchedule[],
    others: [] as AnySchedule[],
  };

  rawSchedules.forEach((s) => {
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

    return (
      <div className="mb-10 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 border-b-2 border-slate-100 dark:border-slate-800 pb-2 inline-block">
          {title}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10">
          {DAY_OPTIONS.map((dayOption) => {
            const dKey = dayOption.value;
            const filtered = items.filter((item) => {
              const d = getDay(item);
              return d === dKey || (dKey === 7 && d === 0);
            });

            const uniqueFiltered = Array.from(
              new Map(filtered.map((item) => [item.id, item])).values(),
            ).sort((a, b) => getTime(a).localeCompare(getTime(b)));

            if (uniqueFiltered.length === 0) return null;

            return (
              <div key={dKey}>
                <h4 className="font-bold text-brand-primary dark:text-brand-primary mb-4 uppercase text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> {DAYS_MAP[dKey]}
                </h4>
                <div className="space-y-1">{uniqueFiltered.map(renderTimeRow)}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDailyMass = () => {
    const items = grouped.harian;
    if (items.length === 0) return null;

    const weekdayItems = items.filter((item) => {
      const d = getDay(item);
      return d >= 1 && d <= 5;
    });
    const saturdayItems = items.filter((item) => getDay(item) === 6);

    const unionWeekdays = Array.from(
      new Map(weekdayItems.map((item) => [getTime(item) + getLang(item), item])).values(),
    ).sort((a, b) => getTime(a).localeCompare(getTime(b)));

    return (
      <div className="mb-10 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 border-b-2 border-slate-100 dark:border-slate-800 pb-2 inline-block">
          Misa Harian
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10">
          <div>
            <h4 className="font-bold text-action dark:text-action mb-4 uppercase text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Senin - Jum&apos;at
            </h4>
            <div className="space-y-1">
              {unionWeekdays.length > 0 ? (
                unionWeekdays.map(renderTimeRow)
              ) : (
                <p className="text-slate-400 italic text-sm">Tidak ada jadwal.</p>
              )}
            </div>
          </div>
          {saturdayItems.length > 0 && (
            <div>
              <h4 className="font-bold text-action dark:text-action mb-4 uppercase text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Sabtu
              </h4>
              <div className="space-y-1">
                {saturdayItems
                  .sort((a, b) => getTime(a).localeCompare(getTime(b)))
                  .map(renderTimeRow)}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderFirstFriday = () => {
    const items = grouped.jumatPertama;
    if (items.length === 0) return null;

    const sorted = [...items].sort((a, b) => getTime(a).localeCompare(getTime(b)));

    return (
      <div className="mb-10 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 border-b-2 border-slate-100 dark:border-slate-800 pb-2 inline-block">
          Jumat Pertama
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10">
          <div>
            <h4 className="font-bold text-user-chat dark:text-user-chat mb-4 uppercase text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Jumat
            </h4>
            <div className="space-y-1">{sorted.map(renderTimeRow)}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300">
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
        <div className="flex items-center gap-2 mb-4 text-brand-primary dark:text-brand-primary font-bold uppercase text-xs tracking-wider">
          <MapPin className="w-4 h-4" /> Filter Lokasi Gereja
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <select className={inputStyle} value={selectedCountry} onChange={(e) => setSelectedCountry(e.target.value)}>
              <option value="">-- Pilih Negara --</option>
              {countries.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.flag_emoji} {country.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              className={inputStyle}
              value={selectedDiocese}
              onChange={(e) => setSelectedDiocese(e.target.value)}
              disabled={!selectedCountry}
            >
              <option value="">-- Pilih Keuskupan --</option>
              {dioceses.map((diocese) => (
                <option key={diocese.id} value={diocese.id}>
                  {diocese.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              className={inputStyle}
              value={selectedChurch}
              onChange={(e) => setSelectedChurch(e.target.value)}
              disabled={!selectedDiocese}
            >
              <option value="">-- Pilih Paroki --</option>
              {churches.map((church) => (
                <option key={church.id} value={church.id}>
                  {church.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="p-8 bg-slate-50/30 dark:bg-slate-900/10 min-h-[500px]">
        {!selectedChurch ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 shadow-inner">
              <Calendar className="w-10 h-10 opacity-30" />
            </div>
            <h3 className="text-lg font-bold text-slate-600 dark:text-slate-300">Pilih Paroki</h3>
            <p className="max-w-xs text-center mt-2 text-sm">
              Pilih lokasi gereja di menu filter atas untuk menampilkan tabel jadwal misa.
            </p>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-32">
            <Loader2 className="w-10 h-10 animate-spin text-brand-primary" />
          </div>
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
                className="flex items-center gap-2 px-6 py-3 bg-brand-primary hover:opacity-90 text-white rounded-xl font-bold text-sm shadow-lg shadow-brand-primary/20 dark:shadow-brand-primary/20 transition-all hover:-translate-y-0.5"
              >
                <Plus className="w-4 h-4" /> Tambah Jadwal
              </button>
            </div>

            {rawSchedules.length === 0 ? (
              <div className="text-center py-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm text-slate-500">
                <p className="font-medium">Belum ada data jadwal misa untuk paroki ini.</p>
                <button onClick={handleOpenAdd} className="text-brand-primary font-bold mt-2 hover:underline">
                  Tambah Sekarang
                </button>
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

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? "Edit Jadwal" : "Tambah Jadwal"}>
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className={labelStyle}>Kategori Misa</label>
            <input
              list="categoryList"
              className={inputStyle}
              placeholder="Ketik atau pilih (Contoh: Misa Mingguan)"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              required
            />
            <datalist id="categoryList">
              {LABEL_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <p className="text-xs text-slate-400 mt-1">
              Kategori ini menentukan pengelompokan (Grouping) di tampilan jadwal.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className={labelStyle}>Hari</label>
              <select
                className={inputStyle}
                value={formData.day}
                onChange={(e) => setFormData({ ...formData, day: Number(e.target.value) })}
              >
                {DAY_OPTIONS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelStyle}>Keterangan / Bahasa</label>
              <input
                type="text"
                className={inputStyle}
                placeholder="Contoh: OFFLINE / ONLINE"
                value={formData.language}
                onChange={(e) => setFormData({ ...formData, language: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className={labelStyle}>Jam Mulai</label>
            <div className="flex gap-2">
              <select
                className={`${inputStyle} text-center font-mono`}
                value={formData.hour}
                onChange={(e) => setFormData({ ...formData, hour: Number(e.target.value) })}
              >
                {HOURS_12.map((hour) => (
                  <option key={hour} value={hour}>
                    {hour}
                  </option>
                ))}
              </select>
              <span className="self-center font-bold px-1">:</span>
              <select
                className={`${inputStyle} text-center font-mono`}
                value={formData.minute}
                onChange={(e) => setFormData({ ...formData, minute: e.target.value })}
              >
                {MINUTES_DETAILED.map((minute) => (
                  <option key={minute} value={minute}>
                    {minute}
                  </option>
                ))}
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
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="py-2.5 px-4 flex-1 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="py-2.5 px-4 flex-1 bg-gradient-to-r from-brand-primary to-action text-white rounded-xl font-bold hover:opacity-90 transition-opacity flex justify-center items-center gap-2 shadow-lg shadow-brand-primary/20 dark:shadow-brand-primary/20"
            >
              {isSubmitting && <Loader2 className="animate-spin w-4 h-4" />} Simpan
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
