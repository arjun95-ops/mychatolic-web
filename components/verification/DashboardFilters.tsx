'use client';

import { Search, X } from 'lucide-react';
import { Dispatch, SetStateAction, useMemo } from 'react';

type FilterableUser = {
    country?: string | null;
    diocese?: string | null;
    parish?: string | null;
};

type BaseFilters = {
    search?: string;
    role?: string;
    country: string;
    diocese: string;
    parish: string;
    status: string;
};

interface Props<T extends BaseFilters> {
    users: FilterableUser[];
    search?: string;
    setSearch?: (v: string) => void;
    filters: T;
    setFilters: Dispatch<SetStateAction<T>>;
}

export default function DashboardFilters<T extends BaseFilters>({
    users,
    search,
    setSearch,
    filters,
    setFilters,
}: Props<T>) {
    const nonEmptyString = (value: string | null | undefined): value is string => Boolean(value);

    const resolvedSearch = search ?? filters.search ?? '';
    const updateSearch = (value: string) => {
        if (setSearch) {
            setSearch(value);
            return;
        }
        setFilters((prev) => ({ ...prev, search: value } as T));
    };

    // Hitung Opsi Dropdown secara Dinamis (Cascading)
    const options = useMemo(() => {
        const countries = Array.from(new Set(users.map((u) => u.country).filter(nonEmptyString))).sort();

        const dioceses = Array.from(new Set(
            users
                .filter(u => !filters.country || u.country === filters.country)
                .map(u => u.diocese)
                .filter(nonEmptyString)
        )).sort();

        const parishes = Array.from(new Set(
            users
                .filter(u => (!filters.country || u.country === filters.country) && (!filters.diocese || u.diocese === filters.diocese))
                .map(u => u.parish)
                .filter(nonEmptyString)
        )).sort();

        return { countries, dioceses, parishes };
    }, [users, filters.country, filters.diocese]);

    const handleChange = (key: keyof Pick<BaseFilters, 'country' | 'diocese' | 'parish' | 'status'>, value: string) => {
        setFilters((prev) => {
            const updates: Partial<BaseFilters> = { [key]: value };
            if (key === 'country') { updates.diocese = ''; updates.parish = ''; }
            if (key === 'diocese') { updates.parish = ''; }
            return { ...prev, ...updates } as T;
        });
    };

    const clearFilters = () => {
        if (setSearch) {
            setSearch('');
            setFilters({ country: '', diocese: '', parish: '', status: 'all' } as T);
            return;
        }
        setFilters((prev) => ({
            ...prev,
            search: '',
            role: 'all',
            country: '',
            diocese: '',
            parish: '',
            status: 'all',
        } as T));
    };

    return (
        <div className="flex flex-col xl:flex-row gap-4 justify-between">
            {/* SEARCH BAR (Kiri) */}
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                    type="text"
                    placeholder="Cari nama, email, atau gereja..."
                    value={resolvedSearch}
                    onChange={(e) => updateSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition"
                />
            </div>

            {/* DROPDOWN FILTERS (Kanan) */}
            <div className="flex flex-wrap gap-2 items-center">
                <select
                    value={filters.country}
                    onChange={(e) => handleChange('country', e.target.value)}
                    className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm min-w-[140px] focus:ring-2 focus:ring-brand-primary outline-none"
                >
                    <option value="">Semua Negara</option>
                    {options.countries.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>

                <select
                    value={filters.diocese}
                    onChange={(e) => handleChange('diocese', e.target.value)}
                    disabled={!filters.country && options.dioceses.length > 50}
                    className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm min-w-[160px] focus:ring-2 focus:ring-brand-primary outline-none disabled:bg-gray-50 disabled:text-gray-400"
                >
                    <option value="">Semua Keuskupan</option>
                    {options.dioceses.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>

                <select
                    value={filters.parish}
                    onChange={(e) => handleChange('parish', e.target.value)}
                    className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm min-w-[160px] focus:ring-2 focus:ring-brand-primary outline-none"
                >
                    <option value="">Semua Paroki</option>
                    {options.parishes.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>

                <div className="h-6 w-[1px] bg-gray-300 mx-1 hidden sm:block"></div>
                <select
                    value={filters.status}
                    onChange={(e) => handleChange('status', e.target.value)}
                    className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:ring-2 focus:ring-brand-primary outline-none"
                >
                    <option value="all">Semua Status</option>
                    <option value="pending">⏳ Pending</option>
                    <option value="verified">✅ Terverifikasi</option>
                    <option value="rejected">❌ Ditolak</option>
                </select>

                {(resolvedSearch || filters.country || filters.diocese || filters.parish || filters.status !== 'all') && (
                    <button onClick={clearFilters} className="p-2.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition" title="Reset Filter">
                        <X size={18} />
                    </button>
                )}
            </div>
        </div>
    );
}
