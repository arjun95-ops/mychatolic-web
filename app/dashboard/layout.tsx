'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
    LayoutDashboard,
    BarChart3,
    UserCheck,
    Database,
    LogOut,
    Menu,
    X
} from 'lucide-react';

import DashboardGuard from '@/components/DashboardGuard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        const startSession = async () => {
            // Avoid starting session if already started in this browser session
            // But requirement says: "Di DashboardLayout (client component) saat mount: panggil /api/admin/sessions/start"
            // Re-starting session on refresh/reload is fine depending on requirement. 
            // "simpan session_id di sessionStorage". 
            // If sessionStorage has ID, maybe we can skip or create new one? 
            // Usually session corresponds to a "visit". Let's simply create new one or check existing?
            // "Saat mount: panggil ... simpan session_id". This implies a new session per load/refresh?
            // Or only if not exists?
            // Let's check if we have one. If we have one, we can reuse or just ignore.
            // But if user refreshed, the server might consider it same session if cookie persists.
            // However, "admin_sessions" table likely tracks "browser tab/window interactions".
            // Let's just follow instructions: Call start on mount. 
            // Wait, if every refresh creates a new session, that's a lot of rows.
            // But sessionStorage persists across reload.
            // Let's check `sessionStorage.getItem('admin_session_id')`.
            // If it exists, we might want to keep it? Or requirement implies "start session when dashboard accessed".
            // If I close tab and reopen, sessionStorage is gone -> new session. Correct.
            // If I reload, sessionStorage stays -> effectively same session.
            // So: if (!sessionStorage.getItem('admin_session_id')) { startSession() }

            const existingId = sessionStorage.getItem('admin_session_id');
            if (existingId) return; // Already tracking this tab session

            try {
                const res = await fetch('/api/admin/sessions/start', { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    if (data.session_id) {
                        sessionStorage.setItem('admin_session_id', data.session_id);
                    }
                }
            } catch (err) {
                console.error('Failed to start session:', err);
            }
        };

        startSession();
    }, []);

    const handleLogout = async () => {
        try {
            const sessionId = sessionStorage.getItem('admin_session_id');
            if (sessionId) {
                await fetch('/api/admin/sessions/end', {
                    method: 'POST',
                    body: JSON.stringify({ session_id: sessionId }),
                });
                sessionStorage.removeItem('admin_session_id');
            }

            await supabase.auth.signOut();
            router.push('/login');
            router.refresh();
        } catch (error) {
            console.error('Error logging out:', error);
            // Force redirect event if error
            router.push('/login');
        }
    };
    // Removed manual session check, using DashboardGuard now
    // const [loading, setLoading] = useState(true); 
    // ... useEffect ...

    // if (loading) return ...

    return (
        <DashboardGuard>
            <div className="min-h-screen bg-surface-secondary dark:bg-surface-primary flex">
                {/* MOBILE HEADER */}
                <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-brand-primary z-50 flex items-center justify-between px-4 shadow-md">
                    <div className="font-bold text-text-inverse text-lg flex items-center gap-2">
                        <Image src="/icon.svg" alt="Logo" width={32} height={32} />
                        MyCatholic
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
                            <Image src="/icon.svg" alt="Logo" width={32} height={32} />
                            MyCatholic
                        </h1>
                    </div>

                    <nav className="p-4 space-y-2 overflow-y-auto h-[calc(100vh-8rem)]">
                        <div className="text-xs font-bold text-text-inverse/40 uppercase tracking-wider px-4 mb-2 mt-2">Main Menu</div>

                        <div className="grid gap-2">
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
                                href="/dashboard/analytics"
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${pathname.startsWith('/dashboard/analytics')
                                    ? 'bg-action text-text-inverse shadow-lg shadow-action/20 font-semibold'
                                    : 'text-text-inverse/70 hover:bg-surface-inverse/10 hover:text-text-inverse'
                                    }`}
                            >
                                <BarChart3 size={20} className={pathname.startsWith('/dashboard/analytics') ? 'text-text-inverse' : 'text-text-inverse/70 group-hover:text-text-inverse'} />
                                <span>Analytics Detail</span>
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
        </DashboardGuard>
    );
}
