'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
    LayoutDashboard,
    UserCheck,
    Book,
    Calendar,
    Newspaper,
    Database,
    ChevronDown,
    ChevronRight,
    LogOut
} from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
        'alkitab': false,
        'content': false,
        'system': false
    });

    const toggleMenu = (key: string) => {
        setOpenMenus(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const isActive = (path: string) => pathname === path;
    const isSubActive = (path: string) => pathname.startsWith(path);

    const NavItem = ({ href, icon: Icon, label, exact = false }: any) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
            <Link
                href={href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${active
                        ? 'bg-action text-white shadow-lg shadow-blue-900/20 font-semibold'
                        : 'text-blue-100 hover:bg-white/10 hover:text-white'
                    }`}
            >
                <Icon size={20} className={active ? 'text-white' : 'text-blue-200 group-hover:text-white'} />
                <span>{label}</span>
            </Link>
        );
    };

    const SubMenu = ({ icon: Icon, label, menuKey, items }: any) => {
        const isOpen = openMenus[menuKey];
        const activeChild = items.some((i: any) => isSubActive(i.href));

        return (
            <div>
                <button
                    onClick={() => toggleMenu(menuKey)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 text-left ${activeChild || isOpen ? 'bg-white/5 text-white' : 'text-blue-100 hover:bg-white/10 hover:text-white'
                        }`}
                >
                    <div className="flex items-center gap-3">
                        <Icon size={20} className="text-blue-200" />
                        <span className="font-medium">{label}</span>
                    </div>
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>

                {isOpen && (
                    <div className="mt-1 ml-4 pl-4 border-l border-white/10 space-y-1">
                        {items.map((item: any) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`block px-4 py-2 text-sm rounded-lg transition-colors ${isActive(item.href)
                                        ? 'text-white bg-white/10 font-medium'
                                        : 'text-blue-200 hover:text-white hover:bg-white/5'
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

    return (
        <div className="min-h-screen bg-surface-gray flex">
            {/* SIDEBAR */}
            <aside className="w-72 bg-brand text-white fixed h-full z-30 hidden lg:flex flex-col border-r border-blue-900/30 shadow-2xl">
                <div className="p-6 border-b border-white/10">
                    <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-brand">
                            🔥
                        </div>
                        MyCatholic
                    </h1>
                    <p className="text-xs text-blue-200 mt-2 px-1">Admin Dashboard Panel</p>
                </div>

                <nav className="flex-1 overflow-y-auto p-4 space-y-2">
                    {/* Main Menu */}
                    <div className="text-xs font-bold text-blue-300 uppercase tracking-wider px-4 mb-2 mt-2">Main Menu</div>

                    <NavItem href="/dashboard" icon={LayoutDashboard} label="Dashboard" exact />
                    <NavItem href="/dashboard/verification" icon={UserCheck} label="Verifikasi User" />
                    <NavItem href="/dashboard/liturgy" icon={Calendar} label="Kalender Liturgi" />

                    {/* Data Master */}
                    <div className="text-xs font-bold text-blue-300 uppercase tracking-wider px-4 mb-2 mt-6">Data Management</div>

                    <SubMenu
                        menuKey="alkitab"
                        icon={Book}
                        label="Data Alkitab"
                        items={[
                            { label: 'Kitab & Pasal', href: '/dashboard/bible' },
                            { label: 'Input Manual', href: '/dashboard/bible/create' },
                            { label: 'Import Excel', href: '/dashboard/bible/import' },
                        ]}
                    />

                    <SubMenu
                        menuKey="content"
                        icon={Newspaper}
                        label="Pengaturan Konten"
                        items={[
                            { label: 'Homepage Settings', href: '/dashboard/content/home' },
                            { label: 'CMS Artikel', href: '/dashboard/content/articles' },
                        ]}
                    />

                    <SubMenu
                        menuKey="system"
                        icon={Database}
                        label="Sistem & Log"
                        items={[
                            { label: 'Users & Roles', href: '/dashboard/system/users' },
                            { label: 'Audit Logs', href: '/dashboard/system/logs' },
                        ]}
                    />
                </nav>

                <div className="p-4 border-t border-white/10">
                    <button className="w-full flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600 text-red-100 hover:text-white py-3 rounded-xl transition-all">
                        <LogOut size={18} />
                        <span>Logout Admin</span>
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 lg:ml-72 min-h-screen">
                {/* Mobile Header (Visible only on small screens) */}
                <div className="lg:hidden bg-brand p-4 text-white flex justify-between items-center sticky top-0 z-40">
                    <span className="font-bold">MyCatholic Admin</span>
                    {/* Add Mobile Menu Toggle logic here if needed */}
                </div>

                <div className="p-0">
                    {children}
                </div>
            </main>
        </div>
    );
}
