"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { Edit2, Trash2, Plus, Image as ImageIcon } from "lucide-react";
import ArticleForm from "@/components/cms/tabs/ArticleForm";

type ArticleItem = {
    id: string;
    title: string;
    content: string;
    created_at: string;
    image_url?: string | null;
    is_published: boolean;
};

export default function ArticlesTab() {
    const { showToast } = useToast();
    const [articles, setArticles] = useState<ArticleItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingArticle, setEditingArticle] = useState<ArticleItem | null>(null);

    const fetchArticles = useCallback(async () => {
        setLoading(true);
        let query = supabase
            .from('articles')
            .select('*')
            .order('created_at', { ascending: false });

        if (search) {
            query = query.ilike('title', `%${search}%`);
        }

        const { data, error } = await query;
        if (error) {
            showToast("Gagal memuat artikel: " + error.message, "error");
        } else {
            setArticles((data || []) as ArticleItem[]);
        }
        setLoading(false);
    }, [search, showToast]);

    useEffect(() => {
        fetchArticles();
    }, [fetchArticles]);

    const handleDelete = async (id: string, imageUrl?: string | null) => {
        if (!confirm("Apakah Anda yakin ingin menghapus artikel ini?")) return;

        try {
            // Delete image if exists
            if (imageUrl) {
                const path = imageUrl.split('/').pop(); // Simple extraction, adjust if needed
                if (path) {
                    await supabase.storage.from('article_images').remove([path]);
                }
            }

            const { error } = await supabase.from('articles').delete().eq('id', id);
            if (error) throw error;
            showToast("Artikel berhasil dihapus", "success");
            fetchArticles();
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Unknown error';
            showToast("Gagal menghapus: " + message, "error");
        }
    };

    const handleEdit = (article: ArticleItem) => {
        setEditingArticle(article);
        setIsModalOpen(true);
    };

    const handleAdd = () => {
        setEditingArticle(null);
        setIsModalOpen(true);
    };

    const handleSave = () => {
        setIsModalOpen(false);
        fetchArticles();
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="relative w-64">
                    <input
                        type="text"
                        placeholder="Cari artikel..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    />
                </div>
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-primary hover:opacity-90 text-white rounded-lg transition-colors font-medium shadow-lg shadow-brand-primary/20"
                >
                    <Plus className="w-4 h-4" />
                    Tambah Artikel
                </button>
            </div>

            {loading ? (
                <div className="text-center py-10">
                    <div className="animate-spin w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                    <p className="text-slate-500">Memuat artikel...</p>
                </div>
            ) : articles.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                    <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Newspaper className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-slate-500 font-medium">Belum ada artikel</p>
                    <p className="text-slate-400 text-sm mt-1">Buat artikel baru untuk ditampilkan di aplikasi.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {articles.map((article) => (
                        <div key={article.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden hover:shadow-md transition-all group">
                            <div className="h-48 bg-slate-100 dark:bg-slate-900 relative overflow-hidden">
                                {article.image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={article.image_url} alt={article.title} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-slate-400">
                                        <ImageIcon className="w-8 h-8 opacity-50" />
                                    </div>
                                )}
                                <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleEdit(article)}
                                        className="p-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded-lg hover:text-brand-primary shadow-sm"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(article.id, article.image_url)}
                                        className="p-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded-lg hover:text-red-600 shadow-sm"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="p-4">
                                <h3 className="font-bold text-lg mb-2 line-clamp-2">{article.title}</h3>
                                <p className="text-slate-500 dark:text-slate-400 text-sm line-clamp-3 mb-4">{article.content}</p>
                                <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100 dark:border-slate-700">
                                    <span className="text-xs text-slate-400">
                                        {new Date(article.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                    <span className={`text-xs px-2 py-1 rounded-full ${article.is_published ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-600'}`}>
                                        {article.is_published ? 'Published' : 'Draft'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <ArticleForm
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                article={editingArticle ?? undefined}
                onSuccess={handleSave}
            />
        </div>
    );
}

function Newspaper(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
            <path d="M18 14h-8" />
            <path d="M15 18h-5" />
            <path d="M10 6h8v4h-8V6Z" />
        </svg>
    )
}
