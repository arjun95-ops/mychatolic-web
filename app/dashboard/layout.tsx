'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import {
    LayoutDashboard,
    UserCheck,
    Book,
    Calendar,
    Settings,
    Database,
    ChevronDown,
    ChevronRight,
    LogOut,
    Menu,
    X
} from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
        'alkitab': false,
        'settings': false,
        'system': false
    });
    const pathname = usePathname();
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    // Supabase Client
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Session Check
    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push('/'); // Redirect to home/login if no session
            } else {
                setLoading(false);
            }
        };
        checkSession();
    }, [router, supabase]);

    const toggleGroup = (key: string) => {
        setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));
    };

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
                        ? 'bg-action text-white shadow-lg shadow-blue-900/20 font-semibold'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
            >
                <Icon size={20} className={isActive ? 'text-white' : 'text-white/70 group-hover:text-white'} />
                <span>{label}</span>
            </Link>
        );
    };

    const NavGroup = ({ label, icon: Icon, groupKey, items }: any) => {
        const isOpen = openGroups[groupKey];
        const isChildActive = items.some((i: any) => pathname.startsWith(i.href));

        return (
            <div className="space-y-1">
                <button
                    onClick={() => toggleGroup(groupKey)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors duration-200 text-left ${isOpen || isChildActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                >
                    <div className="flex items-center gap-3">
                        <Icon size={20} className={isOpen || isChildActive ? 'text-white' : 'text-white/70'} />
                        <span className="font-medium">{label}</span>
                    </div>
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>

                {isOpen && (
                    <div className="ml-4 pl-4 border-l border-white/10 space-y-1 mt-1">
                        {items.map((item: any) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`block px-4 py-2 text-sm rounded-lg transition-colors ${pathname === item.href
                                        ? 'text-white bg-white/10 font-medium'
                                        : 'text-white/60 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-surface-secondary text-brand-primary">Loading secure workspace...</div>;
    }

    return (
        <div className="min-h-screen bg-surface-secondary flex">
            {/* MOBILE HEADER */}
            <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-brand-primary z-50 flex items-center justify-between px-4 shadow-md">
                <div className="font-bold text-white text-lg flex items-center gap-2">
                    🔥 MyCatholic
                </div>
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-white p-2">
                    {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </div>

            {/* SIDEBAR */}
            <aside
                className={`
          fixed top-0 bottom-0 left-0 z-40 w-64 bg-brand-primary text-white shadow-2xl transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:block
        `}
            >
                <div className="h-16 flex items-center px-6 border-b border-white/10">
                    <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                        🔥 MyCatholic
                    </h1>
                </div>

                <nav className="p-4 space-y-2 overflow-y-auto h-[calc(100vh-8rem)]">
                    <div className="text-xs font-bold text-white/40 uppercase tracking-wider px-4 mb-2 mt-2">Main Menu</div>

                    <NavItem href="/dashboard" icon={LayoutDashboard} label="Dashboard" exact />
                    <NavItem href="/dashboard/verification" icon={UserCheck} label="Verifikasi User" />
                    <NavItem href="/dashboard/liturgy" icon={Calendar} label="Kalender Liturgi" />

                    <div className="text-xs font-bold text-white/40 uppercase tracking-wider px-4 mb-2 mt-6">Data & Content</div>

                    <NavGroup
                        label="Data Alkitab"
                        icon={Book}
                        groupKey="alkitab"
                        items={[
                            { label: 'Kitab & Pasal', href: '/dashboard/bible' },
                            { label: 'Input Manual', href: '/dashboard/bible/create' },
                            { label: 'Import Excel', href: '/dashboard/bible/import' },
                        ]}
                    />

                    <NavGroup
                        label="Pengaturan App"
                        icon={Settings}
                        groupKey="settings"
                        items={[
                            { label: 'Homepage Settings', href: '/dashboard/content/home' },
                            { label: 'CMS Artikel', href: '/dashboard/content/articles' },
                        ]}
                    />

                    <NavGroup
                        label="System"
                        icon={Database}
                        groupKey="system"
                        items={[
                            { label: 'Users & Roles', href: '/dashboard/system/users' },
                            { label: 'Audit Logs', href: '/dashboard/system/logs' },
                        ]}
                    />
                </nav>

                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10 bg-brand-primary">
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
