"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function UserManagementPage() {
    const [profiles, setProfiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [vocationFilter, setVocationFilter] = useState("all"); // 'all', 'Pastor', 'Suster', 'Umat Umum'
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        fetchProfiles();
    }, [vocationFilter, searchQuery]);

    const fetchProfiles = async () => {
        try {
            setLoading(true);
            let query = supabase
                .from("profiles")
                .select("id, full_name, user_category, church_id, birth_date, created_at")
                .order("created_at", { ascending: false });

            // 1. Vocation Filtering
            if (vocationFilter !== "all") {
                query = query.eq("user_category", vocationFilter);
            }

            // 2. Search
            if (searchQuery) {
                query = query.ilike("full_name", `%${searchQuery}%`);
            }

            const { data, error } = await query;

            if (error) throw error;
            setProfiles(data || []);
        } catch (error) {
            console.error("Error fetching users:", error);
            // alert("Gagal memuat data pengguna."); // Optional: Don't spam alerts on type
        } finally {
            setLoading(false);
        }
    };

    // Helper: Calculate Age from birth_date
    const calculateAge = (birthDateString) => {
        if (!birthDateString) return "-";
        const today = new Date();
        const birthDate = new Date(birthDateString);
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    };

    // Helper: Format Date
    const formatDate = (dateString) => {
        if (!dateString) return "-";
        return new Date(dateString).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-6 md:p-12">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <header>
                    <h1 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-slate-100 to-slate-400">
                        Manajemen Pengguna
                    </h1>
                    <p className="mt-2 text-slate-400">
                        Kelola data umat, pastor, dan suster dalam satu tampilan.
                    </p>
                </header>

                {/* Controls Section */}
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 flex flex-col md:flex-row gap-4 justify-between items-center backdrop-blur-sm">
                    {/* Vocation Filters */}
                    <div className="flex p-1 bg-slate-900 rounded-lg border border-slate-700 w-full md:w-auto overflow-x-auto">
                        {["all", "Pastor", "Suster", "Umat Umum"].map((filter) => (
                            <button
                                key={filter}
                                onClick={() => setVocationFilter(filter)}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${vocationFilter === filter
                                        ? "bg-slate-700 text-white shadow-sm"
                                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                                    }`}
                            >
                                {filter === "all" ? "Semua User" : filter}
                            </button>
                        ))}
                    </div>

                    {/* Search Bar */}
                    <div className="relative w-full md:w-80">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            placeholder="Cari nama pengguna..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2 border border-slate-600 rounded-lg leading-5 bg-slate-900 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm transition-all shadow-inner"
                        />
                    </div>
                </div>

                {/* Data Table */}
                <div className="bg-slate-800 rounded-xl overflow-hidden shadow-lg border border-slate-700/50">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-700">
                            <thead className="bg-slate-900/50">
                                <tr>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                        Nama Lengkap
                                    </th>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                        Kategori
                                    </th>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                        Usia
                                    </th>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                        Lokasi (Gereja)
                                    </th>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                        Terdaftar
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700 bg-slate-800">
                                {loading ? (
                                    // Loading Skeletons
                                    [...Array(5)].map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td className="px-6 py-4"><div className="h-4 bg-slate-700 rounded w-32"></div></td>
                                            <td className="px-6 py-4"><div className="h-4 bg-slate-700 rounded w-20"></div></td>
                                            <td className="px-6 py-4"><div className="h-4 bg-slate-700 rounded w-8"></div></td>
                                            <td className="px-6 py-4"><div className="h-4 bg-slate-700 rounded w-24"></div></td>
                                            <td className="px-6 py-4"><div className="h-4 bg-slate-700 rounded w-24"></div></td>
                                        </tr>
                                    ))
                                ) : profiles.length > 0 ? (
                                    profiles.map((profile) => (
                                        <tr
                                            key={profile.id}
                                            className="hover:bg-slate-700/50 transition-colors duration-150 group"
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-white">
                                                    {profile.full_name || "Tanpa Nama"}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                                    ${profile.user_category === 'Pastor' ? 'bg-purple-100 text-purple-800' :
                                                        profile.user_category === 'Suster' ? 'bg-pink-100 text-pink-800' :
                                                            'bg-emerald-100 text-emerald-800'}`}>
                                                    {profile.user_category || "Umat Umum"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                                                {calculateAge(profile.birth_date)} Tahun
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                                                {profile.church_id ? (
                                                    <span className="flex items-center gap-1">
                                                        <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                        ID: {profile.church_id}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-500 italic">Belum bergabung</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                                {formatDate(profile.created_at)}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                            Tidak ada data ditemukan untuk filter ini.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {/* Footer / Pagination Placeholder */}
                    <div className="bg-slate-900/30 px-6 py-3 border-t border-slate-700/50 flex items-center justify-between">
                        <span className="text-xs text-slate-500">
                            Menampilkan maks. 100 data terbaru
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
