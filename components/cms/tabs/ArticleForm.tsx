"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { X, Upload, Image as ImageIcon } from "lucide-react";

type ArticleItem = {
    id: string;
    title: string;
    content: string;
    image_url?: string | null;
    is_published: boolean;
};

interface ArticleFormProps {
    isOpen: boolean;
    onClose: () => void;
    article?: ArticleItem;
    onSuccess: () => void;
}

export default function ArticleForm({ isOpen, onClose, article, onSuccess }: ArticleFormProps) {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: "",
        content: "",
        is_published: true
    });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (article) {
            setFormData({
                title: article.title,
                content: article.content,
                is_published: article.is_published
            });
            setPreviewUrl(article.image_url || null);
        } else {
            setFormData({
                title: "",
                content: "",
                is_published: true
            });
            setPreviewUrl(null);
        }
        setImageFile(null);
    }, [article, isOpen]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            let imageUrl = article?.image_url;

            // Upload Image if new file selected
            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `${Date.now()}.${fileExt}`;
                const filePath = `${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('article_images')
                    .upload(filePath, imageFile);

                if (uploadError) {
                    // If bucket doesn't exist, try creating it or assume public access issue
                    // For now, failing strictly
                    throw new Error("Gagal upload gambar: " + uploadError.message);
                }

                const { data: { publicUrl } } = supabase.storage
                    .from('article_images')
                    .getPublicUrl(filePath);

                imageUrl = publicUrl;
            }

            const payload = {
                ...formData,
                image_url: imageUrl,
                updated_at: new Date()
            };

            let error;
            if (article) {
                // Update
                ({ error } = await supabase
                    .from('articles')
                    .update(payload)
                    .eq('id', article.id));
            } else {
                // Insert
                ({ error } = await supabase
                    .from('articles')
                    .insert([{ ...payload, author_id: (await supabase.auth.getUser()).data.user?.id }]));
            }

            if (error) throw error;

            showToast(`Artikel berhasil ${article ? 'diperbarui' : 'dibuat'}`, "success");
            onSuccess();
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Unknown error';
            showToast("Gagal menyimpan: " + message, "error");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl border border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-xl font-bold">{article ? 'Edit Artikel' : 'Tambah Artikel'}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Image Upload */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Cover Image</label>
                        <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-4 text-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer relative group">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            {previewUrl ? (
                                <div className="relative h-48 w-full rounded-lg overflow-hidden">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <p className="text-white font-medium flex items-center gap-2">
                                            <Upload className="w-4 h-4" /> Ganti Gambar
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="py-8">
                                    <div className="w-12 h-12 bg-brand-primary/10 dark:bg-brand-primary/20 text-brand-primary rounded-full flex items-center justify-center mx-auto mb-3">
                                        <ImageIcon className="w-6 h-6" />
                                    </div>
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Klik untuk upload gambar</p>
                                    <p className="text-xs text-slate-500 mt-1">PNG, JPG up to 5MB</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Title */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Judul Artikel</label>
                        <input
                            type="text"
                            required
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-brand-primary"
                            placeholder="Masukkan judul menarik..."
                        />
                    </div>

                    {/* Content */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Isi Konten</label>
                        <textarea
                            required
                            rows={8}
                            value={formData.content}
                            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-brand-primary font-sans leading-relaxed"
                            placeholder="Tulis artikel anda disini..."
                        ></textarea>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formData.is_published}
                                onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
                                className="w-4 h-4 text-brand-primary rounded focus:ring-brand-primary"
                            />
                            <span className="text-sm font-medium">Publish langsung?</span>
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
                                className="px-6 py-2 bg-gradient-to-r from-brand-primary to-action text-white font-medium rounded-lg hover:shadow-lg hover:shadow-brand-primary/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Menyimpan...
                                    </>
                                ) : (
                                    'Simpan Artikel'
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
