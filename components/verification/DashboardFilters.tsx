/* eslint-disable @typescript-eslint/no-explicit-any */
import { Search, Filter, X, RotateCcw } from "lucide-react";
import { FilterState, UserProfile } from "./UserDashboard";
import { useMemo } from "react";

interface Props {
    filters: FilterState;
    setFilters: (val: any) => void;
    users: UserProfile[];
}

export default function DashboardFilters({ filters, setFilters, users }: Props) {

    // Generate Unique Options for Dropdowns
    const countries = useMemo(() => Array.from(new Set(users.map(u => u.country).filter(Boolean))), [users]);

    const dioceses = useMemo(() => {
        let data = users;
        // Filter sub-options only if parent is selected to prevent huge lists
        if (filters.country !== 'all') {
            data = data.filter(u => u.country === filters.country);
        }
        return Array.from(new Set(data.map(u => u.diocese).filter(Boolean)));
    }, [users, filters.country]);

    const parishes = useMemo(() => {
        let data = users;
        if (filters.diocese !== 'all') {
            data = data.filter(u => u.diocese === filters.diocese);
        }
        return Array.from(new Set(data.map(u => u.parish).filter(Boolean)));
    }, [users, filters.diocese]);

    const handleReset = () => {
        setFilters({
            search: "",
            role: "all",
            country: "all",
            diocese: "all",
            parish: "all",
            status: "all",
        });
    };

    const hasActiveFilters = Object.values(filters).some(val => val !== 'all' && val !== '');

    return (
        <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">

            {/* SEARCH INPUT */}
            <div className="relative w-full lg:w-96 group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 group-focus-within:text-blue-500 transition-colors" />
                <input
                    type="text"
                    placeholder="Cari user (nama, email)..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                    value={filters.search}
                    onChange={(e) => setFilters((p: any) => ({ ...p, search: e.target.value }))}
                />
            </div>

            {/* DROPDOWN GROUP */}
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                <div className="flex items-center gap-2 text-gray-500 text-sm font-medium mr-2 shrink-0">
                    <Filter className="w-4 h-4" />
                    <span className="hidden sm:inline">Filter:</span>
                </div>

                <SelectDropdown
                    value={filters.country}
                    onChange={(val) => setFilters((p: any) => ({ ...p, country: val, diocese: 'all', parish: 'all' }))}
                    options={countries}
                    placeholder="Negara"
                    maxWidth="w-32"
                />

                <SelectDropdown
                    value={filters.diocese}
                    onChange={(val) => setFilters((p: any) => ({ ...p, diocese: val, parish: 'all' }))}
                    options={dioceses}
                    placeholder="Keuskupan"
                    disabled={filters.country === 'all' && dioceses.length > 100}
                    maxWidth="w-40"
                />

                <SelectDropdown
                    value={filters.parish}
                    onChange={(val) => setFilters((p: any) => ({ ...p, parish: val }))}
                    options={parishes}
                    placeholder="Paroki"
                    disabled={filters.diocese === 'all'}
                    maxWidth="w-40"
                />

                {/* RESET BUTTON */}
                {hasActiveFilters && (
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors ml-auto lg:ml-0"
                        title="Reset Filter"
                    >
                        <RotateCcw size={14} />
                        Reset
                    </button>
                )}
            </div>
        </div>
    );
}

// Sub-component for Cleaner Dropdown styling
function SelectDropdown({ value, onChange, options, placeholder, disabled, maxWidth }: any) {
    return (
        <select
            className={`
                bg-white border border-gray-300 text-gray-700 text-sm rounded-lg 
                focus:ring-blue-500 focus:border-blue-500 block p-2.5 
                ${maxWidth} truncate
                disabled:bg-gray-100 disabled:text-gray-400 cursor-pointer disabled:cursor-not-allowed
            `}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
        >
            <option value="all">Semua {placeholder}</option>
            {options.map((opt: string) => (
                <option key={opt} value={opt}>{opt}</option>
            ))}
        </select>
    );
}
