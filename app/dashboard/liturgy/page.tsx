"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  Calendar,
  CheckCircle2,
  Download,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

type LiturgicalColor = "green" | "red" | "white" | "purple" | "rose" | "black";
type LiturgicalCycle = "A" | "B" | "C";
type CelebrationRank =
  | "feria"
  | "optional_memorial"
  | "memorial"
  | "feast"
  | "solemnity";

type ReadingsPayload = {
  bacaan1: string;
  mazmur: string;
  bacaan2?: string;
  bait_pengantar_injil: string;
  injil: string;
  bacaan1_teks: string;
  mazmur_teks: string;
  bacaan2_teks?: string;
  bait_pengantar_injil_teks: string;
  injil_teks: string;
  tahun_siklus: LiturgicalCycle;
  nama_liturgi: string;
  tingkat_perayaan: CelebrationRank;
  peringatan?: string;
  saint_name?: string;
  warna_liturgi?: LiturgicalColor;
};

type DailyLiturgyUpsertPayload = {
  date: string;
  feast_name: string;
  liturgical_day_name: string;
  celebration_rank: CelebrationRank;
  memorial_name: string | null;
  saint_name: string | null;
  color: LiturgicalColor;
  liturgical_cycle: LiturgicalCycle;
  bait_pengantar_injil: string;
  bacaan1: string;
  bacaan1_teks: string;
  bacaan2: string | null;
  bacaan2_teks: string | null;
  mazmur: string;
  mazmur_teks: string;
  bait_pengantar_injil_teks: string;
  injil: string;
  injil_teks: string;
  readings: ReadingsPayload;
};

type DailyLiturgyListItem = {
  date: string;
  feast_name: string | null;
  liturgical_day_name: string | null;
  celebration_rank: CelebrationRank | null;
  memorial_name: string | null;
  saint_name: string | null;
  color: LiturgicalColor | null;
  liturgical_cycle: LiturgicalCycle | null;
};

const normalizeHeader = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, "_");

const textOrEmpty = (value: unknown): string => {
  if (value == null) return "";
  const normalized = String(value).trim();
  if (!normalized || normalized.toLowerCase() === "null") return "";
  return normalized;
};

const firstText = (...values: unknown[]): string => {
  for (const value of values) {
    const text = textOrEmpty(value);
    if (text) return text;
  }
  return "";
};

const toCycle = (raw: unknown): LiturgicalCycle => {
  const value = textOrEmpty(raw).toUpperCase();
  if (value === "B" || value === "C") return value;
  return "A";
};

const toRank = (raw: unknown): CelebrationRank => {
  const value = textOrEmpty(raw).toLowerCase();
  if (value === "optional_memorial" || value === "optional memorial" || value === "peringatan fakultatif" || value === "opsional" || value === "pm") {
    return "optional_memorial";
  }
  if (value === "memorial" || value === "peringatan" || value === "peringatan wajib" || value === "pw") {
    return "memorial";
  }
  if (value === "feast" || value === "pesta" || value === "p") return "feast";
  if (value === "solemnity" || value === "hari raya" || value === "hr") return "solemnity";
  return "feria";
};

const parseCycleStrict = (raw: unknown): LiturgicalCycle | null => {
  const value = textOrEmpty(raw).toUpperCase();
  if (value === "A" || value === "B" || value === "C") return value;
  return null;
};

const parseColorStrict = (raw: unknown): LiturgicalColor | null => {
  const value = textOrEmpty(raw).toLowerCase();
  if (value === "putih" || value === "emas" || value === "gold" || value === "white") {
    return "white";
  }
  if (value === "merah" || value === "red") return "red";
  if (value === "hijau" || value === "green") return "green";
  if (value === "ungu" || value === "violet" || value === "purple") return "purple";
  if (value === "rose" || value === "pink" || value === "merah_muda" || value === "merah muda") {
    return "rose";
  }
  if (value === "hitam" || value === "black") return "black";
  return null;
};

const parseRankStrict = (raw: unknown): CelebrationRank | null => {
  const value = textOrEmpty(raw).toLowerCase();
  if (value === "feria" || value === "hari biasa") return "feria";
  if (value === "optional_memorial" || value === "optional memorial" || value === "peringatan fakultatif" || value === "opsional" || value === "pm") {
    return "optional_memorial";
  }
  if (value === "memorial" || value === "peringatan" || value === "peringatan wajib" || value === "pw") {
    return "memorial";
  }
  if (value === "feast" || value === "pesta" || value === "p") return "feast";
  if (value === "solemnity" || value === "hari raya" || value === "hr") return "solemnity";
  return null;
};

const pick = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = textOrEmpty(row[key]);
    if (value) return value;
  }
  return "";
};

const rankOptions: { value: CelebrationRank; label: string }[] = [
  { value: "feria", label: "Feria (Hari Biasa)" },
  { value: "optional_memorial", label: "Peringatan Fakultatif" },
  { value: "memorial", label: "Memorial / Peringatan" },
  { value: "feast", label: "Feast / Pesta" },
  { value: "solemnity", label: "Solemnity / Hari Raya" },
];

const getMonthRange = (month: string): { start: string; end: string } | null => {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, monthValue] = month.split("-").map((part) => Number(part));
  if (!year || !monthValue || monthValue < 1 || monthValue > 12) return null;

  const endDate = new Date(Date.UTC(year, monthValue, 0)).toISOString().slice(0, 10);
  return {
    start: `${month}-01`,
    end: endDate,
  };
};

export default function LiturgyPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [date, setDate] = useState<string>("");
  const [feastName, setFeastName] = useState("");
  const [liturgicalDayName, setLiturgicalDayName] = useState("");
  const [celebrationRank, setCelebrationRank] = useState<CelebrationRank>("feria");
  const [memorialName, setMemorialName] = useState("");
  const [saintName, setSaintName] = useState("");
  const [color, setColor] = useState<LiturgicalColor | "">("");
  const [cycle, setCycle] = useState<LiturgicalCycle>("A");

  const [bacaan1, setBacaan1] = useState("");
  const [mazmur, setMazmur] = useState("");
  const [bacaan2, setBacaan2] = useState("");
  const [baitPengantarInjil, setBaitPengantarInjil] = useState("");
  const [injil, setInjil] = useState("");

  const [bacaan1Text, setBacaan1Text] = useState("");
  const [mazmurText, setMazmurText] = useState("");
  const [bacaan2Text, setBacaan2Text] = useState("");
  const [baitPengantarInjilText, setBaitPengantarInjilText] = useState("");
  const [injilText, setInjilText] = useState("");

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deletingDate, setDeletingDate] = useState<string | null>(null);
  const [listing, setListing] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [listMonth, setListMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [listRows, setListRows] = useState<DailyLiturgyListItem[]>([]);

  const resetForm = () => {
    setFeastName("");
    setLiturgicalDayName("");
    setCelebrationRank("feria");
    setMemorialName("");
    setSaintName("");
    setColor("");
    setCycle("A");
    setBacaan1("");
    setMazmur("");
    setBacaan2("");
    setBaitPengantarInjil("");
    setInjil("");
    setBacaan1Text("");
    setMazmurText("");
    setBacaan2Text("");
    setBaitPengantarInjilText("");
    setInjilText("");
  };

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
          resetForm();
          return;
        }

        const readings = (data.readings || {}) as Record<string, unknown>;

        const resolvedFeast = firstText(data.feast_name, data.liturgical_day_name, readings.nama_liturgi);
        const resolvedDayName = firstText(data.liturgical_day_name, readings.nama_liturgi, resolvedFeast);

        setFeastName(resolvedFeast);
        setLiturgicalDayName(resolvedDayName);
        setCelebrationRank(toRank(firstText(data.celebration_rank, readings.tingkat_perayaan, readings.celebration_rank, readings.rank)));
        setMemorialName(firstText(data.memorial_name, readings.peringatan, readings.memorial_name, readings.memorial));
        setSaintName(firstText(data.saint_name, readings.saint_name, readings.saint, readings.orang_kudus));
        setColor(
          parseColorStrict(
            firstText(
              data.color,
              readings.warna_liturgi,
              readings.warnaLiturgi,
              readings.liturgical_color,
              readings.liturgicalColor,
              readings.color,
            ),
          ) ?? "",
        );
        setCycle(toCycle(firstText(data.liturgical_cycle, readings.tahun_siklus, readings.liturgical_cycle)));

        setBacaan1(firstText(data.bacaan1, readings.bacaan1, readings.first_reading));
        setMazmur(firstText(data.mazmur, readings.mazmur, readings.psalm, readings.responsorial_psalm));
        setBacaan2(firstText(data.bacaan2, readings.bacaan2, readings.second_reading));
        setBaitPengantarInjil(
          firstText(
            data.bait_pengantar_injil,
            readings.bait_pengantar_injil,
            readings.gospel_acclamation,
            readings.alleluia,
            readings.verse_before_gospel,
          ),
        );
        setInjil(firstText(data.injil, readings.injil, readings.gospel));

        setBacaan1Text(firstText(data.bacaan1_teks, readings.bacaan1_teks, readings.bacaan1_text, readings.first_reading_text));
        setMazmurText(
          firstText(
            data.mazmur_teks,
            readings.mazmur_teks,
            readings.mazmur_text,
            readings.psalm_text,
            readings.responsorial_psalm_text,
          ),
        );
        setBacaan2Text(firstText(data.bacaan2_teks, readings.bacaan2_teks, readings.bacaan2_text, readings.second_reading_text));
        setBaitPengantarInjilText(
          firstText(
            data.bait_pengantar_injil_teks,
            readings.bait_pengantar_injil_teks,
            readings.bait_pengantar_injil_text,
            readings.gospel_acclamation_text,
            readings.alleluia_text,
            readings.verse_before_gospel_text,
          ),
        );
        setInjilText(firstText(data.injil_teks, readings.injil_teks, readings.injil_text, readings.gospel_text));
      } catch (error) {
        console.error("Error fetching liturgy:", error);
        toast.error("Gagal mengambil data liturgi");
      } finally {
        setFetching(false);
      }
    };

    void fetchData();
  }, [date]);

  const fetchLiturgyList = useCallback(async () => {
    setListing(true);
    try {
      let query = supabase
        .from("daily_liturgy")
        .select(
          "date, feast_name, liturgical_day_name, celebration_rank, memorial_name, saint_name, color, liturgical_cycle",
        )
        .order("date", { ascending: false })
        .limit(600);

      const monthRange = getMonthRange(listMonth);
      if (monthRange) {
        query = query.gte("date", monthRange.start).lte("date", monthRange.end);
      }

      const { data, error } = await query;
      if (error) throw error;

      const mapped = (data ?? []).map((row) => ({
        date: String(row.date ?? ""),
        feast_name: textOrEmpty(row.feast_name) || null,
        liturgical_day_name: textOrEmpty(row.liturgical_day_name) || null,
        celebration_rank: parseRankStrict(row.celebration_rank),
        memorial_name: textOrEmpty(row.memorial_name) || null,
        saint_name: textOrEmpty(row.saint_name) || null,
        color: parseColorStrict(row.color),
        liturgical_cycle: parseCycleStrict(row.liturgical_cycle),
      }));

      setListRows(mapped);
    } catch (error) {
      console.error("Error listing liturgy rows:", error);
      toast.error("Gagal memuat daftar data liturgi");
    } finally {
      setListing(false);
    }
  }, [listMonth]);

  useEffect(() => {
    void fetchLiturgyList();
  }, [fetchLiturgyList]);

  const buildReadings = (): ReadingsPayload => {
    const readings: ReadingsPayload = {
      bacaan1: bacaan1.trim(),
      mazmur: mazmur.trim(),
      bait_pengantar_injil: baitPengantarInjil.trim(),
      injil: injil.trim(),
      bacaan1_teks: bacaan1Text.trim(),
      mazmur_teks: mazmurText.trim(),
      bait_pengantar_injil_teks: baitPengantarInjilText.trim(),
      injil_teks: injilText.trim(),
      tahun_siklus: cycle,
      nama_liturgi: liturgicalDayName.trim(),
      tingkat_perayaan: celebrationRank,
    };

    if (bacaan2.trim()) readings.bacaan2 = bacaan2.trim();
    if (bacaan2Text.trim()) readings.bacaan2_teks = bacaan2Text.trim();
    if (memorialName.trim()) readings.peringatan = memorialName.trim();
    if (saintName.trim()) readings.saint_name = saintName.trim();
    if (color) readings.warna_liturgi = color;

    return readings;
  };

  const savePayload = async (payload: DailyLiturgyUpsertPayload[]) => {
    const { error } = await supabase.from("daily_liturgy").upsert(payload, {
      onConflict: "date",
    });
    if (!error) return;

    const raw = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
    if (raw.includes("does not exist") || raw.includes("column")) {
      throw new Error(
        "Schema daily_liturgy belum lengkap. Jalankan patch 25 (supabase_patches/25_schedule_liturgy_content_fields.sql) terlebih dahulu.",
      );
    }
    if (raw.includes("no unique") || raw.includes("on conflict")) {
      throw new Error(
        "Upsert berdasarkan date butuh UNIQUE INDEX di kolom date. Jalankan patch 25 dan pastikan index unik date sudah aktif.",
      );
    }
    throw error;
  };

  const validateRequiredFields = () => {
    if (!date) throw new Error("Tanggal wajib diisi");
    if (!feastName.trim()) throw new Error("Nama perayaan wajib diisi");
    if (!liturgicalDayName.trim()) throw new Error("Nama hari liturgi wajib diisi");
    if (!color) throw new Error("Warna liturgi wajib dipilih");
    if (!bacaan1.trim()) throw new Error("Referensi Bacaan I wajib diisi");
    if (!mazmur.trim()) throw new Error("Referensi Mazmur Tanggapan wajib diisi");
    if (!baitPengantarInjil.trim()) throw new Error("Referensi Bait Pengantar Injil wajib diisi");
    if (!injil.trim()) throw new Error("Referensi Injil wajib diisi");
    if (!bacaan1Text.trim()) throw new Error("Teks lengkap Bacaan I wajib diisi");
    if (!mazmurText.trim()) throw new Error("Teks lengkap Mazmur wajib diisi");
    if (!baitPengantarInjilText.trim()) throw new Error("Teks lengkap Bait Pengantar Injil wajib diisi");
    if (!injilText.trim()) throw new Error("Teks lengkap Injil wajib diisi");
    if (bacaan2.trim() && !bacaan2Text.trim()) {
      throw new Error("Jika Bacaan II diisi, teks lengkap Bacaan II juga wajib diisi");
    }
    if (!bacaan2.trim() && bacaan2Text.trim()) {
      throw new Error("Isi referensi Bacaan II atau kosongkan teks Bacaan II");
    }
  };

  const buildSinglePayload = (): DailyLiturgyUpsertPayload => ({
    date,
    feast_name: feastName.trim(),
    liturgical_day_name: liturgicalDayName.trim(),
    celebration_rank: celebrationRank,
    memorial_name: memorialName.trim() || null,
    saint_name: saintName.trim() || null,
    color: color as LiturgicalColor,
    liturgical_cycle: cycle,
    bait_pengantar_injil: baitPengantarInjil.trim(),
    bacaan1: bacaan1.trim(),
    bacaan1_teks: bacaan1Text.trim(),
    bacaan2: bacaan2.trim() || null,
    bacaan2_teks: bacaan2Text.trim() || null,
    mazmur: mazmur.trim(),
    mazmur_teks: mazmurText.trim(),
    bait_pengantar_injil_teks: baitPengantarInjilText.trim(),
    injil: injil.trim(),
    injil_teks: injilText.trim(),
    readings: buildReadings(),
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      validateRequiredFields();
      await savePayload([buildSinglePayload()]);
      await fetchLiturgyList();
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

      const payload: DailyLiturgyUpsertPayload[] = [];
      const invalidRows: string[] = [];

      for (let idx = 0; idx < rows.length; idx += 1) {
        const row = rows[idx];
        const rowNumber = idx + 2;
        const rawDate = row.date ?? row.tanggal;
        const rowDate =
          typeof rawDate === "number"
            ? XLSX.SSF.format("yyyy-mm-dd", rawDate)
            : textOrEmpty(rawDate);

        if (!rowDate) {
          invalidRows.push(`baris ${rowNumber}: tanggal kosong/invalid`);
          continue;
        }

        const references = {
          bacaan1: pick(row, ["bacaan1", "bacaan_1", "reading1", "first_reading"]),
          mazmur: pick(row, ["mazmur", "psalm", "responsorial_psalm"]),
          bacaan2: pick(row, ["bacaan2", "bacaan_2", "reading2", "second_reading"]),
          baitPengantarInjil: pick(row, [
            "bait_pengantar_injil",
            "gospel_acclamation",
            "alleluia",
            "verse_before_gospel",
          ]),
          injil: pick(row, ["injil", "gospel"]),
        };

        const texts = {
          bacaan1Text: pick(row, ["bacaan1_teks", "bacaan1_text", "first_reading_text"]),
          mazmurTextValue: pick(row, [
            "mazmur_teks",
            "mazmur_text",
            "psalm_text",
            "responsorial_psalm_text",
          ]),
          bacaan2Text: pick(row, ["bacaan2_teks", "bacaan2_text", "second_reading_text"]),
          baitText: pick(row, [
            "bait_pengantar_injil_teks",
            "bait_pengantar_injil_text",
            "gospel_acclamation_text",
            "alleluia_text",
            "verse_before_gospel_text",
          ]),
          injilTextValue: pick(row, ["injil_teks", "injil_text", "gospel_text"]),
        };

        if (
          !references.bacaan1 ||
          !references.mazmur ||
          !references.baitPengantarInjil ||
          !references.injil ||
          !texts.bacaan1Text ||
          !texts.mazmurTextValue ||
          !texts.baitText ||
          !texts.injilTextValue
        ) {
          invalidRows.push(`baris ${rowNumber} (${rowDate}): kolom bacaan wajib belum lengkap`);
          continue;
        }

        if (!!references.bacaan2 !== !!texts.bacaan2Text) {
          invalidRows.push(
            `baris ${rowNumber} (${rowDate}): Bacaan II dan teks Bacaan II harus diisi berpasangan`,
          );
          continue;
        }

        const rowCycle = parseCycleStrict(
          pick(row, ["cycle", "tahun", "tahun_siklus", "liturgical_cycle"]),
        );
        const rowRank = parseRankStrict(
          pick(row, [
            "celebration_rank",
            "rank",
            "tingkat_perayaan",
            "peringkat_perayaan",
          ]),
        );
        const rowColor = parseColorStrict(
          pick(row, ["color", "warna", "liturgical_color", "warna_liturgi"]),
        );
        const rowFeast = pick(row, ["feast_name", "nama_perayaan", "title", "feast"]);
        const rowLiturgicalDay =
          pick(row, ["liturgical_day_name", "nama_liturgi", "day_name"]) || rowFeast;
        const rowMemorial = pick(row, ["memorial_name", "memorial", "peringatan"]);
        const rowSaint = pick(row, ["saint_name", "saint", "orang_kudus"]);

        if (!rowFeast || !rowLiturgicalDay || !rowCycle || !rowRank || !rowColor) {
          invalidRows.push(
            `baris ${rowNumber} (${rowDate}): feast/day_name/color/rank/cycle wajib valid`,
          );
          continue;
        }

        const readings: ReadingsPayload = {
          bacaan1: references.bacaan1,
          mazmur: references.mazmur,
          bait_pengantar_injil: references.baitPengantarInjil,
          injil: references.injil,
          bacaan1_teks: texts.bacaan1Text,
          mazmur_teks: texts.mazmurTextValue,
          bait_pengantar_injil_teks: texts.baitText,
          injil_teks: texts.injilTextValue,
          tahun_siklus: rowCycle,
          nama_liturgi: rowLiturgicalDay,
          tingkat_perayaan: rowRank,
        };

        if (references.bacaan2) readings.bacaan2 = references.bacaan2;
        if (texts.bacaan2Text) readings.bacaan2_teks = texts.bacaan2Text;
        if (rowMemorial) readings.peringatan = rowMemorial;
        if (rowSaint) readings.saint_name = rowSaint;

        payload.push({
          date: rowDate,
          feast_name: rowFeast,
          liturgical_day_name: rowLiturgicalDay,
          celebration_rank: rowRank,
          memorial_name: rowMemorial || null,
          saint_name: rowSaint || null,
          color: rowColor,
          liturgical_cycle: rowCycle,
          bait_pengantar_injil: references.baitPengantarInjil,
          bacaan1: references.bacaan1,
          bacaan1_teks: texts.bacaan1Text,
          bacaan2: references.bacaan2 || null,
          bacaan2_teks: texts.bacaan2Text || null,
          mazmur: references.mazmur,
          mazmur_teks: texts.mazmurTextValue,
          bait_pengantar_injil_teks: texts.baitText,
          injil: references.injil,
          injil_teks: texts.injilTextValue,
          readings,
        });
      }

      if (invalidRows.length > 0) {
        const preview = invalidRows.slice(0, 5).join("; ");
        const suffix =
          invalidRows.length > 5
            ? `; dan ${invalidRows.length - 5} baris lain`
            : "";
        throw new Error(
          `Import dibatalkan: ${invalidRows.length} baris tidak valid. ${preview}${suffix}`,
        );
      }

      if (payload.length === 0) {
        throw new Error("Tidak ada data valid untuk diimpor. Pastikan semua kolom wajib terisi.");
      }

      const chunkSize = 200;
      for (let i = 0; i < payload.length; i += chunkSize) {
        await savePayload(payload.slice(i, i + chunkSize));
      }

      await fetchLiturgyList();
      toast.success(`Import berhasil: ${payload.length} baris`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Import liturgy error:", error);
      toast.error(`Import gagal: ${message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteByDate = async (targetDate: string) => {
    if (!targetDate) return;
    const confirmed = window.confirm(`Hapus data liturgi tanggal ${targetDate}?`);
    if (!confirmed) return;

    setDeletingDate(targetDate);
    try {
      const { error } = await supabase.from("daily_liturgy").delete().eq("date", targetDate);
      if (error) throw error;

      if (date === targetDate) {
        resetForm();
      }

      await fetchLiturgyList();
      toast.success(`Data liturgi ${targetDate} berhasil dihapus`);
    } catch (error) {
      console.error("Error deleting liturgy row:", error);
      toast.error("Gagal menghapus data liturgi");
    } finally {
      setDeletingDate(null);
    }
  };

  const filteredRows = useMemo(() => {
    const keyword = listSearch.trim().toLowerCase();
    if (!keyword) return listRows;

    return listRows.filter((row) => {
      const haystack = [
        row.date,
        row.feast_name ?? "",
        row.liturgical_day_name ?? "",
        row.memorial_name ?? "",
        row.saint_name ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [listRows, listSearch]);

  const colors = [
    { value: "green", label: "Hijau (Masa Biasa)", bg: "bg-green-600" },
    { value: "red", label: "Merah (Martir/Roh Kudus)", bg: "bg-red-600" },
    {
      value: "white",
      label: "Putih/Emas (Hari Raya)",
      bg: "bg-slate-100 border-slate-300",
    },
    { value: "purple", label: "Ungu (Adven/Prapaskah)", bg: "bg-purple-600" },
    { value: "rose", label: "Rose (Gaudete/Laetare)", bg: "bg-pink-500" },
    { value: "black", label: "Hitam (Misa Arwah)", bg: "bg-slate-900" },
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
        placeholder="Masukkan teks lengkap"
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
            Semua konten liturgi harian (Tahun A/B/C) dikelola dari dashboard admin dan disimpan ke database.
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

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Isi data dari sumber liturgi resmi. Kolom wajib: nama perayaan, nama hari liturgi, warna,
        tingkat perayaan, siklus tahun A/B/C, Bacaan I, Mazmur, Bait Pengantar Injil, Injil, serta
        teks lengkapnya. Bacaan II dan teksnya diisi jika tersedia.
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

            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 mt-4">
              Tingkat Perayaan
            </label>
            <select
              value={celebrationRank}
              onChange={(e) => setCelebrationRank(toRank(e.target.value))}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-sm"
            >
              {rankOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
              <div className="grid grid-cols-1 gap-4">
                {renderTextInput(
                  "Nama Perayaan / Pesta (Wajib)",
                  feastName,
                  setFeastName,
                  "Nama perayaan hari ini",
                )}
                {renderTextInput(
                  "Nama Hari Liturgi (Wajib)",
                  liturgicalDayName,
                  setLiturgicalDayName,
                  "Nama hari liturgi",
                )}
                {renderTextInput(
                  "Peringatan (Opsional)",
                  memorialName,
                  setMemorialName,
                  "Memorial atau peringatan",
                )}
                {renderTextInput(
                  "Orang Kudus (Opsional)",
                  saintName,
                  setSaintName,
                  "Nama santo/santa",
                )}
              </div>

              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                Referensi Bacaan
              </h3>

              <div className="grid grid-cols-1 gap-4">
                {renderTextInput("Bacaan I (Wajib)", bacaan1, setBacaan1, "Referensi Bacaan I")}
                {renderTextInput(
                  "Mazmur Tanggapan (Wajib)",
                  mazmur,
                  setMazmur,
                  "Referensi Mazmur",
                )}
                {renderTextInput(
                  "Bacaan II (Opsional)",
                  bacaan2,
                  setBacaan2,
                  "Referensi Bacaan II jika ada",
                )}
                {renderTextInput(
                  "Bait Pengantar Injil (Wajib)",
                  baitPengantarInjil,
                  setBaitPengantarInjil,
                  "Referensi/teks singkat bait pengantar injil",
                )}
                {renderTextInput("Injil (Wajib)", injil, setInjil, "Referensi Injil")}
              </div>

              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                Teks Bacaan Lengkap
              </h3>

              <div className="grid grid-cols-1 gap-4">
                {renderTextArea("Teks Bacaan I (Wajib)", bacaan1Text, setBacaan1Text)}
                {renderTextArea("Teks Mazmur (Wajib)", mazmurText, setMazmurText)}
                {renderTextArea("Teks Bacaan II (Opsional)", bacaan2Text, setBacaan2Text)}
                {renderTextArea(
                  "Teks Bait Pengantar Injil (Wajib)",
                  baitPengantarInjilText,
                  setBaitPengantarInjilText,
                )}
                {renderTextArea("Teks Injil (Wajib)", injilText, setInjilText)}
              </div>

              <div className="pt-2 space-y-2">
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
                <button
                  type="button"
                  onClick={() => void handleDeleteByDate(date)}
                  disabled={!date || deletingDate === date || loading}
                  className="w-full border border-rose-300 text-rose-700 hover:bg-rose-50 font-semibold py-2.5 px-6 rounded-xl transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {deletingDate === date ? (
                    <>
                      <div className="w-4 h-4 border-2 border-rose-500/30 border-t-rose-600 rounded-full animate-spin" />
                      Menghapus...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Hapus Data Tanggal Ini
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Daftar Liturgi Tersimpan</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Pilih data dari tabel untuk memuat form edit, atau hapus data yang tidak valid.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchLiturgyList()}
            disabled={listing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCcw className={`w-4 h-4 ${listing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Filter Bulan
            </label>
            <input
              type="month"
              value={listMonth}
              onChange={(e) => setListMonth(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Cari Data
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="Tanggal, nama perayaan, nama hari liturgi..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="text-sm text-slate-500 dark:text-slate-400">
          Menampilkan {filteredRows.length} data dari {listRows.length} data pada filter bulan aktif.
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="text-left px-4 py-3">Tanggal</th>
                <th className="text-left px-4 py-3">Perayaan</th>
                <th className="text-left px-4 py-3">Atribut</th>
                <th className="text-left px-4 py-3 w-44">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {listing ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    Memuat data liturgi...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    Tidak ada data pada filter saat ini.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const rowColor = row.color ? colors.find((item) => item.value === row.color) : null;
                  const rowRank = row.celebration_rank
                    ? rankOptions.find((item) => item.value === row.celebration_rank)
                    : null;

                  return (
                    <tr
                      key={row.date}
                      className={`border-t border-slate-200 dark:border-slate-800 ${
                        row.date === date ? "bg-blue-50/70 dark:bg-blue-900/10" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                        {row.date}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800 dark:text-slate-100">
                          {row.feast_name ?? "-"}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {row.liturgical_day_name ?? "-"}
                        </div>
                        {(row.memorial_name || row.saint_name) && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {[row.memorial_name, row.saint_name].filter(Boolean).join(" • ")}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${
                                rowColor?.bg ?? "bg-slate-300"
                              } ${row.color === "white" ? "border border-slate-300" : ""}`}
                            />
                            {rowColor?.label ?? "Warna belum valid"}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                            Siklus {row.liturgical_cycle ?? "-"}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {rowRank?.label ?? row.celebration_rank ?? "-"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setDate(row.date)}
                            className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold"
                          >
                            Muat
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteByDate(row.date)}
                            disabled={deletingDate === row.date}
                            className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {deletingDate === row.date ? "Menghapus..." : "Hapus"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
