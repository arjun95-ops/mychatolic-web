"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Image from "next/image";

export default function VerifikasiPage() {
    const [profiles, setProfiles] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPendingProfiles();
    }, []);

    const fetchPendingProfiles = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from("profiles")
                .select("*")
                .eq("status", "pending")
                .order("created_at", { ascending: false });

            if (error) throw error;
            setProfiles(data || []);
        } catch (error) {
            console.error("Error fetching profiles:", error);
            alert("Gagal memuat data verifikasi.");
        } finally {
            setLoading(false);
        }
    };

    const updateStatus = async (id, newStatus) => {
        // Optimistic UI update
        setProfiles((prev) => prev.filter((profile) => profile.id !== id));

        try {
            const { error } = await supabase
                .from("profiles")
                .update({ status: newStatus })
                .eq("id", id);

            if (error) {
                throw error;
            }

            // Optional: Add toast notification here
            console.log(`Profile ${id} updated to ${newStatus}`);
        } catch (error) {
            console.error("Error updating status:", error);
            alert("Gagal mengupdate status. Silakan refresh halaman.");
            // Rollback logic could be added here if needed, but simple fetch might be easier
            fetchPendingProfiles();
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 p-6 md:p-12 text-slate-100 font-sans">
            <div className="max-w-7xl mx-auto">
                <header className="mb-10">
                    <h1 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-slate-200 to-slate-400">
                        Verifikasi Umat
                    </h1>
                    <p className="mt-2 text-slate-400">
                        Daftar permohonan verifikasi akun baru (Status: Pending)
                    </p>
                </header>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                        {[...Array(6)].map((_, i) => (
                            <div
                                key={i}
                                className="bg-slate-800 h-96 rounded-xl border border-slate-700/50"
                            ></div>
                        ))}
                    </div>
                ) : profiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-slate-800/50 rounded-xl border border-slate-700 border-dashed">
                        <p className="text-xl text-slate-400">Tidak ada data pending.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {profiles.map((profile) => (
                            <div
                                key={profile.id}
                                className="bg-slate-800 rounded-xl overflow-hidden shadow-lg border border-slate-700/50 hover:border-slate-600 transition-all duration-300 flex flex-col group"
                            >
                                {/* Image Section */}
                                <div className="relative h-64 w-full bg-slate-900 overflow-hidden">
                                    {profile.baptism_cert_url ? (
                                        <a
                                            href={profile.baptism_cert_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block h-full w-full relative"
                                        >
                                            <img
                                                src={profile.baptism_cert_url}
                                                alt={`Baptism Cert - ${profile.full_name}`}
                                                className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                                            />
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300">
                                                <span className="text-white bg-black/60 px-3 py-1 rounded-full text-sm font-medium border border-white/20">
                                                    Lihat Dokumen
                                                </span>
                                            </div>
                                        </a>
                                    ) : (
                                        <div className="h-full w-full flex items-center justify-center text-slate-500">
                                            <span className="text-sm">No Document</span>
                                        </div>
                                    )}
                                </div>

                                {/* Content Section */}
                                <div className="p-5 flex-1 flex flex-col">
                                    <div className="mb-4">
                                        <h2 className="text-xl font-bold text-white mb-1 line-clamp-1">
                                            {profile.full_name || "Tanpa Nama"}
                                        </h2>
                                        <p className="text-sm text-emerald-400 font-medium tracking-wide">
                                            {profile.parish_origin || "Paroki Tidak Diketahui"}
                                        </p>
                                    </div>

                                    <div className="mt-auto space-y-3 pt-4 border-t border-slate-700/50">
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => updateStatus(profile.id, "verified")}
                                                className="w-full bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/50 hover:border-green-500 rounded-lg py-2.5 px-4 font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                                TERIMA
                                            </button>
                                            <button
                                                onClick={() => updateStatus(profile.id, "rejected")}
                                                className="w-full bg-red-600/20 hover:bg-red-600/30 text-red-500 border border-red-600/50 hover:border-red-500 rounded-lg py-2.5 px-4 font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                                TOLAK
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
