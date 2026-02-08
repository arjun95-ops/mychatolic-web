"use client";

import { useState } from "react";
import ArticlesTab from "@/components/cms/tabs/ArticlesTab";
import AnnouncementsTab from "@/components/cms/tabs/AnnouncementsTab";
import { Newspaper, Bell } from "lucide-react";

export default function CMSManager() {
    const [activeTab, setActiveTab] = useState<'articles' | 'announcements'>('articles');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-primary to-action dark:from-brand-primary dark:to-action tracking-tight">Content Management</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Kelola artikel berita dan pengumuman aplikasi.</p>
            </div>

            {/* Tabs */}
            <div className="flex p-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 w-fit">
                <button
                    onClick={() => setActiveTab('articles')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'articles'
                        ? 'bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20 dark:text-brand-primary shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                >
                    <Newspaper className="w-4 h-4" />
                    Artikel / Berita
                </button>
                <button
                    onClick={() => setActiveTab('announcements')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'announcements'
                        ? 'bg-action/10 text-action dark:bg-action/20 dark:text-action shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                >
                    <Bell className="w-4 h-4" />
                    Pengumuman
                </button>
            </div>

            {/* Content Area */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                {activeTab === 'articles' ? <ArticlesTab /> : <AnnouncementsTab />}
            </div>
        </div>
    );
}
