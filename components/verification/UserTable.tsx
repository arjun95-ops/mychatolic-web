import { Search, MoveRight, CheckCircle2, XCircle, Clock } from "lucide-react";

interface UserTableProps {
    users: any[];
    loading: boolean;
    search: string;
    setSearch: (val: string) => void;
    roleFilter: string;
    setRoleFilter: (val: string) => void;
    onViewDetail: (user: any) => void;
}

export default function UserTable({
    users, loading, search, setSearch, roleFilter, setRoleFilter, onViewDetail
}: UserTableProps) {
    const roles = ['umat', 'pastor', 'suster', 'bruder', 'pengajar'];

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'approved':
            case 'verified':
                return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800"><CheckCircle2 className="w-3.5 h-3.5" /> Terverifikasi</span>;
            case 'rejected':
                return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-800"><XCircle className="w-3.5 h-3.5" /> Ditolak</span>;
            case 'pending':
            default:
                return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-800"><Clock className="w-3.5 h-3.5" /> Menunggu</span>;
        }
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden transition-colors duration-300">
            {/* Toolbar */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row justify-between items-center gap-6">
                {/* Role Tabs */}
                <div className="flex bg-slate-50 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-100 dark:border-slate-700">
                    {roles.map(role => (
                        <button
                            key={role}
                            onClick={() => setRoleFilter(role)}
                            className={`px-5 py-2 text-sm font-semibold rounded-lg capitalize transition-all duration-200 ${roleFilter === role
                                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                                }`}
                        >
                            {role}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="relative w-full lg:w-72">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                        <Search className="w-4 h-4" />
                    </span>
                    <input
                        type="text"
                        placeholder="Cari Nama / Email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:bg-white dark:focus:bg-slate-900 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 text-slate-800 dark:text-white"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-xs">
                        <tr>
                            <th className="p-5">Nama Lengkap</th>
                            <th className="p-5">Email</th>
                            <th className="p-5">Role</th>
                            <th className="p-5">Tanggal Daftar</th>
                            <th className="p-5">Status</th>
                            <th className="p-5 text-center">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td className="p-5"><div className="h-4 bg-slate-100 dark:bg-slate-800 w-32 rounded"></div></td>
                                    <td className="p-5"><div className="h-4 bg-slate-100 dark:bg-slate-800 w-48 rounded"></div></td>
                                    <td className="p-5"><div className="h-4 bg-slate-100 dark:bg-slate-800 w-20 rounded"></div></td>
                                    <td className="p-5"><div className="h-4 bg-slate-100 dark:bg-slate-800 w-24 rounded"></div></td>
                                    <td className="p-5"><div className="h-6 bg-slate-100 dark:bg-slate-800 w-24 rounded-full"></div></td>
                                    <td className="p-5"><div className="h-8 bg-slate-100 dark:bg-slate-800 w-full rounded"></div></td>
                                </tr>
                            ))
                        ) : users.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-10 text-center text-slate-400 dark:text-slate-600">
                                    Tidak ada data user ditemukan.
                                </td>
                            </tr>
                        ) : (
                            users.map((user) => (
                                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group">
                                    <td className="p-5 font-semibold text-slate-900 dark:text-white">{user.full_name}</td>
                                    <td className="p-5 font-mono text-xs text-slate-500 dark:text-slate-400">{user.email}</td>
                                    <td className="p-5 capitalize">
                                        <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-1 rounded text-xs font-semibold">{user.role}</span>
                                    </td>
                                    <td className="p-5 text-slate-500 dark:text-slate-500">
                                        {new Date(user.created_at).toLocaleDateString("id-ID", {
                                            day: 'numeric', month: 'short', year: 'numeric'
                                        })}
                                    </td>
                                    <td className="p-5">
                                        {getStatusBadge(user.verification_status)}
                                    </td>
                                    <td className="p-5 flex justify-center">
                                        <button
                                            onClick={() => onViewDetail(user)}
                                            className="text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 text-xs font-semibold px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-purple-200 dark:hover:border-purple-500/30 flex items-center gap-2 transition-all shadow-sm dark:shadow-none"
                                        >
                                            Detail <MoveRight className="w-3.5 h-3.5" />
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
