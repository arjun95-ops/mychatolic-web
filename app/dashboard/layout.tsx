'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
    LayoutDashboard,
    UserCheck,
    Database,
    LogOut,
    Menu,
    X
} from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    // Session Check
    useEffect(() => {
        const checkSession = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error) throw error;

                if (!session) {
                    console.log("No session found, redirecting to login...");
                    router.push('/');
                } else {
                    setLoading(false);
                }
            } catch (error) {
                console.error("Session check failed:", error);
                // In case of error, you might want to redirect or let them reload
                // For now, let's stop loading so they see *something* (or a blank screen is better than infinite load?)
                // authenticating failed usually means we should redirect.
                router.push('/');
            }
        };
        checkSession();
    }, [router]);

    const handleLogout = async () => {
        try {
            await supabase.auth.signOut();
            router.push('/'); // Redirect to login page
            router.refresh(); // Refresh to clear state
        } catch (error) {
            console.error('Error logging out:', error);
        }
    };

    // Helper Components
    const NavItem = ({ href, icon: Icon, label, exact = false }: any) => {
        const isActive = exact ? pathname === href : pathname.startsWith(href);
        return (
            <Link
                href={href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive
                    ? 'bg-action text-text-inverse shadow-lg shadow-action/20 font-semibold'
                    : 'text-text-inverse/70 hover:bg-surface-inverse/10 hover:text-text-inverse'
                    }`}
            >
                <Icon size={20} className={isActive ? 'text-text-inverse' : 'text-text-inverse/70 group-hover:text-text-inverse'} />
                <span>{label}</span>
            </Link>
        );
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-surface-secondary dark:bg-surface-primary text-brand-primary">Loading secure workspace...</div>;
    }

    return (
        <div className="min-h-screen bg-surface-secondary dark:bg-surface-primary flex">
            {/* MOBILE HEADER */}
            <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-brand-primary z-50 flex items-center justify-between px-4 shadow-md">
                <div className="font-bold text-text-inverse text-lg flex items-center gap-2">
                    🔥 MyCatholic
                </div>
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-text-inverse p-2">
                    {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </div>

            {/* SIDEBAR */}
            <aside
                className={`
          fixed top-0 bottom-0 left-0 z-40 w-64 bg-brand-primary text-text-inverse shadow-2xl transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:block
        `}
            >
                <div className="h-16 flex items-center px-6 border-b border-text-inverse/10">
                    <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 text-text-inverse">
                        🔥 MyCatholic
                    </h1>
                </div>

                <nav className="p-4 space-y-2 overflow-y-auto h-[calc(100vh-8rem)]">
                    <div className="text-xs font-bold text-text-inverse/40 uppercase tracking-wider px-4 mb-2 mt-2">Main Menu</div>

                    <div onClick={() => NavItem} className="grid gap-2">
                        <Link
                            href="/dashboard"
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${pathname === '/dashboard'
                                ? 'bg-action text-text-inverse shadow-lg shadow-action/20 font-semibold'
                                : 'text-text-inverse/70 hover:bg-surface-inverse/10 hover:text-text-inverse'
                                }`}
                        >
                            <LayoutDashboard size={20} className={pathname === '/dashboard' ? 'text-text-inverse' : 'text-text-inverse/70 group-hover:text-text-inverse'} />
                            <span>Dashboard</span>
                        </Link>

                        <Link
                            href="/dashboard/verification"
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${pathname.startsWith('/dashboard/verification')
                                ? 'bg-action text-text-inverse shadow-lg shadow-action/20 font-semibold'
                                : 'text-text-inverse/70 hover:bg-surface-inverse/10 hover:text-text-inverse'
                                }`}
                        >
                            <UserCheck size={20} className={pathname.startsWith('/dashboard/verification') ? 'text-text-inverse' : 'text-text-inverse/70 group-hover:text-text-inverse'} />
                            <span>Verifikasi User</span>
                        </Link>

                        <Link
                            href="/dashboard/master-data"
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${pathname.startsWith('/dashboard/master-data')
                                ? 'bg-action text-text-inverse shadow-lg shadow-action/20 font-semibold'
                                : 'text-text-inverse/70 hover:bg-surface-inverse/10 hover:text-text-inverse'
                                }`}
                        >
                            <Database size={20} className={pathname.startsWith('/dashboard/master-data') ? 'text-text-inverse' : 'text-text-inverse/70 group-hover:text-text-inverse'} />
                            <span>Master Data Gereja</span>
                        </Link>
                    </div>
                </nav>

                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-text-inverse/10 bg-brand-primary">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-200 hover:bg-red-500/20 hover:text-red-100 transition-colors"
                    >
                        <LogOut size={20} />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            {/* OVERLAY FOR MOBILE */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* MAIN CONTENT */}
            <main className="flex-1 lg:ml-64 min-h-screen pt-16 lg:pt-0 transition-all">
                <div className="p-6 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
