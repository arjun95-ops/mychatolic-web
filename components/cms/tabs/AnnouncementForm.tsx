"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { X, Globe, MapPin, Church } from "lucide-react";

interface AnnouncementFormProps {
    isOpen: boolean;
    onClose: () => void;
    announcement?: any;
    onSuccess: () => void;
}

export default function AnnouncementForm({ isOpen, onClose, announcement, onSuccess }: AnnouncementFormProps) {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: "",
        content: "",
        target_audience: "nasional", // nasional, keuskupan, paroki
        target_id: null as null | string,
        is_active: true
    });

    // Reference data
    const [dioceses, setDioceses] = useState<any[]>([]);
    const [churches, setChurches] = useState<any[]>([]);

    useEffect(() => {
        if (announcement) {
            setFormData({
                title: announcement.title,
                content: announcement.content,
                target_audience: announcement.target_audience,
                target_id: announcement.target_id,
                is_active: announcement.is_active
            });
        } else {
            setFormData({
                title: "",
                content: "",
                target_audience: "nasional",
                target_id: null,
                is_active: true
            });
        }
    }, [announcement, isOpen]);

    // Fetch reference data when audience type changes
    useEffect(() => {
        const fetchData = async () => {
            if (formData.target_audience === 'keuskupan' && dioceses.length === 0) {
                const { data } = await supabase.from('dioceses').select('id, name').order('name');
                setDioceses(data || []);
            } else if (formData.target_audience === 'paroki' && churches.length === 0) {
                const { data } = await supabase.from('churches').select('id, name').order('name');
                setChurches(data || []);
            }
        };
        fetchData();
    }, [formData.target_audience]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const payload = {
                ...formData,
                // Ensure target_id is null if nasional
                target_id: formData.target_audience === 'nasional' ? null : formData.target_id
            };

            let error;
            if (announcement) {
                // Update
                ({ error } = await supabase
                    .from('announcements')
                    .update(payload)
                    .eq('id', announcement.id));
            } else {
                // Insert
                ({ error } = await supabase
                    .from('announcements')
                    .insert([payload]));
            }

            if (error) throw error;

            showToast(`Pengumuman berhasil ${announcement ? 'diperbarui' : 'dibuat'}`, "success");
            onSuccess();
        } catch (e: any) {
            showToast("Gagal menyimpan: " + e.message, "error");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl border border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-xl font-bold">{announcement ? 'Edit Pengumuman' : 'Buat Pengumuman'}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Audience Selection */}
                    <div>
                        <label className="block text-sm font-medium mb-3">Target Audience</label>
                        <div className="grid grid-cols-3 gap-3">
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, target_audience: 'nasional' })}
                                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${formData.target_audience === 'nasional'
                                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                                        : 'border-slate-200 hover:border-blue-200 dark:border-slate-700'
                                    }`}
                            >
                                <Globe className="w-5 h-5 mb-1" />
                                <span className="text-xs font-bold">Nasional</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, target_audience: 'keuskupan' })}
                                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${formData.target_audience === 'keuskupan'
                                        ? 'border-purple-600 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400'
                                        : 'border-slate-200 hover:border-purple-200 dark:border-slate-700'
                                    }`}
                            >
                                <Church className="w-5 h-5 mb-1" />
                                <span className="text-xs font-bold">Keuskupan</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, target_audience: 'paroki' })}
                                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${formData.target_audience === 'paroki'
                                        ? 'border-green-600 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                        : 'border-slate-200 hover:border-green-200 dark:border-slate-700'
                                    }`}
                            >
                                <MapPin className="w-5 h-5 mb-1" />
                                <span className="text-xs font-bold">Paroki</span>
                            </button>
                        </div>
                    </div>

                    {/* Conditional Target ID */}
                    {formData.target_audience === 'keuskupan' && (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                            <label className="block text-sm font-medium mb-2">Pilih Keuskupan</label>
                            <select
                                required
                                value={formData.target_id || ""}
                                onChange={(e) => setFormData({ ...formData, target_id: e.target.value })}
                                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-500"
                            >
                                <option value="">-- Pilih Keuskupan --</option>
                                {dioceses.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {formData.target_audience === 'paroki' && (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                            <label className="block text-sm font-medium mb-2">Pilih Paroki</label>
                            <select
                                required
                                value={formData.target_id || ""}
                                onChange={(e) => setFormData({ ...formData, target_id: e.target.value })}
                                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-green-500"
                            >
                                <option value="">-- Pilih Paroki --</option>
                                {churches.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Title */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Judul Pengumuman</label>
                        <input
                            type="text"
                            required
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Judul singkat & jelas..."
                        />
                    </div>

                    {/* Content */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Isi Pengumuman</label>
                        <textarea
                            required
                            rows={5}
                            value={formData.content}
                            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Detail lengkap pengumuman..."
                        ></textarea>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formData.is_active}
                                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium">Status Aktif</span>
                        </label>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-blue-500/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Menyimpan...
                                    </>
                                ) : (
                                    'Simpan Pengumuman'
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
