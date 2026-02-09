"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { Edit2, Trash2, Plus, Bell, Megaphone, MapPin, Globe } from "lucide-react";
import AnnouncementForm from "@/components/cms/tabs/AnnouncementForm";

type AnnouncementItem = {
    id: string;
    title: string;
    content: string;
    target_audience: string;
    is_active: boolean;
    created_at: string;
    target_id: string | null;
};

export default function AnnouncementsTab() {
    const { showToast } = useToast();
    const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAnnouncement, setEditingAnnouncement] = useState<AnnouncementItem | null>(null);

    const fetchAnnouncements = useCallback(async () => {
        setLoading(true);
        let query = supabase
            .from('announcements')
            .select('*')
            .order('created_at', { ascending: false });

        if (search) {
            query = query.ilike('title', `%${search}%`);
        }

        const { data, error } = await query;
        if (error) {
            showToast("Gagal memuat pengumuman: " + error.message, "error");
        } else {
            const items = ((data || []) as Partial<AnnouncementItem>[]).map((item) => ({
                id: String(item.id || ""),
                title: String(item.title || ""),
                content: String(item.content || ""),
                target_audience: String(item.target_audience || ""),
                is_active: Boolean(item.is_active),
                created_at: String(item.created_at || ""),
                target_id: typeof item.target_id === "string" ? item.target_id : null,
            }));
            setAnnouncements(items);
        }
        setLoading(false);
    }, [search, showToast]);

    useEffect(() => {
        fetchAnnouncements();
    }, [fetchAnnouncements]);

    const handleDelete = async (id: string) => {
        if (!confirm("Apakah Anda yakin ingin menghapus pengumuman ini?")) return;

        try {
            const { error } = await supabase.from('announcements').delete().eq('id', id);
            if (error) throw error;
            showToast("Pengumuman berhasil dihapus", "success");
            fetchAnnouncements();
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Unknown error';
            showToast("Gagal menghapus: " + message, "error");
        }
    };

    const handleEdit = (announcement: AnnouncementItem) => {
        setEditingAnnouncement(announcement);
        setIsModalOpen(true);
    };

    const handleAdd = () => {
        setEditingAnnouncement(null);
        setIsModalOpen(true);
    };

    const handleSave = () => {
        setIsModalOpen(false);
        fetchAnnouncements();
    };

    const getAudienceIcon = (audience: string) => {
        switch (audience) {
            case 'nasional':
                return <Globe className="w-4 h-4 text-action" />;
            case 'keuskupan':
                return <MapPin className="w-4 h-4 text-brand-primary" />;
            case 'paroki':
                return <MapPin className="w-4 h-4 text-green-500" />;
            default:
                return <Bell className="w-4 h-4 text-slate-500" />;
        }
    };

    const getAudienceLabel = (audience: string) => {
        switch (audience) {
            case 'nasional': return 'Nasional';
            case 'keuskupan': return 'Keuskupan';
            case 'paroki': return 'Paroki';
            default: return audience;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="relative w-64">
                    <input
                        type="text"
                        placeholder="Cari pengumuman..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-action"
                    />
                </div>
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-2 px-4 py-2 bg-action hover:opacity-90 text-white rounded-lg transition-colors font-medium shadow-lg shadow-action/20"
                >
                    <Plus className="w-4 h-4" />
                    Buat Pengumuman
                </button>
            </div>

            {loading ? (
                <div className="text-center py-10">
                    <div className="animate-spin w-8 h-8 border-2 border-action border-t-transparent rounded-full mx-auto mb-2"></div>
                    <p className="text-slate-500">Memuat pengumuman...</p>
                </div>
            ) : announcements.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                    <div className="w-12 h-12 bg-action/10 dark:bg-blue-900/10 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Megaphone className="w-6 h-6 text-action" />
                    </div>
                    <p className="text-slate-500 font-medium">Belum ada pengumuman</p>
                    <p className="text-slate-400 text-sm mt-1">Buat pengumuman baru untuk umat.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {announcements.map((item) => (
                        <div key={item.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:shadow-md transition-all group relative">
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-4">
                                    <div className={`p-3 rounded-full shrink-0 ${item.target_audience === 'nasional' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-action' :
                                        item.target_audience === 'keuskupan' ? 'bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20 dark:text-brand-primary' :
                                            'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                                        }`}>
                                        <Megaphone className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300">
                                                {getAudienceIcon(item.target_audience)}
                                                {getAudienceLabel(item.target_audience)}
                                            </span>
                                            {item.is_active ? (
                                                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium dark:bg-green-900/30 dark:text-green-400">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                                                    Aktif
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-medium dark:bg-slate-800 dark:text-slate-400">
                                                    Non-aktif
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-1.5">{item.title}</h3>
                                        <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">{item.content}</p>
                                        <div className="mt-3 text-xs text-slate-400">
                                            Dibuat pada {new Date(item.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleEdit(item)}
                                        className="p-2 bg-slate-50 hover:bg-action/10 text-slate-500 hover:text-action rounded-lg transition-colors border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(item.id)}
                                        className="p-2 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-lg transition-colors border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <AnnouncementForm
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                announcement={editingAnnouncement ?? undefined}
                onSuccess={handleSave}
            />
        </div>
    );
}
