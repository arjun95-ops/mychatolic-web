"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeToggle } from "@/components/ui/ThemeToggle"; // Fixed named import
import { LayoutDashboard, Database, UserCheck, LogOut, Menu, MessageCircleHeart, Newspaper, Users, Book, Calendar, BookOpen } from "lucide-react"; // Using Lucide icons for consistency

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push("/");
            } else {
                setLoading(false);
            }
        };
        checkSession();
    }, [router]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push("/");
    };

    if (loading) {
        return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center"><div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div></div>;
    }

    const menuItems = [
        { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { name: 'Master Data', href: '/dashboard/master-data', icon: Database },
        { name: 'Alkitab', href: '/dashboard/bible', icon: Book },
        { name: 'Input Alkitab', href: '/dashboard/bible/manual', icon: BookOpen },
        { name: 'Kalender Liturgi', href: '/dashboard/liturgy', icon: Calendar },
        { name: 'Verifikasi', href: '/dashboard/verification', icon: UserCheck },
        { name: 'Consilium', href: '/dashboard/consilium', icon: MessageCircleHeart },
        { name: 'CMS', href: '/dashboard/cms', icon: Newspaper },
        { name: 'Mitra Pastoral', href: '/dashboard/mitra', icon: Users },
    ];

    return (
        <ToastProvider>
            <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300">
                {/* Sidebar - Fixed Left */}
                <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-col hidden md:flex fixed h-full z-50 shadow-sm transition-colors duration-300">
                    <div className="h-20 flex items-center px-6 border-b border-slate-100 dark:border-slate-800 gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-200 dark:shadow-purple-900/20">
                            <span className="font-bold text-white text-lg">M</span>
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-slate-800 dark:text-white leading-none">MyCatholic</h1>
                            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold tracking-wider uppercase">Admin Panel</span>
                        </div>
                    </div>

                    <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                        {menuItems.map((item) => {
                            const isActive = pathname === item.href;
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-200 group ${isActive
                                        ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800/30'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                                        }`}
                                >
                                    <span className={`${isActive ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-purple-600 dark:group-hover:text-purple-400'} transition-colors`}>
                                        <Icon className="w-5 h-5" />
                                    </span>
                                    <span className={isActive ? 'bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 font-bold' : ''}>
                                        {item.name}
                                    </span>
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 space-y-3">
                        <div className="flex items-center justify-between px-2">
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Theme</span>
                            <ThemeToggle />
                        </div>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                        >
                            <LogOut className="w-5 h-5" />
                            Keluar
                        </button>
                    </div>
                </aside>

                {/* Mobile Header */}
                <div className="md:hidden w-full fixed top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 h-16 flex items-center justify-between shadow-sm transition-colors duration-300">
                    <span className="text-slate-800 dark:text-white font-bold text-lg">MyCatholic</span>
                    <div className="flex items-center gap-2">
                        <ThemeToggle />
                        <button onClick={handleLogout} className="text-slate-500 dark:text-slate-400">
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Main Content */}
                <main className="flex-1 md:ml-64 p-4 md:p-8 min-h-screen pt-20 md:pt-8 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
                    {children}
                </main>
            </div>
        </ToastProvider>
    );
}
