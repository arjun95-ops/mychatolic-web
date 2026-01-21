"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    Save,
    Smartphone,
    GripVertical,
    Eye,
    EyeOff,
    Settings,
    Loader2,
    Calendar,
    BookOpen,
    Image as ImageIcon,
    Clock,
    Layout
} from "lucide-react";

// --- Types ---

interface HomepageSection {
    id: string;
    section_key: string;
    label: string;
    is_active: boolean;
    order_index: number;
    settings: any;
}

// --- Sub-Components ---

// 1. Sortable Item Card
function SortableSectionItem({
    section,
    onToggle,
    onEdit
}: {
    section: HomepageSection;
    onToggle: (id: string, current: boolean) => void;
    onEdit: (section: HomepageSection) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: section.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`bg-white dark:bg-slate-900 border ${isDragging ? 'border-purple-500 shadow-xl' : 'border-slate-200 dark:border-slate-800'} rounded-xl p-3 flex items-center gap-3 transition-colors`}
        >
            {/* Drag Handle */}
            <button
                {...attributes}
                {...listeners}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-grab active:cursor-grabbing hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
                <GripVertical className="w-5 h-5" />
            </button>

            {/* Content */}
            <div className="flex-1">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{section.label}</span>
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                        {section.section_key}
                    </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                    {section.is_active ? (
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Active
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 text-slate-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Hidden
                        </span>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
                <button
                    onClick={() => onToggle(section.id, section.is_active)}
                    className={`p-2 rounded-lg transition-colors ${section.is_active
                        ? 'text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20'
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    title={section.is_active ? "Hide Section" : "Show Section"}
                >
                    {section.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                    onClick={() => onEdit(section)}
                    className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                    title="Edit Settings"
                >
                    <Settings className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

// 2. Mobile Mockup Component
function MobileMockup({ sections }: { sections: HomepageSection[] }) {
    // Helper to render skeleton content based on section key
    const renderWidget = (key: string, label: string) => {
        switch (key) {
            case 'daily_verse':
                return (
                    <div className="bg-purple-600 rounded-xl p-4 text-white space-y-2 shadow-lg shadow-purple-200">
                        <div className="flex items-center gap-2 text-xs opacity-80 mb-2">
                            <BookOpen className="w-3 h-3" /> Ayat Harian
                        </div>
                        <div className="h-2 w-3/4 bg-white/30 rounded"></div>
                        <div className="h-2 w-1/2 bg-white/30 rounded"></div>
                        <div className="h-2 w-2/3 bg-white/30 rounded"></div>
                    </div>
                );
            case 'banner':
                return (
                    <div className="aspect-[2/1] bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl p-4 text-white flex flex-col justify-end">
                        <div className="font-bold text-sm">Renungan Pagi</div>
                        <div className="text-[10px] opacity-80">Dimulai dalam 10 menit</div>
                    </div>
                );
            case 'bible_shortcut':
                return (
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-orange-100 rounded-lg p-3 text-orange-700 font-bold text-xs flex items-center gap-2">
                            <BookOpen className="w-4 h-4" /> PB
                        </div>
                        <div className="bg-blue-100 rounded-lg p-3 text-blue-700 font-bold text-xs flex items-center gap-2">
                            <BookOpen className="w-4 h-4" /> PL
                        </div>
                    </div>
                );
            case 'last_read':
                return (
                    <div className="bg-white border rounded-xl p-3 flex items-center justify-between shadow-sm">
                        <div className="space-y-1">
                            <div className="text-[10px] text-gray-400 font-bold uppercase">Terakhir Dibaca</div>
                            <div className="text-xs font-bold text-gray-800">Matius 5:1-12</div>
                        </div>
                        <Clock className="w-4 h-4 text-gray-400" />
                    </div>
                );
            default:
                return (
                    <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4 flex items-center justify-center text-gray-400 text-xs font-medium">
                        {label} Widget
                    </div>
                );
        }
    };

    return (
        <div className="w-[300px] h-[600px] bg-white border-[8px] border-slate-900 rounded-[3rem] shadow-2xl overflow-hidden relative mx-auto">
            {/* Notch */}
            <div className="absolute top-0 inset-x-0 h-6 bg-slate-900 z-20 flex justify-center">
                <div className="w-32 h-4 bg-slate-900 rounded-b-xl"></div>
            </div>

            {/* Status Bar Mock */}
            <div className="h-8 bg-white w-full flex items-center justify-between px-6 pt-2 text-[10px] font-bold text-slate-800 z-10 relative">
                <span>9:41</span>
                <div className="flex gap-1">
                    <div className="w-4 h-2.5 bg-slate-800 rounded-sm"></div>
                </div>
            </div>

            {/* App Content */}
            <div className="h-full overflow-y-auto bg-gray-100 pb-10 scrollbar-hide">
                {/* App Header */}
                <div className="px-5 py-4 bg-white sticky top-0 z-10 shadow-sm mb-4">
                    <div className="text-sm font-bold text-slate-800">MyCatholic</div>
                    <div className="text-[10px] text-slate-400">Selasa, 21 Januari</div>
                </div>

                <div className="px-4 space-y-4">
                    {sections.filter(s => s.is_active).map(section => (
                        <div key={section.section_key} className="animate-in fade-in zoom-in duration-300">
                            {renderWidget(section.section_key, section.label)}
                        </div>
                    ))}
                    {sections.filter(s => s.is_active).length === 0 && (
                        <div className="text-center py-10 text-gray-400 text-xs">
                            Halaman kosong
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Indicator */}
            <div className="absolute bottom-1 inset-x-0 flex justify-center pb-2">
                <div className="w-32 h-1 bg-slate-300 rounded-full"></div>
            </div>
        </div>
    );
}


// --- Main Page ---

export default function HomepageSettingsPage() {
    const { showToast } = useToast();
    const [sections, setSections] = useState<HomepageSection[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Fetch initial data
    useEffect(() => {
        const fetchSections = async () => {
            try {
                const { data, error } = await supabase
                    .from('homepage_sections')
                    .select('*')
                    .order('order_index', { ascending: true });

                if (error) throw error;
                setSections(data || []);
            } catch (err) {
                console.error("Error fetching sections:", err);
                showToast("Gagal memuat layout homepage", "error");
            } finally {
                setLoading(false);
            }
        };
        fetchSections();
    }, [showToast]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setSections((items) => {
                const oldIndex = items.findIndex((i) => i.id === active.id);
                const newIndex = items.findIndex((i) => i.id === over.id);
                const newOrder = arrayMove(items, oldIndex, newIndex);
                setHasChanges(true); // Mark unsaved changes
                return newOrder;
            });
        }
    };

    const handleToggle = (id: string, current: boolean) => {
        setSections(items => items.map(item =>
            item.id === id ? { ...item, is_active: !current } : item
        ));
        setHasChanges(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Prepare batch updates
            // We need to update 'order_index' based on the current array position
            // And 'is_active' based on current state.

            const updates = sections.map((section, index) => ({
                id: section.id,
                section_key: section.section_key, // Required for upsert identifier if using key? No, use ID.
                label: section.label,
                is_active: section.is_active,
                order_index: index, // Update strict order
                settings: section.settings
            }));

            const { error } = await supabase
                .from('homepage_sections')
                .upsert(updates); // Upsert handles updates if ID matches

            if (error) throw error;

            showToast("Perubahan berhasil disimpan!", "success");
            setHasChanges(false);

        } catch (err: any) {
            console.error("Save error:", err);
            showToast(`Gagal menyimpan: ${err.message}`, "error");
        } finally {
            setSaving(false);
        }
    };

    // Placeholder for Edit (Could be a modal later)
    const handleEdit = (section: HomepageSection) => {
        showToast(`Edit settings for ${section.label} (Coming Soon)`, "info");
    };

    if (loading) {
        return <div className="p-8 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-purple-600" /></div>;
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Smartphone className="w-8 h-8 text-purple-600" />
                        Homepage Settings
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400">Atur tata letak dan konten halaman utama aplikasi.</p>
                </div>

                <button
                    onClick={handleSave}
                    disabled={!hasChanges || saving}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${hasChanges
                            ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-200 dark:shadow-purple-900/20 transform hover:-translate-y-0.5'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                        }`}
                >
                    {saving ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Menyimpan...
                        </>
                    ) : (
                        <>
                            <Save className="w-5 h-5" />
                            Simpan Perubahan
                        </>
                    )}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">

                {/* LEFT: Live Preview */}
                <div className="order-2 lg:order-1 flex flex-col items-center">
                    <div className="mb-4 text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                        <Layout className="w-4 h-4" />
                        Live Mobile Preview
                    </div>
                    <MobileMockup sections={sections} />
                    <p className="mt-6 text-xs text-slate-400 text-center max-w-xs">
                        Tampilan ini adalah simulasi. Hasil akhir pada perangkat pengguna mungkin sedikit berbeda tergantung ukuran layar.
                    </p>
                </div>

                {/* RIGHT: Controls */}
                <div className="order-1 lg:order-2 space-y-6">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h3 className="font-bold text-lg mb-4 text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
                            Susunan Bagian (Sections)
                        </h3>

                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={sections.map(s => s.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="space-y-3">
                                    {sections.map(section => (
                                        <SortableSectionItem
                                            key={section.id}
                                            section={section}
                                            onToggle={handleToggle}
                                            onEdit={handleEdit}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>

                        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl text-blue-700 dark:text-blue-300 text-sm flex gap-3">
                            <div className="shrink-0 pt-0.5">💡</div>
                            <p>
                                Geser kartu (drag & drop) untuk mengubah urutan tampilan di aplikasi.
                                Gunakan ikon mata untuk menyembunyikan bagian tanpa menghapusnya.
                                Jangan lupa tekan tombol <strong>Simpan</strong> setelah melakukan perubahan.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
