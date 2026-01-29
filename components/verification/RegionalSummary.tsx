/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from "react";
import { UserProfile } from "./UserDashboard";
import { ChevronRight, Search } from "lucide-react";

interface Props {
    type: "country" | "diocese" | "parish";
    data: UserProfile[];
    onDrillDown: (value: string) => void;
}

export default function RegionalSummary({ type, data, onDrillDown }: Props) {
    const [searchTerm, setSearchTerm] = useState("");

    // Group Data Logic
    const summary = useMemo(() => {
        const groups: Record<string, { total: number; verified: number; rejected: number }> = {};

        data.forEach(user => {
            const key = (user as any)[type] || "Belum Diisi";
            if (!groups[key]) {
                groups[key] = { total: 0, verified: 0, rejected: 0 };
            }

            groups[key].total++;

            const status = user.verification_status || user.account_status;
            if (['verified_catholic', 'verified_pastoral', 'approved', 'verified'].includes(status)) groups[key].verified++;
            if (status === 'rejected') groups[key].rejected++;
        });

        // Convert to Array & Filter by Local Search
        return Object.entries(groups)
            .map(([name, stats]) => ({ name, ...stats }))
            .filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => b.total - a.total);

    }, [data, type, searchTerm]);

    const titleMap = {
        country: "Negara",
        diocese: "Keuskupan",
        parish: "Paroki"
    };

    return (
        <div className="flex flex-col">
            {/* LOCAL SEARCH BAR */}
            <div className="p-4 border-b border-gray-100 bg-white sticky top-0 z-10">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder={`Cari nama ${titleMap[type]}...`}
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* TABLE */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                            <th className="px-6 py-4">{titleMap[type]}</th>
                            <th className="px-6 py-4 text-center">Total User</th>
                            <th className="px-6 py-4 text-center text-emerald-600">Verified</th>
                            <th className="px-6 py-4 text-center text-red-600">Rejected</th>
                            <th className="px-6 py-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                        {summary.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-10 text-center text-gray-400 italic">
                                    {searchTerm ? `Tidak ditemukan wilayah dengan nama "${searchTerm}"` : "Belum ada data."}
                                </td>
                            </tr>
                        ) : (
                            summary.map((row, idx) => (
                                <tr
                                    key={idx}
                                    className="hover:bg-blue-50/50 cursor-pointer group transition-colors"
                                    onClick={() => onDrillDown(row.name)}
                                >
                                    <td className="px-6 py-4 font-medium text-gray-900 group-hover:text-blue-700">
                                        {row.name}
                                    </td>
                                    <td className="px-6 py-4 text-center font-bold text-gray-700">
                                        {row.total}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md">
                                            {row.verified}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {row.rejected > 0 ? (
                                            <span className="text-red-700 font-semibold bg-red-50 px-2 py-0.5 rounded-md">
                                                {row.rejected}
                                            </span>
                                        ) : (
                                            <span className="text-gray-300">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-gray-400 group-hover:text-blue-600 transition-transform group-hover:translate-x-1">
                                            <ChevronRight size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
