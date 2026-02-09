"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CountryTab from "./tabs/CountryTab";
import DioceseTab from "./tabs/DioceseTab";
import ChurchesTab from "./tabs/ChurchesTab";
import SchedulesTab from "./tabs/SchedulesTab";
import BulkImportExport from "./BulkImportExport";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, RefreshCw } from "lucide-react";

type TabType = 'countries' | 'dioceses' | 'churches' | 'schedules';
type CountryLite = { id: string; name: string };
type DioceseLite = { id: string; name: string; country_id: string };
type ChurchLite = { id: string; diocese_id: string };

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
            const [
                { data: countryRows, error: countryError },
                { data: dioceseRows, error: dioceseError },
                { data: churchRows, error: churchError },
            ] = await Promise.all([
                supabase.from("countries").select("id, name").order("name"),
                supabase.from("dioceses").select("id, name, country_id").order("name"),
                supabase.from("churches").select("id, diocese_id"),
            ]);

            if (countryError) throw countryError;
            if (dioceseError) throw dioceseError;
            if (churchError) throw churchError;

            setCountries((countryRows || []) as CountryLite[]);
            setDioceses((dioceseRows || []) as DioceseLite[]);
            setChurches((churchRows || []) as ChurchLite[]);
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
                        <select
                            value={selectedCountryId}
                            onChange={(e) => setSelectedCountryId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                            disabled={summaryLoading || countries.length === 0}
                        >
                            {countries.map((country) => (
                                <option key={country.id} value={country.id}>
                                    {country.name}
                                </option>
                            ))}
                        </select>
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
                        <select
                            value={selectedDioceseId}
                            onChange={(e) => setSelectedDioceseId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                            disabled={summaryLoading || filteredDioceseOptions.length === 0}
                        >
                            {filteredDioceseOptions.map((diocese) => (
                                <option key={diocese.id} value={diocese.id}>
                                    {diocese.name}
                                </option>
                            ))}
                        </select>
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
