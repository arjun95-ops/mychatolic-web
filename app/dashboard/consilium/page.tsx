"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/ui/Modal";
import {
    BarChart3,
    Clock,
    CheckCircle2,
    Activity,
    Search,
    Filter,
    UserPlus,
    Users,
    MessageSquare,
    MoreVertical,
    Eye
} from "lucide-react";

// --- Types ---

type Profile = {
    full_name: string;
    email?: string;
};

type Counselor = {
    id: string;
    full_name: string;
    role: string;
};

type ConsiliumRequest = {
    id: string;
    created_at: string;
    topic: string;
    description: string;
    preference_counselor: string;
    status: 'pending' | 'active' | 'completed';
    user_id: string;
    counselor_id?: string;
    user: Profile;
    counselor?: Profile;
};

type ConsiliumMessage = {
    id: string;
    created_at: string;
    content: string;
    sender_id: string;
    request_id: string;
    sender?: {
        full_name: string;
    };
};

// --- Main Component ---

export default function ConsiliumPage() {
    const { showToast } = useToast();

    // --- States ---

    // Data
    const [requests, setRequests] = useState<ConsiliumRequest[]>([]);
    const [messages, setMessages] = useState<ConsiliumMessage[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string>("");

    // Loading
    const [loading, setLoading] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);

    // Stats
    const [stats, setStats] = useState({ pending: 0, active: 0, completed: 0 });

    // UI & Filters
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'active' | 'completed'>('all');
    const [selectedRequest, setSelectedRequest] = useState<ConsiliumRequest | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Modal (Assign)
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [requestToAssign, setRequestToAssign] = useState<ConsiliumRequest | null>(null);
    const [counselors, setCounselors] = useState<Counselor[]>([]);
    const [loadingCounselors, setLoadingCounselors] = useState(false);
    const [selectedCounselorId, setSelectedCounselorId] = useState<string>("");
    const [isAssigning, setIsAssigning] = useState(false);

    // --- Init & Fetch ---

    useEffect(() => {
        fetchCurrentUser();
        fetchData();
    }, []);

    useEffect(() => {
        let channel: any;

        if (selectedRequest) {
            // 1. Initial Fetch
            fetchMessages(selectedRequest.id);

            // 2. Realtime Subscription
            channel = supabase
                .channel(`consilium-chat-${selectedRequest.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'consilium_messages',
                        filter: `request_id=eq.${selectedRequest.id}`,
                    },
                    async (payload: any) => {
                        console.log("New message received:", payload);
                        // Fetch complete message with sender info to display name correctly
                        const { data, error } = await supabase
                            .from('consilium_messages')
                            .select('*, sender:profiles!consilium_messages_sender_id_fkey(full_name, email)')
                            .eq('id', payload.new.id)
                            .single();

                        if (!error && data) {
                            setMessages((prev) => {
                                // Prevent duplicate if we already added it locally (optimistic)
                                if (prev.find(m => m.id === data.id)) return prev;
                                return [...prev, data as ConsiliumMessage];
                            });
                        }
                    }
                )
                .subscribe();
        } else {
            setMessages([]);
        }

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [selectedRequest]);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const fetchCurrentUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setCurrentUserId(user.id);
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('consilium_requests')
                .select(`
                    *,
                    user:profiles!consilium_requests_user_id_fkey(full_name, email),
                    counselor:profiles!consilium_requests_counselor_id_fkey(full_name)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const fetchedRequests = data as unknown as ConsiliumRequest[];
            setRequests(fetchedRequests);

            setStats({
                pending: fetchedRequests.filter(r => r.status === 'pending').length,
                active: fetchedRequests.filter(r => r.status === 'active').length,
                completed: fetchedRequests.filter(r => r.status === 'completed').length,
            });

        } catch (err: any) {
            console.error("Error fetching requests:", err);
            showToast("Gagal memuat data: " + err.message, "error");
        } finally {
            setLoading(false);
        }
    };

    const fetchMessages = async (requestId: string) => {
        setLoadingMessages(true);
        try {
            const { data, error } = await supabase
                .from('consilium_messages')
                .select(`
                    *,
                    sender:profiles!consilium_messages_sender_id_fkey(full_name, email)
                `)
                .eq('request_id', requestId)
                .order('created_at', { ascending: true }); // Oldest first for chat

            if (error) throw error;
            setMessages(data as unknown as ConsiliumMessage[]);
        } catch (err: any) {
            console.error("Error fetching messages:", JSON.stringify(err, null, 2));
            showToast("Gagal memuat chat: " + (err.message || "Unknown error"), "error");
        } finally {
            setLoadingMessages(false);
        }
    };

    const fetchCounselors = async () => {
        if (counselors.length > 0) return;
        setLoadingCounselors(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, role')
                .in('role', ['pastor', 'suster', 'bruder']);

            if (error) throw error;
            setCounselors(data as Counselor[]);
        } catch (err: any) {
            showToast("Gagal memuat konselor", "error");
        } finally {
            setLoadingCounselors(false);
        }
    };

    // --- Actions ---

    const handleAssign = async () => {
        if (!requestToAssign || !selectedCounselorId) return;
        setIsAssigning(true);
        try {
            const { error } = await supabase
                .from('consilium_requests')
                .update({ counselor_id: selectedCounselorId, status: 'active' })
                .eq('id', requestToAssign.id);

            if (error) throw error;

            showToast("Konselor berhasil ditugaskan!", "success");
            setIsAssignModalOpen(false);
            fetchData();
        } catch (err: any) {
            showToast(err.message, "error");
        } finally {
            setIsAssigning(false);
        }
    };

    const openAssignModal = (req: ConsiliumRequest, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent opening chat when clicking button
        setRequestToAssign(req);
        setSelectedCounselorId("");
        fetchCounselors();
        setIsAssignModalOpen(true);
    };

    // --- Render Helpers ---

    const getStatusBadge = (status: string) => {
        const styles = {
            pending: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800",
            active: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
            completed: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
        };
        const labels = { pending: "Pending", active: "Active", completed: "Selesai" };

        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status as keyof typeof styles]}`}>
                {labels[status as keyof typeof labels] || status}
            </span>
        );
    };

    const filteredRequests = requests.filter(r => statusFilter === 'all' || r.status === statusFilter);

    return (
        <div className="space-y-6 min-h-[calc(100vh-4rem)] bg-slate-50/50 dark:bg-transparent pb-6">

            {/* Header & Stats */}
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 tracking-tight">
                        Consilium Management
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Pusat pengelolaan layanan konseling & monitoring chat.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                        { label: "Menunggu", val: stats.pending, icon: Clock, color: "text-yellow-600", bg: "bg-yellow-100/50" },
                        { label: "Sedang Berjalan", val: stats.active, icon: Activity, color: "text-blue-600", bg: "bg-blue-100/50" },
                        { label: "Selesai", val: stats.completed, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-100/50" }
                    ].map((s, i) => (
                        <div key={i} className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-4">
                            <div className={`p-3 rounded-xl ${s.bg} dark:bg-opacity-20 ${s.color} dark:text-opacity-90`}>
                                <s.icon size={24} />
                            </div>
                            <div>
                                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{s.label}</p>
                                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{s.val}</h3>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content Area: Split View */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[600px]">

                {/* Left: Request List */}
                <div className={`col-span-12 lg:col-span-7 flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden transition-all ${selectedRequest ? 'lg:col-span-7' : 'lg:col-span-12'}`}>

                    {/* Toolbar */}
                    <div className="border-b border-slate-100 dark:border-slate-800 px-4 pt-4 flex gap-4 overflow-x-auto shrink-0">
                        {['all', 'pending', 'active', 'completed'].map(f => (
                            <button
                                key={f}
                                onClick={() => setStatusFilter(f as any)}
                                className={`pb-3 px-2 text-sm font-medium transition-all relative capitalize whitespace-nowrap ${statusFilter === f ? 'text-purple-600 dark:text-purple-400 font-bold' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                            >
                                {f}
                                {statusFilter === f && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-purple-600 to-blue-600" />}
                            </button>
                        ))}
                    </div>

                    {/* Scrollable List */}
                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div></div>
                        ) : (
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredRequests.map(req => (
                                    <div
                                        key={req.id}
                                        onClick={() => setSelectedRequest(req)}
                                        className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors border-l-4 ${selectedRequest?.id === req.id ? 'bg-purple-50/50 dark:bg-purple-900/10 border-purple-500' : 'border-transparent'}`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-800 dark:text-white truncate max-w-[150px]">{req.user?.full_name}</span>
                                                <span className="text-xs text-slate-500">• {new Date(req.created_at).toLocaleDateString()}</span>
                                            </div>
                                            {getStatusBadge(req.status)}
                                        </div>
                                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 line-clamp-1 mb-1">{req.topic}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{req.description}</p>

                                        <div className="mt-3 flex justify-between items-center">
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <span>Pref: <span className="font-semibold capitalize">{req.preference_counselor}</span></span>
                                                {req.counselor && (
                                                    <span className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                                                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                                        {req.counselor.full_name}
                                                    </span>
                                                )}
                                            </div>
                                            {req.status === 'pending' && (
                                                <button
                                                    onClick={(e) => openAssignModal(req, e)}
                                                    className="px-3 py-1 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-sm"
                                                >
                                                    Atur Konselor
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {filteredRequests.length === 0 && <p className="p-8 text-center text-slate-500 text-sm">Tidak ada data ditemukan.</p>}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Chat / Detail View (READ ONLY) */}
                {selectedRequest && (
                    <div className="col-span-12 lg:col-span-5 flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden h-[600px] lg:h-auto animate-in slide-in-from-right duration-300">

                        {/* Chat Header */}
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    {selectedRequest.topic}
                                    <span className="px-2 py-0.5 text-[10px] bg-slate-200 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300 font-normal uppercase tracking-wide">Read-Only</span>
                                </h3>
                                <p className="text-xs text-slate-500">Request oleh {selectedRequest.user?.full_name}</p>
                            </div>
                            <button onClick={() => setSelectedRequest(null)} className="lg:hidden text-slate-500 text-xs">Tutup</button>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950/30">
                            {/* Request Detail Card Inside Chat */}
                            <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-xl border border-purple-100 dark:border-purple-800/30 mb-6 text-sm">
                                <p className="font-semibold text-purple-800 dark:text-purple-300 mb-1">Detail Masalah:</p>
                                <p className="text-slate-700 dark:text-slate-300 italic">"{selectedRequest.description}"</p>
                            </div>

                            {loadingMessages ? (
                                <div className="text-center py-10 text-xs text-slate-500">Memuat riwayat pesan...</div>
                            ) : messages.length === 0 ? (
                                <div className="text-center py-10 text-xs text-slate-400">Belum ada aktivitas percakapan.</div>
                            ) : (
                                messages.map((msg) => {
                                    const isMe = msg.sender_id === currentUserId; // Still check if it was 'me' (admin) historically
                                    return (
                                        <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[10px] text-slate-500 font-medium">
                                                    {isMe ? 'Anda (Admin)' : msg.sender?.full_name || 'User'}
                                                </span>
                                            </div>
                                            <div className={`px-4 py-2.5 max-w-[85%] rounded-2xl text-sm leading-relaxed ${isMe
                                                    ? 'bg-blue-600 text-white rounded-br-none shadow-md shadow-blue-500/20'
                                                    : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-bl-none shadow-sm'
                                                }`}>
                                                {msg.content}
                                            </div>
                                            <span className="text-[10px] text-slate-400 mt-1 px-1">
                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    )
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Footer - No Input Box, just Info */}
                        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 text-center">
                            <p className="text-xs text-slate-400 flex items-center justify-center gap-2">
                                <Eye size={14} />
                                Mode Monitoring (Read-Only). Balasan dilakukan oleh Konselor via Mobile App.
                            </p>
                        </div>
                    </div>
                )}

                {/* Placeholder if no selection */}
                {!selectedRequest && (
                    <div className="hidden lg:flex col-span-5 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800 items-center justify-center text-slate-400 flex-col gap-3">
                        <div className="p-4 bg-white dark:bg-slate-800 rounded-full shadow-sm mb-2">
                            <MessageSquare size={32} className="text-purple-200 dark:text-purple-900" />
                        </div>
                        <p className="text-sm font-medium">Pilih permintaan konseling untuk melihat riwayat chat</p>
                    </div>
                )}

            </div>

            {/* Assign Modal (Reused) */}
            <Modal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} title="Tugaskan Konselor">
                <div className="space-y-6">
                    {requestToAssign && (
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl space-y-2 border border-slate-100 dark:border-slate-800">
                            <p className="font-bold text-slate-900 dark:text-white">{requestToAssign.user?.full_name}</p>
                            <p className="text-sm text-slate-600 dark:text-slate-400">{requestToAssign.topic}</p>
                        </div>
                    )}
                    <div className="space-y-3 max-h-[250px] overflow-y-auto">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Pilih:</label>
                        {loadingCounselors ? <div className="text-xs">Loading...</div> : counselors.map(c => (
                            <div key={c.id} onClick={() => setSelectedCounselorId(c.id)} className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between ${selectedCounselorId === c.id ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                                <span>{c.full_name} <span className="text-xs text-slate-400">({c.role})</span></span>
                                {selectedCounselorId === c.id && <CheckCircle2 size={16} className="text-purple-600" />}
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-3 pt-4">
                        <button onClick={() => setIsAssignModalOpen(false)} className="flex-1 px-4 py-2 bg-slate-100 rounded-xl text-slate-600 text-sm font-bold">Batal</button>
                        <button onClick={handleAssign} disabled={isAssigning || !selectedCounselorId} className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-200">Tugaskan</button>
                    </div>
                </div>
            </Modal>

        </div>
    );
}
