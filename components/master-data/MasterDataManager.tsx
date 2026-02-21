"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CountryTab from "./tabs/CountryTab";
import DioceseTab from "./tabs/DioceseTab";
import ChurchesTab from "./tabs/ChurchesTab";
import SchedulesTab from "./tabs/SchedulesTab";
import BulkImportExport from "./BulkImportExport";
import { supabase } from "@/lib/supabaseClient";
import { ChevronDown, Loader2, RefreshCw, Search } from "lucide-react";

type TabType = 'countries' | 'dioceses' | 'churches' | 'schedules';
type CountryLite = { id: string; name: string };
type DioceseLite = { id: string; name: string; country_id: string };
type ChurchLite = { id: string; diocese_id: string };
const SUMMARY_FETCH_PAGE_SIZE = 1000;

type SearchableOption = {
    value: string;
    label: string;
    searchText?: string;
};

type SearchableSelectProps = {
    value: string;
    options: SearchableOption[];
    placeholder: string;
    searchPlaceholder: string;
    emptyLabel: string;
    disabled?: boolean;
    onChange: (value: string) => void;
};

function SearchableSelect({
    value,
    options,
    placeholder,
    searchPlaceholder,
    emptyLabel,
    disabled,
    onChange,
}: SearchableSelectProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const rootRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const selectedLabel = useMemo(() => {
        if (!value) return placeholder;
        return options.find((item) => item.value === value)?.label || placeholder;
    }, [options, placeholder, value]);

    const visibleOptions = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) return options;
        return options.filter((item) => {
            const haystack = (item.searchText || item.label).toLowerCase();
            return haystack.includes(normalizedQuery);
        });
    }, [options, query]);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(event.target as Node)) {
                setOpen(false);
                setQuery("");
            }
        };
        document.addEventListener("mousedown", onPointerDown);
        return () => document.removeEventListener("mousedown", onPointerDown);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const timer = setTimeout(() => inputRef.current?.focus(), 0);
        return () => clearTimeout(timer);
    }, [open]);

    const handleSelect = (nextValue: string) => {
        onChange(nextValue);
        setOpen(false);
        setQuery("");
    };

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen((prev) => !prev)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-left text-slate-900 dark:text-white disabled:opacity-60 flex items-center justify-between gap-2"
            >
                <span className="truncate">{selectedLabel}</span>
                <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />
            </button>

            {open && !disabled ? (
                <div className="absolute z-40 mt-2 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
                    <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={searchPlaceholder}
                                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-slate-900 dark:text-white"
                            />
                        </div>
                    </div>

                    <div className="max-h-60 overflow-auto py-1">
                        {visibleOptions.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-slate-500">{emptyLabel}</div>
                        ) : (
                            visibleOptions.map((item) => {
                                const isSelected = value === item.value;
                                return (
                                    <button
                                        key={item.value}
                                        type="button"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => handleSelect(item.value)}
                                        className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                                            isSelected
                                                ? "bg-brand-primary/10 text-brand-primary font-semibold"
                                                : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default function MasterDataManager() {
    const [activeTab, setActiveTab] = useState<TabType>('countries');
    const [summaryLoading, setSummaryLoading] = useState(true);
    const [summaryError, setSummaryError] = useState<string | null>(null);
    const [refreshingSummary, setRefreshingSummary] = useState(false);
    const [countries, setCountries] = useState<CountryLite[]>([]);
    const [dioceses, setDioceses] = useState<DioceseLite[]>([]);
    const [churches, setChurches] = useState<ChurchLite[]>([]);
    const [selectedCountryId, setSelectedCountryId] = useState("");
    const [selectedDioceseId, setSelectedDioceseId] = useState("");

    const tabs: { id: TabType; label: string }[] = [
        { id: 'countries', label: 'Negara' },
        { id: 'dioceses', label: 'Keuskupan' },
        { id: 'churches', label: 'Paroki' },
        { id: 'schedules', label: '🗓️ Jadwal Misa' },
    ];

    const fetchSummary = useCallback(async () => {
        try {
            setSummaryError(null);
            const fetchCountriesAll = async () => {
                const rows: CountryLite[] = [];
                for (let from = 0; ; from += SUMMARY_FETCH_PAGE_SIZE) {
                    const to = from + SUMMARY_FETCH_PAGE_SIZE - 1;
                    const { data, error } = await supabase
                        .from("countries")
                        .select("id, name")
                        .order("name")
                        .range(from, to);
                    if (error) throw error;
                    const batch = (data || []) as CountryLite[];
                    rows.push(...batch);
                    if (batch.length < SUMMARY_FETCH_PAGE_SIZE) break;
                }
                return rows;
            };

            const fetchDiocesesAll = async () => {
                const rows: DioceseLite[] = [];
                for (let from = 0; ; from += SUMMARY_FETCH_PAGE_SIZE) {
                    const to = from + SUMMARY_FETCH_PAGE_SIZE - 1;
                    const { data, error } = await supabase
                        .from("dioceses")
                        .select("id, name, country_id")
                        .order("name")
                        .range(from, to);
                    if (error) throw error;
                    const batch = (data || []) as DioceseLite[];
                    rows.push(...batch);
                    if (batch.length < SUMMARY_FETCH_PAGE_SIZE) break;
                }
                return rows;
            };

            const fetchChurchesAll = async () => {
                const rows: ChurchLite[] = [];
                for (let from = 0; ; from += SUMMARY_FETCH_PAGE_SIZE) {
                    const to = from + SUMMARY_FETCH_PAGE_SIZE - 1;
                    const { data, error } = await supabase
                        .from("churches")
                        .select("id, diocese_id")
                        .order("id")
                        .range(from, to);
                    if (error) throw error;
                    const batch = (data || []) as ChurchLite[];
                    rows.push(...batch);
                    if (batch.length < SUMMARY_FETCH_PAGE_SIZE) break;
                }
                return rows;
            };

            const [countryRows, dioceseRows, churchRows] = await Promise.all([
                fetchCountriesAll(),
                fetchDiocesesAll(),
                fetchChurchesAll(),
            ]);

            setCountries(countryRows);
            setDioceses(dioceseRows);
            setChurches(churchRows);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Gagal memuat ringkasan data.";
            setSummaryError(message);
        } finally {
            setSummaryLoading(false);
            setRefreshingSummary(false);
        }
    }, []);

    const handleRefreshSummary = useCallback(() => {
        setRefreshingSummary(true);
        void fetchSummary();
    }, [fetchSummary]);

    const handleMasterDataChanged = useCallback(() => {
        void fetchSummary();
    }, [fetchSummary]);

    useEffect(() => {
        void fetchSummary();
    }, [fetchSummary]);

    const diocesesByCountry = useMemo(() => {
        const map: Record<string, number> = {};
        for (const diocese of dioceses) {
            const countryId = String(diocese.country_id || "");
            if (!countryId) continue;
            map[countryId] = (map[countryId] || 0) + 1;
        }
        return map;
    }, [dioceses]);

    const dioceseCountryById = useMemo(() => {
        const map: Record<string, string> = {};
        for (const diocese of dioceses) {
            const id = String(diocese.id || "");
            if (!id) continue;
            map[id] = String(diocese.country_id || "");
        }
        return map;
    }, [dioceses]);

    const churchesByDiocese = useMemo(() => {
        const map: Record<string, number> = {};
        for (const church of churches) {
            const dioceseId = String(church.diocese_id || "");
            if (!dioceseId) continue;
            map[dioceseId] = (map[dioceseId] || 0) + 1;
        }
        return map;
    }, [churches]);

    const churchesByCountry = useMemo(() => {
        const map: Record<string, number> = {};
        for (const church of churches) {
            const dioceseId = String(church.diocese_id || "");
            if (!dioceseId) continue;
            const countryId = dioceseCountryById[dioceseId] || "";
            if (!countryId) continue;
            map[countryId] = (map[countryId] || 0) + 1;
        }
        return map;
    }, [churches, dioceseCountryById]);

    const filteredDioceseOptions = useMemo(() => {
        if (!selectedCountryId) return dioceses;
        return dioceses.filter((item) => String(item.country_id || "") === selectedCountryId);
    }, [dioceses, selectedCountryId]);

    const countryOptions = useMemo<SearchableOption[]>(
        () =>
            countries.map((country) => ({
                value: country.id,
                label: country.name,
                searchText: country.name,
            })),
        [countries]
    );

    const dioceseOptions = useMemo<SearchableOption[]>(
        () =>
            filteredDioceseOptions.map((diocese) => ({
                value: diocese.id,
                label: diocese.name,
                searchText: diocese.name,
            })),
        [filteredDioceseOptions]
    );

    useEffect(() => {
        if (countries.length === 0) {
            if (selectedCountryId) setSelectedCountryId("");
            return;
        }
        if (!selectedCountryId || !countries.some((item) => item.id === selectedCountryId)) {
            setSelectedCountryId(countries[0].id);
        }
    }, [countries, selectedCountryId]);

    useEffect(() => {
        if (filteredDioceseOptions.length === 0) {
            if (selectedDioceseId) setSelectedDioceseId("");
            return;
        }
        if (!selectedDioceseId || !filteredDioceseOptions.some((item) => item.id === selectedDioceseId)) {
            setSelectedDioceseId(filteredDioceseOptions[0].id);
        }
    }, [filteredDioceseOptions, selectedDioceseId]);

    const selectedCountry = useMemo(
        () => countries.find((item) => item.id === selectedCountryId) || null,
        [countries, selectedCountryId]
    );

    const selectedDiocese = useMemo(
        () => dioceses.find((item) => item.id === selectedDioceseId) || null,
        [dioceses, selectedDioceseId]
    );

    const totalCountries = countries.length;
    const totalDioceses = dioceses.length;
    const totalChurches = churches.length;
    const selectedCountryDioceseCount = selectedCountryId ? (diocesesByCountry[selectedCountryId] || 0) : 0;
    const selectedCountryChurchCount = selectedCountryId ? (churchesByCountry[selectedCountryId] || 0) : 0;
    const selectedDioceseChurchCount = selectedDioceseId ? (churchesByDiocese[selectedDioceseId] || 0) : 0;

    return (
        <div className="space-y-8">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-primary to-action tracking-tight">Master Data Management</h1>
                    <p className="text-slate-500 mt-1">Pusat pengelolaan master data global (Negara, Keuskupan, Paroki).</p>
                </div>
                <BulkImportExport />
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Ringkasan Master Data</h2>
                        <p className="text-sm text-slate-500">Total data + klasifikasi cepat per Negara dan Keuskupan.</p>
                    </div>
                    <button
                        onClick={handleRefreshSummary}
                        disabled={refreshingSummary}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold disabled:opacity-60"
                    >
                        {refreshingSummary ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Refresh
                    </button>
                </div>

                {summaryError && (
                    <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-lg px-3 py-2">
                        {summaryError}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-800/40">
                        <p className="text-xs uppercase text-slate-500 font-semibold tracking-wide">Total Negara</p>
                        <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{summaryLoading ? "-" : totalCountries}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-800/40">
                        <p className="text-xs uppercase text-slate-500 font-semibold tracking-wide">Total Keuskupan</p>
                        <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{summaryLoading ? "-" : totalDioceses}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-800/40">
                        <p className="text-xs uppercase text-slate-500 font-semibold tracking-wide">Total Paroki</p>
                        <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{summaryLoading ? "-" : totalChurches}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">Klasifikasi Negara</p>
                        <SearchableSelect
                            value={selectedCountryId}
                            options={countryOptions}
                            placeholder={summaryLoading ? "Memuat negara..." : "Pilih negara"}
                            searchPlaceholder="Cari negara..."
                            emptyLabel="Negara tidak ditemukan"
                            disabled={summaryLoading || countries.length === 0}
                            onChange={setSelectedCountryId}
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3">
                                <p className="text-xs text-slate-500 uppercase font-semibold">Jumlah Keuskupan</p>
                                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{selectedCountryDioceseCount}</p>
                            </div>
                            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3">
                                <p className="text-xs text-slate-500 uppercase font-semibold">Jumlah Paroki</p>
                                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{selectedCountryChurchCount}</p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-500">
                            {selectedCountry ? `Negara terpilih: ${selectedCountry.name}` : "Belum ada negara terpilih."}
                        </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">Klasifikasi Keuskupan</p>
                        <SearchableSelect
                            value={selectedDioceseId}
                            options={dioceseOptions}
                            placeholder={summaryLoading ? "Memuat keuskupan..." : "Pilih keuskupan"}
                            searchPlaceholder="Cari keuskupan..."
                            emptyLabel="Keuskupan tidak ditemukan"
                            disabled={summaryLoading || filteredDioceseOptions.length === 0}
                            onChange={setSelectedDioceseId}
                        />
                        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3">
                            <p className="text-xs text-slate-500 uppercase font-semibold">Jumlah Paroki</p>
                            <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{selectedDioceseChurchCount}</p>
                        </div>
                        <p className="text-xs text-slate-500">
                            {selectedDiocese ? `Keuskupan terpilih: ${selectedDiocese.name}` : "Belum ada keuskupan terpilih."}
                        </p>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="border-b border-slate-200 flex gap-8 overflow-x-auto">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`pb-3 text-sm font-medium transition-all whitespace-nowrap px-1 relative ${activeTab === tab.id
                            ? 'text-brand-primary font-bold'
                            : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        {tab.label}
                        {activeTab === tab.id && (
                            <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-brand-primary to-action rounded-t-full" />
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="min-h-[500px] mt-6">
                {activeTab === 'countries' && <CountryTab onDataChanged={handleMasterDataChanged} />}
                {activeTab === 'dioceses' && <DioceseTab onDataChanged={handleMasterDataChanged} />}
                {activeTab === 'churches' && <ChurchesTab onDataChanged={handleMasterDataChanged} />}
                {activeTab === 'schedules' && <SchedulesTab />}
            </div>
        </div>
    );
}
