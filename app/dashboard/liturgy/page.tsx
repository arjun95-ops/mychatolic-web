"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import { Calendar, CheckCircle2, Download, Save, Upload } from "lucide-react";

type LiturgicalColor = "green" | "red" | "white" | "purple" | "rose" | "black";
type LiturgicalCycle = "A" | "B" | "C";

type ReadingsPayload = {
  bacaan1: string;
  mazmur: string;
  bacaan2?: string;
  injil: string;
  bacaan1_teks?: string;
  mazmur_teks?: string;
  bacaan2_teks?: string;
  injil_teks?: string;
  tahun_siklus?: LiturgicalCycle;
};

const normalizeHeader = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, "_");

const isMissingColumnError = (error: unknown, column: string) => {
  const raw = String(error ?? "").toLowerCase();
  return raw.includes(column.toLowerCase()) && raw.includes("does not exist");
};

const toCycle = (raw: unknown): LiturgicalCycle => {
  const value = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (value === "B" || value === "C") return value;
  return "A";
};

const toColor = (raw: unknown): LiturgicalColor => {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (
    value === "green" ||
    value === "red" ||
    value === "white" ||
    value === "purple" ||
    value === "rose" ||
    value === "black"
  ) {
    return value;
  }
  return "green";
};

const pick = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
};

export default function LiturgyPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [date, setDate] = useState<string>("");
  const [feastName, setFeastName] = useState("");
  const [color, setColor] = useState<LiturgicalColor>("green");
  const [cycle, setCycle] = useState<LiturgicalCycle>("A");

  const [bacaan1, setBacaan1] = useState("");
  const [mazmur, setMazmur] = useState("");
  const [bacaan2, setBacaan2] = useState("");
  const [injil, setInjil] = useState("");

  const [bacaan1Text, setBacaan1Text] = useState("");
  const [mazmurText, setMazmurText] = useState("");
  const [bacaan2Text, setBacaan2Text] = useState("");
  const [injilText, setInjilText] = useState("");

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setDate(today);
  }, []);

  useEffect(() => {
    if (!date) return;
    const fetchData = async () => {
      setFetching(true);
      try {
        const { data, error } = await supabase
          .from("daily_liturgy")
          .select("*")
          .eq("date", date)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          setFeastName("");
          setColor("green");
          setCycle("A");
          setBacaan1("");
          setMazmur("");
          setBacaan2("");
          setInjil("");
          setBacaan1Text("");
          setMazmurText("");
          setBacaan2Text("");
          setInjilText("");
          return;
        }

        const readings = (data.readings || {}) as Record<string, unknown>;
        setFeastName(String(data.feast_name || ""));
        setColor(toColor(data.color));
        setCycle(toCycle(data.liturgical_cycle ?? readings.tahun_siklus));
        setBacaan1(String(readings.bacaan1 || ""));
        setMazmur(String(readings.mazmur || ""));
        setBacaan2(String(readings.bacaan2 || ""));
        setInjil(String(readings.injil || ""));
        setBacaan1Text(String(readings.bacaan1_teks || readings.bacaan1_text || ""));
        setMazmurText(String(readings.mazmur_teks || readings.mazmur_text || ""));
        setBacaan2Text(String(readings.bacaan2_teks || readings.bacaan2_text || ""));
        setInjilText(String(readings.injil_teks || readings.injil_text || ""));
      } catch (error) {
        console.error("Error fetching liturgy:", error);
        toast.error("Gagal mengambil data liturgi");
      } finally {
        setFetching(false);
      }
    };
    fetchData();
  }, [date]);

  const buildReadings = (): ReadingsPayload => {
    const readings: ReadingsPayload = {
      bacaan1: bacaan1.trim(),
      mazmur: mazmur.trim(),
      injil: injil.trim(),
      tahun_siklus: cycle,
    };
    if (bacaan2.trim()) readings.bacaan2 = bacaan2.trim();
    if (bacaan1Text.trim()) readings.bacaan1_teks = bacaan1Text.trim();
    if (mazmurText.trim()) readings.mazmur_teks = mazmurText.trim();
    if (bacaan2Text.trim()) readings.bacaan2_teks = bacaan2Text.trim();
    if (injilText.trim()) readings.injil_teks = injilText.trim();
    return readings;
  };

  const savePayload = async (
    payload: {
      date: string;
      feast_name: string;
      color: LiturgicalColor;
      readings: ReadingsPayload;
      liturgical_cycle: LiturgicalCycle;
    }[],
  ) => {
    const { error } = await supabase.from("daily_liturgy").upsert(payload);
    if (!error) return;
    if (!isMissingColumnError(error, "liturgical_cycle")) throw error;
    const fallback = payload.map((item) => {
      const { liturgical_cycle, ...rest } = item;
      void liturgical_cycle;
      return rest;
    });
    const { error: fallbackError } = await supabase.from("daily_liturgy").upsert(fallback);
    if (fallbackError) throw fallbackError;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!date) throw new Error("Tanggal wajib diisi");
      if (!injil.trim()) throw new Error("Referensi Injil wajib diisi");

      const payload = [
        {
          date,
          feast_name: feastName.trim(),
          color,
          readings: buildReadings(),
          liturgical_cycle: cycle,
        },
      ];
      await savePayload(payload);
      toast.success("Data liturgi berhasil disimpan");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error saving liturgy:", error);
      toast.error(`Gagal menyimpan: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        defval: "",
      });

      const rows = rawRows.map((raw) => {
        const mapped: Record<string, unknown> = {};
        Object.entries(raw).forEach(([key, value]) => {
          mapped[normalizeHeader(key)] = value;
        });
        return mapped;
      });

      const payload = rows
        .map((row) => {
          const rawDate = row.date ?? row.tanggal;
          const rowDate =
            typeof rawDate === "number"
              ? XLSX.SSF.format("yyyy-mm-dd", rawDate)
              : String(rawDate ?? "").trim();
          if (!rowDate) return null;

          const references = {
            bacaan1: pick(row, ["bacaan1", "bacaan_1", "reading1"]),
            mazmur: pick(row, ["mazmur", "psalm"]),
            bacaan2: pick(row, ["bacaan2", "bacaan_2", "reading2"]),
            injil: pick(row, ["injil", "gospel"]),
          };

          if (!references.injil) return null;

          const readings: ReadingsPayload = {
            bacaan1: references.bacaan1,
            mazmur: references.mazmur,
            injil: references.injil,
            tahun_siklus: toCycle(pick(row, ["cycle", "tahun", "tahun_siklus"])),
          };
          if (references.bacaan2) readings.bacaan2 = references.bacaan2;

          const bac1Text = pick(row, ["bacaan1_teks", "bacaan1_text"]);
          const mazmurTextValue = pick(row, ["mazmur_teks", "mazmur_text"]);
          const bac2Text = pick(row, ["bacaan2_teks", "bacaan2_text"]);
          const injilTextValue = pick(row, ["injil_teks", "injil_text"]);
          if (bac1Text) readings.bacaan1_teks = bac1Text;
          if (mazmurTextValue) readings.mazmur_teks = mazmurTextValue;
          if (bac2Text) readings.bacaan2_teks = bac2Text;
          if (injilTextValue) readings.injil_teks = injilTextValue;

          return {
            date: rowDate,
            feast_name: pick(row, ["feast_name", "nama_perayaan", "feast"]),
            color: toColor(pick(row, ["color", "warna"])),
            readings,
            liturgical_cycle: toCycle(pick(row, ["cycle", "tahun", "tahun_siklus"])),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (payload.length === 0) {
        throw new Error("Tidak ada data valid untuk diimpor.");
      }

      const chunkSize = 200;
      for (let i = 0; i < payload.length; i += chunkSize) {
        await savePayload(payload.slice(i, i + chunkSize));
      }
      toast.success(`Import berhasil: ${payload.length} baris`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Import liturgy error:", error);
      toast.error(`Import gagal: ${message}`);
    } finally {
      setImporting(false);
    }
  };

  const colors = [
    { value: "green", label: "Hijau (Masa Biasa)", bg: "bg-green-600" },
    { value: "red", label: "Merah (Martir/Roh Kudus)", bg: "bg-red-600" },
    {
      value: "white",
      label: "Putih (Hari Raya)",
      bg: "bg-slate-100 border-slate-300",
    },
    { value: "purple", label: "Ungu (Adven/Prapaskah)", bg: "bg-purple-600" },
    { value: "rose", label: "Rose", bg: "bg-pink-500" },
    { value: "black", label: "Hitam", bg: "bg-slate-900" },
  ] as const;

  const renderTextInput = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    placeholder: string,
  ) => (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-sm"
      />
    </div>
  );

  const renderTextArea = (
    label: string,
    value: string,
    onChange: (value: string) => void,
  ) => (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="Masukkan teks bacaan lengkap..."
        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
      />
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-8 h-8 text-blue-600" />
            Manajemen Liturgi Harian
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Kelola bacaan liturgi dengan siklus Tahun A/B/C serta teks bacaan penuh.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Upload className="w-4 h-4" />
            {importing ? "Mengimpor..." : "Import CSV/Excel"}
          </button>
          <a
            href="/templates/liturgi_import_template.csv"
            download
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
          >
            <Download className="w-4 h-4" />
            Template CSV
          </a>
          <a
            href="/templates/liturgi_import_template.xlsx"
            download
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
          >
            <Download className="w-4 h-4" />
            Template Excel
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 mt-4">
              Siklus Tahun
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["A", "B", "C"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCycle(item)}
                  className={`rounded-xl py-2.5 font-bold border transition ${
                    cycle === item
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  Tahun {item}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
              Warna Liturgi
            </label>
            <div className="space-y-3">
              {colors.map((item) => (
                <label
                  key={item.value}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${
                    color === item.value
                      ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                      : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <input
                    type="radio"
                    name="color"
                    value={item.value}
                    checked={color === item.value}
                    onChange={() => setColor(item.value)}
                    className="sr-only"
                  />
                  <div
                    className={`w-6 h-6 rounded-full shadow-sm ${item.bg} ${
                      item.value === "white" ? "border" : ""
                    }`}
                  />
                  <span
                    className={`text-sm font-medium ${
                      color === item.value
                        ? "text-blue-700 dark:text-blue-300"
                        : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {item.label}
                  </span>
                  {color === item.value && (
                    <CheckCircle2 className="w-5 h-5 text-blue-600 ml-auto" />
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm h-full relative">
            {fetching && (
              <div className="absolute inset-0 bg-white/55 dark:bg-slate-900/55 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Nama Perayaan / Pesta
                </label>
                <input
                  type="text"
                  value={feastName}
                  onChange={(e) => setFeastName(e.target.value)}
                  placeholder="Contoh: Hari Raya Natal"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                Referensi Bacaan
              </h3>

              <div className="grid grid-cols-1 gap-4">
                {renderTextInput("Bacaan 1", bacaan1, setBacaan1, "Contoh: Yes 42:1-4")}
                {renderTextInput("Mazmur Tanggapan", mazmur, setMazmur, "Contoh: Mzm 29:1-4")}
                {renderTextInput(
                  "Bacaan 2 (Opsional)",
                  bacaan2,
                  setBacaan2,
                  "Contoh: Kis 10:34-38",
                )}
                {renderTextInput("Injil", injil, setInjil, "Contoh: Luk 3:15-16.21-22")}
              </div>

              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                Teks Bacaan Lengkap
              </h3>

              <div className="grid grid-cols-1 gap-4">
                {renderTextArea("Teks Bacaan 1", bacaan1Text, setBacaan1Text)}
                {renderTextArea("Teks Mazmur", mazmurText, setMazmurText)}
                {renderTextArea("Teks Bacaan 2", bacaan2Text, setBacaan2Text)}
                {renderTextArea("Teks Injil", injilText, setInjilText)}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-blue-200 dark:shadow-blue-900/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
