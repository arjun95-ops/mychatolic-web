'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    AlertCircle,
    Archive,
    Bell,
    CheckCircle2,
    Clock3,
    Database,
    Download,
    History,
    RefreshCcw,
    ShieldAlert,
    Trash2,
} from 'lucide-react';

type BackupFile = {
    key: string;
    path: string;
    signed_url: string | null;
    content_type: string;
};

type ExportResponse = {
    rows: {
        admin_sessions: number;
        audit_logs: number;
    };
    files: BackupFile[];
};

type ScheduleRow = {
    id: string;
    name: string;
    cron_expression: string;
    timezone: string;
    channels: string[];
    is_active: boolean;
    next_run_at?: string | null;
    last_run_at?: string | null;
    last_reminded_at?: string | null;
    created_at?: string | null;
};

type ReminderRow = {
    id: string;
    title: string;
    message: string;
    reminder_at: string | null;
    is_read: boolean;
    metadata?: Record<string, unknown> | null;
};

type ExportHistoryRow = {
    id: string;
    export_type: string;
    files: BackupFile[] | null;
    from_at: string | null;
    to_at: string | null;
    created_at: string | null;
    exported_by: string | null;
};

type RetentionResult = {
    dry_run: boolean;
    cutoff: string;
    old_rows: {
        admin_sessions: number;
        audit_logs: number;
    };
    purged_rows: {
        admin_sessions: number;
        audit_logs: number;
    };
};

type ScheduleForm = {
    id: string | null;
    name: string;
    cron_expression: string;
    timezone: string;
    channels: string[];
    is_active: boolean;
};

type Notice = {
    type: 'success' | 'error';
    message: string;
} | null;

const DEFAULT_FORM: ScheduleForm = {
    id: null,
    name: '',
    cron_expression: '0 9 * * 1',
    timezone: 'Asia/Jakarta',
    channels: ['in_app', 'email'],
    is_active: true,
};

function formatDateTime(value?: string | null): string {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}

function parseErrorMessage(json: unknown, fallback: string): string {
    if (json && typeof json === 'object' && 'message' in json) {
        const message = (json as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim()) return message;
    }
    return fallback;
}

function toDateTimeInputValue(date: Date): string {
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function channelBadgeLabel(channel: string): string {
    return channel === 'email' ? 'Email' : channel === 'in_app' ? 'In-App' : channel;
}

export default function SuperAdminBackupsPage() {
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [exporting, setExporting] = useState(false);
    const [exportResult, setExportResult] = useState<ExportResponse | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);
    const [notice, setNotice] = useState<Notice>(null);

    const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
    const [scheduleLoading, setScheduleLoading] = useState(true);
    const [scheduleError, setScheduleError] = useState<string | null>(null);
    const [scheduleForm, setScheduleForm] = useState<ScheduleForm>(DEFAULT_FORM);
    const [scheduleSaving, setScheduleSaving] = useState(false);
    const [scheduleDeletingId, setScheduleDeletingId] = useState<string | null>(null);
    const [processLoading, setProcessLoading] = useState(false);

    const [reminders, setReminders] = useState<ReminderRow[]>([]);
    const [reminderLoading, setReminderLoading] = useState(true);
    const [reminderError, setReminderError] = useState<string | null>(null);
    const [markingReminderId, setMarkingReminderId] = useState<string | null>(null);

    const [exportsHistory, setExportsHistory] = useState<ExportHistoryRow[]>([]);
    const [exportsLoading, setExportsLoading] = useState(true);
    const [exportsError, setExportsError] = useState<string | null>(null);

    const [retentionLoading, setRetentionLoading] = useState(false);
    const [retentionError, setRetentionError] = useState<string | null>(null);
    const [retentionResult, setRetentionResult] = useState<RetentionResult | null>(null);

    const unreadReminderCount = useMemo(
        () => reminders.filter((item) => !item.is_read).length,
        [reminders]
    );
    const activeSchedulesCount = useMemo(
        () => schedules.filter((item) => item.is_active).length,
        [schedules]
    );

    const fetchSchedules = useCallback(async () => {
        setScheduleLoading(true);
        setScheduleError(null);
        try {
            const res = await fetch('/api/admin/super-admin/backups/schedules', { cache: 'no-store' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal memuat jadwal backup.'));
            setSchedules((json.data || []) as ScheduleRow[]);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal memuat jadwal backup.';
            setScheduleError(message);
        } finally {
            setScheduleLoading(false);
        }
    }, []);

    const fetchReminders = useCallback(async () => {
        setReminderLoading(true);
        setReminderError(null);
        try {
            const res = await fetch('/api/admin/super-admin/backups/reminders', { cache: 'no-store' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal memuat reminder backup.'));
            setReminders((json.data || []) as ReminderRow[]);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal memuat reminder backup.';
            setReminderError(message);
        } finally {
            setReminderLoading(false);
        }
    }, []);

    const fetchExportsHistory = useCallback(async () => {
        setExportsLoading(true);
        setExportsError(null);
        try {
            const res = await fetch('/api/admin/super-admin/backups/exports?limit=30', { cache: 'no-store' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal memuat riwayat export.'));
            setExportsHistory((json.data || []) as ExportHistoryRow[]);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal memuat riwayat export.';
            setExportsError(message);
        } finally {
            setExportsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSchedules();
        fetchReminders();
        fetchExportsHistory();
    }, [fetchSchedules, fetchReminders, fetchExportsHistory]);

    const setQuickRange = (days: number) => {
        const now = new Date();
        const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        setFrom(toDateTimeInputValue(past));
        setTo(toDateTimeInputValue(now));
    };

    const clearRange = () => {
        setFrom('');
        setTo('');
    };

    const handleExportNow = async () => {
        setExporting(true);
        setExportError(null);
        setExportResult(null);
        setNotice(null);
        try {
            const body: Record<string, string> = {};
            if (from) body.from = from;
            if (to) body.to = to;

            const res = await fetch('/api/admin/super-admin/backups/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal membuat backup export.'));
            setExportResult((json || null) as ExportResponse);
            await fetchExportsHistory();
            setNotice({ type: 'success', message: 'Backup export berhasil dibuat.' });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal membuat backup export.';
            setExportError(message);
            setNotice({ type: 'error', message });
        } finally {
            setExporting(false);
        }
    };

    const handleSaveSchedule = async () => {
        if (!scheduleForm.name.trim()) {
            setNotice({ type: 'error', message: 'Nama jadwal wajib diisi.' });
            return;
        }
        if (!scheduleForm.cron_expression.trim()) {
            setNotice({ type: 'error', message: 'Cron expression wajib diisi.' });
            return;
        }

        setScheduleSaving(true);
        setNotice(null);
        try {
            const res = await fetch('/api/admin/super-admin/backups/schedules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: scheduleForm.id,
                    name: scheduleForm.name.trim(),
                    cron_expression: scheduleForm.cron_expression.trim(),
                    timezone: scheduleForm.timezone.trim() || 'Asia/Jakarta',
                    channels: scheduleForm.channels,
                    is_active: scheduleForm.is_active,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal menyimpan jadwal backup.'));
            setScheduleForm(DEFAULT_FORM);
            await fetchSchedules();
            setNotice({
                type: 'success',
                message: scheduleForm.id ? 'Jadwal backup berhasil diperbarui.' : 'Jadwal backup berhasil ditambahkan.',
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal menyimpan jadwal backup.';
            setNotice({ type: 'error', message });
        } finally {
            setScheduleSaving(false);
        }
    };

    const handleEditSchedule = (row: ScheduleRow) => {
        setScheduleForm({
            id: row.id,
            name: row.name || '',
            cron_expression: row.cron_expression || '',
            timezone: row.timezone || 'Asia/Jakarta',
            channels: Array.isArray(row.channels) && row.channels.length > 0 ? row.channels : ['in_app', 'email'],
            is_active: row.is_active !== false,
        });
    };

    const handleDeleteSchedule = async (id: string) => {
        if (!window.confirm('Hapus jadwal backup ini?')) return;
        setScheduleDeletingId(id);
        setNotice(null);
        try {
            const res = await fetch(`/api/admin/super-admin/backups/schedules?id=${encodeURIComponent(id)}`, {
                method: 'DELETE',
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal menghapus jadwal backup.'));
            if (scheduleForm.id === id) setScheduleForm(DEFAULT_FORM);
            await fetchSchedules();
            setNotice({ type: 'success', message: 'Jadwal backup berhasil dihapus.' });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal menghapus jadwal backup.';
            setNotice({ type: 'error', message });
        } finally {
            setScheduleDeletingId(null);
        }
    };

    const handleRunProcess = async () => {
        setProcessLoading(true);
        setNotice(null);
        try {
            const res = await fetch('/api/admin/super-admin/backups/process', { method: 'POST' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal menjalankan schedule processor.'));
            await Promise.all([fetchSchedules(), fetchReminders()]);
            setNotice({
                type: 'success',
                message: `Processor selesai. Processed ${Number(json.processed || 0)} jadwal, reminder ${Number(
                    json.reminders_created || 0
                )}, email ${Number(json.emails_sent || 0)}.`,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal menjalankan schedule processor.';
            setNotice({ type: 'error', message });
        } finally {
            setProcessLoading(false);
        }
    };

    const handleToggleChannel = (channel: 'in_app' | 'email') => {
        setScheduleForm((prev) => {
            const exists = prev.channels.includes(channel);
            if (exists) {
                const nextChannels = prev.channels.filter((item) => item !== channel);
                return {
                    ...prev,
                    channels: nextChannels.length > 0 ? nextChannels : ['in_app'],
                };
            }
            return {
                ...prev,
                channels: [...prev.channels, channel],
            };
        });
    };

    const markReminderRead = async (id: string) => {
        setMarkingReminderId(id);
        setNotice(null);
        try {
            const res = await fetch('/api/admin/super-admin/backups/reminders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, mark_read: true }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal update reminder.'));
            await fetchReminders();
            setNotice({ type: 'success', message: 'Reminder ditandai sebagai sudah dibaca.' });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal update reminder.';
            setNotice({ type: 'error', message });
        } finally {
            setMarkingReminderId(null);
        }
    };

    const runRetention = async (dryRun: boolean) => {
        if (!dryRun) {
            const confirmed = window.confirm(
                'Ini akan menghapus data admin_sessions dan audit_logs yang lebih lama dari 1 tahun. Lanjutkan?'
            );
            if (!confirmed) return;
        }

        setRetentionLoading(true);
        setRetentionError(null);
        setNotice(null);
        try {
            const res = await fetch('/api/admin/super-admin/backups/retention', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dry_run: dryRun }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(parseErrorMessage(json, 'Gagal menjalankan retention.'));
            setRetentionResult((json || null) as RetentionResult);
            await Promise.all([fetchSchedules(), fetchExportsHistory()]);
            setNotice({
                type: 'success',
                message: dryRun
                    ? 'Dry run retention selesai. Data belum dihapus.'
                    : 'Purge retention selesai. Data lama berhasil dibersihkan.',
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal menjalankan retention.';
            setRetentionError(message);
            setNotice({ type: 'error', message });
        } finally {
            setRetentionLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-surface-secondary/80 bg-gradient-to-r from-surface-primary via-surface-primary to-action/5 p-6 shadow-sm">
                <h1 className="text-2xl font-bold text-text-primary">Backup & Retensi</h1>
                <p className="text-sm text-text-secondary mt-1">
                    Export CSV/JSON, jadwalkan reminder backup custom cron, dan kelola retensi audit 1 tahun.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                        href="/dashboard/super-admin/admin-ops"
                        className="inline-flex items-center gap-1 rounded-lg border border-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:bg-surface-secondary/20"
                    >
                        <ShieldAlert size={13} />
                        Manajemen Admin
                    </Link>
                    <Link
                        href="/dashboard/super-admin/sessions"
                        className="inline-flex items-center gap-1 rounded-lg border border-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:bg-surface-secondary/20"
                    >
                        <Clock3 size={13} />
                        Admin Sessions
                    </Link>
                    <Link
                        href="/dashboard/super-admin/audit-logs"
                        className="inline-flex items-center gap-1 rounded-lg border border-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:bg-surface-secondary/20"
                    >
                        <History size={13} />
                        Audit Logs
                    </Link>
                </div>
            </div>

            {notice && (
                <div
                    className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-2 ${
                        notice.type === 'success'
                            ? 'border-status-success/40 bg-status-success/10 text-status-success'
                            : 'border-status-error/40 bg-status-error/10 text-status-error'
                    }`}
                >
                    {notice.type === 'success' ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
                    <span>{notice.message}</span>
                </div>
            )}

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-4">
                    <p className="text-xs uppercase tracking-wide text-text-secondary">Jadwal Aktif</p>
                    <p className="mt-2 text-2xl font-bold text-text-primary">{activeSchedulesCount}</p>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
                        <Clock3 size={13} />
                        dari {schedules.length} jadwal
                    </div>
                </div>
                <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-4">
                    <p className="text-xs uppercase tracking-wide text-text-secondary">Reminder Unread</p>
                    <p className="mt-2 text-2xl font-bold text-status-pending">{unreadReminderCount}</p>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
                        <Bell size={13} />
                        butuh follow-up
                    </div>
                </div>
                <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-4">
                    <p className="text-xs uppercase tracking-wide text-text-secondary">Riwayat Export</p>
                    <p className="mt-2 text-2xl font-bold text-action">{exportsHistory.length}</p>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
                        <History size={13} />
                        terbaru 30 data
                    </div>
                </div>
                <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-4">
                    <p className="text-xs uppercase tracking-wide text-text-secondary">Retensi</p>
                    <p className="mt-2 text-2xl font-bold text-status-error">365</p>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
                        <Database size={13} />
                        hari penyimpanan
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                    <Download size={18} className="text-action" />
                    <h2 className="text-lg font-bold text-text-primary">On-Demand Export</h2>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setQuickRange(1)}
                        className="rounded-lg border border-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-surface-secondary/20"
                    >
                        24 Jam
                    </button>
                    <button
                        onClick={() => setQuickRange(7)}
                        className="rounded-lg border border-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-surface-secondary/20"
                    >
                        7 Hari
                    </button>
                    <button
                        onClick={() => setQuickRange(30)}
                        className="rounded-lg border border-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-surface-secondary/20"
                    >
                        30 Hari
                    </button>
                    <button
                        onClick={clearRange}
                        className="rounded-lg border border-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-surface-secondary/20"
                    >
                        Reset Range
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">Dari (opsional)</label>
                        <input
                            type="datetime-local"
                            value={from}
                            onChange={(e) => setFrom(e.target.value)}
                            className="w-full rounded-xl border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">Sampai (opsional)</label>
                        <input
                            type="datetime-local"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                            className="w-full rounded-xl border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={handleExportNow}
                            disabled={exporting}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-action px-4 py-2 text-sm font-semibold text-text-inverse transition hover:brightness-105 disabled:opacity-50"
                        >
                            <Archive size={16} />
                            {exporting ? 'Memproses...' : 'Export Sekarang'}
                        </button>
                    </div>
                </div>

                {exportError && (
                    <div className="rounded-lg border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error">
                        {exportError}
                    </div>
                )}

                {exportResult && (
                    <div className="rounded-xl border border-status-success/30 bg-status-success/10 p-4 space-y-3">
                        <div className="text-sm font-semibold text-status-success">
                            Export selesai: sessions {exportResult.rows.admin_sessions}, audit logs {exportResult.rows.audit_logs}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {(exportResult.files || []).map((file) => (
                                <div
                                    key={file.path}
                                    className="rounded-lg border border-status-success/30 bg-surface-primary/90 px-3 py-2 text-xs flex items-center justify-between gap-3"
                                >
                                    <div className="text-text-primary break-all">{file.key}</div>
                                    {file.signed_url ? (
                                        <a
                                            href={file.signed_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 rounded-md border border-action/30 bg-action/10 px-2 py-1 text-action font-semibold whitespace-nowrap"
                                        >
                                            <Download size={12} />
                                            Download
                                        </a>
                                    ) : (
                                        <span className="text-text-secondary">Link expired</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                        <Clock3 size={18} className="text-action" />
                        <h2 className="text-lg font-bold text-text-primary">Jadwal Backup (Cron Custom)</h2>
                    </div>
                    <button
                        onClick={handleRunProcess}
                        disabled={processLoading}
                        className="inline-flex items-center gap-2 rounded-xl border border-surface-secondary px-3 py-2 text-sm text-text-primary hover:bg-surface-secondary/20 disabled:opacity-50"
                    >
                        <RefreshCcw size={14} />
                        {processLoading ? 'Memproses...' : 'Jalankan Reminder Sekarang'}
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-text-secondary mb-1">Nama Jadwal</label>
                        <input
                            type="text"
                            value={scheduleForm.name}
                            onChange={(e) => setScheduleForm((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="Contoh: Backup Mingguan"
                            className="w-full rounded-xl border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-text-secondary mb-1">Cron Expression</label>
                        <input
                            type="text"
                            value={scheduleForm.cron_expression}
                            onChange={(e) => setScheduleForm((prev) => ({ ...prev, cron_expression: e.target.value }))}
                            placeholder="0 9 * * 1"
                            className="w-full rounded-xl border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">Timezone</label>
                        <input
                            type="text"
                            value={scheduleForm.timezone}
                            onChange={(e) => setScheduleForm((prev) => ({ ...prev, timezone: e.target.value }))}
                            placeholder="Asia/Jakarta"
                            className="w-full rounded-xl border border-surface-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-action/60 focus:ring-2 focus:ring-action/20"
                        />
                    </div>
                    <div className="flex items-end gap-2">
                        <button
                            onClick={handleSaveSchedule}
                            disabled={scheduleSaving}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-action px-3 py-2 text-sm font-semibold text-text-inverse transition hover:brightness-105 disabled:opacity-50"
                        >
                            {scheduleSaving ? 'Menyimpan...' : scheduleForm.id ? 'Update' : 'Tambah'}
                        </button>
                        {scheduleForm.id && (
                            <button
                                onClick={() => setScheduleForm(DEFAULT_FORM)}
                                className="rounded-xl border border-surface-secondary px-3 py-2 text-sm text-text-primary hover:bg-surface-secondary/20"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </div>

                <p className="text-xs text-text-secondary">
                    Cron mengikuti timezone jadwal (default <span className="font-semibold text-text-primary">Asia/Jakarta</span>).
                </p>

                <div className="flex flex-wrap gap-2">
                    {(['in_app', 'email'] as const).map((channel) => {
                        const active = scheduleForm.channels.includes(channel);
                        return (
                            <button
                                key={channel}
                                onClick={() => handleToggleChannel(channel)}
                                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                    active
                                        ? 'border-action/40 bg-action/10 text-action'
                                        : 'border-surface-secondary text-text-secondary hover:bg-surface-secondary/20'
                                }`}
                            >
                                {channelBadgeLabel(channel)}
                            </button>
                        );
                    })}
                    <button
                        onClick={() =>
                            setScheduleForm((prev) => ({
                                ...prev,
                                is_active: !prev.is_active,
                            }))
                        }
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            scheduleForm.is_active
                                ? 'border-status-success/40 bg-status-success/10 text-status-success'
                                : 'border-status-error/40 bg-status-error/10 text-status-error'
                        }`}
                    >
                        {scheduleForm.is_active ? 'Aktif' : 'Nonaktif'}
                    </button>
                </div>

                {scheduleError && (
                    <div className="rounded-lg border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error">
                        {scheduleError}
                    </div>
                )}

                <div className="overflow-x-auto rounded-xl border border-surface-secondary/60">
                    <table className="min-w-full text-sm">
                        <thead className="bg-surface-secondary/70 text-xs uppercase tracking-wide text-text-secondary">
                            <tr>
                                <th className="px-3 py-2 text-left">Nama</th>
                                <th className="px-3 py-2 text-left">Cron</th>
                                <th className="px-3 py-2 text-left">Timezone</th>
                                <th className="px-3 py-2 text-left">Channel</th>
                                <th className="px-3 py-2 text-left">Next Run</th>
                                <th className="px-3 py-2 text-left">Last Run</th>
                                <th className="px-3 py-2 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-secondary/50">
                            {scheduleLoading ? (
                                <tr>
                                    <td colSpan={7} className="px-3 py-8 text-center text-text-secondary">
                                        Memuat jadwal...
                                    </td>
                                </tr>
                            ) : schedules.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-3 py-8 text-center text-text-secondary">
                                        Belum ada jadwal backup.
                                    </td>
                                </tr>
                            ) : (
                                schedules.map((row) => (
                                    <tr key={row.id} className="hover:bg-surface-secondary/20 transition">
                                        <td className="px-3 py-2 text-text-primary font-semibold">
                                            {row.name}
                                            {!row.is_active && (
                                                <span className="ml-2 rounded-full border border-status-error/30 bg-status-error/10 px-2 py-0.5 text-[10px] text-status-error">
                                                    nonaktif
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-text-primary">{row.cron_expression}</td>
                                        <td className="px-3 py-2 text-text-secondary">{row.timezone}</td>
                                        <td className="px-3 py-2 text-text-secondary">
                                            <div className="flex flex-wrap gap-1">
                                                {(row.channels || []).map((channel) => (
                                                    <span
                                                        key={`${row.id}-${channel}`}
                                                        className="rounded-full border border-action/30 bg-action/10 px-2 py-0.5 text-[10px] text-action"
                                                    >
                                                        {channelBadgeLabel(channel)}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 text-text-secondary">{formatDateTime(row.next_run_at)}</td>
                                        <td className="px-3 py-2 text-text-secondary">{formatDateTime(row.last_run_at)}</td>
                                        <td className="px-3 py-2">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => handleEditSchedule(row)}
                                                    className="rounded-lg border border-surface-secondary px-2 py-1 text-xs font-semibold text-text-primary hover:bg-surface-secondary/20"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteSchedule(row.id)}
                                                    disabled={scheduleDeletingId === row.id}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-status-error/40 px-2 py-1 text-xs font-semibold text-status-error hover:bg-status-error/10 disabled:opacity-50"
                                                >
                                                    <Trash2 size={12} />
                                                    Hapus
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Bell size={18} className="text-action" />
                            <h2 className="text-lg font-bold text-text-primary">Reminder Backup</h2>
                        </div>
                        <button
                            onClick={fetchReminders}
                            className="inline-flex items-center gap-2 rounded-lg border border-surface-secondary px-3 py-1.5 text-xs text-text-primary hover:bg-surface-secondary/20"
                        >
                            <RefreshCcw size={12} />
                            Refresh
                        </button>
                    </div>

                    <p className="text-xs text-text-secondary">
                        Belum dibaca: <span className="font-semibold text-text-primary">{unreadReminderCount}</span>
                    </p>

                    {reminderError && (
                        <div className="rounded-lg border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error">
                            {reminderError}
                        </div>
                    )}

                    <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                        {reminderLoading ? (
                            <div className="rounded-lg border border-surface-secondary/60 p-4 text-sm text-text-secondary text-center">
                                Memuat reminder...
                            </div>
                        ) : reminders.length === 0 ? (
                            <div className="rounded-lg border border-surface-secondary/60 p-4 text-sm text-text-secondary text-center">
                                Belum ada reminder.
                            </div>
                        ) : (
                            reminders.map((item) => (
                                <div key={item.id} className="rounded-lg border border-surface-secondary/60 bg-surface-secondary/10 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="font-semibold text-text-primary">{item.title || '-'}</div>
                                            <div className="text-xs text-text-secondary mt-1 whitespace-pre-line">
                                                {item.message || '-'}
                                            </div>
                                            <div className="text-[11px] text-text-secondary mt-2">
                                                {formatDateTime(item.reminder_at)}
                                            </div>
                                        </div>
                                        {!item.is_read && (
                                            <button
                                                onClick={() => markReminderRead(item.id)}
                                                disabled={markingReminderId === item.id}
                                                className="rounded-lg border border-surface-secondary px-2 py-1 text-xs font-semibold text-text-primary hover:bg-surface-secondary/20 disabled:opacity-50"
                                            >
                                                Tandai Dibaca
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-6 shadow-sm space-y-4">
                    <div className="flex items-center gap-2">
                        <ShieldAlert size={18} className="text-status-error" />
                        <h2 className="text-lg font-bold text-text-primary">Retensi Data (1 Tahun)</h2>
                    </div>

                    <p className="text-xs text-text-secondary">
                        Gunakan <span className="font-semibold text-text-primary">Dry Run</span> sebelum purge agar tahu jumlah data yang akan dibersihkan.
                    </p>

                    <div className="flex gap-2 flex-wrap">
                        <button
                            onClick={() => runRetention(true)}
                            disabled={retentionLoading}
                            className="rounded-xl border border-surface-secondary px-3 py-2 text-sm text-text-primary hover:bg-surface-secondary/20 disabled:opacity-50"
                        >
                            {retentionLoading ? 'Memproses...' : 'Dry Run'}
                        </button>
                        <button
                            onClick={() => runRetention(false)}
                            disabled={retentionLoading}
                            className="rounded-xl bg-status-error px-3 py-2 text-sm font-semibold text-text-inverse hover:brightness-105 disabled:opacity-50"
                        >
                            {retentionLoading ? 'Memproses...' : 'Jalankan Purge'}
                        </button>
                    </div>

                    {retentionError && (
                        <div className="rounded-lg border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error">
                            {retentionError}
                        </div>
                    )}

                    {retentionResult && (
                        <div className="rounded-xl border border-surface-secondary/60 bg-surface-secondary/10 p-3 text-sm space-y-1">
                            <div className="text-text-secondary">
                                Mode: <span className="font-semibold text-text-primary">{retentionResult.dry_run ? 'Dry Run' : 'Purge'}</span>
                            </div>
                            <div className="text-text-secondary">
                                Cutoff: <span className="font-semibold text-text-primary">{formatDateTime(retentionResult.cutoff)}</span>
                            </div>
                            <div className="text-text-secondary">
                                Data lama: session {retentionResult.old_rows.admin_sessions}, audit {retentionResult.old_rows.audit_logs}
                            </div>
                            <div className="text-text-secondary">
                                Data terhapus: session {retentionResult.purged_rows.admin_sessions}, audit {retentionResult.purged_rows.audit_logs}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="rounded-xl border border-surface-secondary/70 bg-surface-primary p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                    <History size={18} className="text-action" />
                    <h2 className="text-lg font-bold text-text-primary">Riwayat Export</h2>
                </div>

                {exportsError && (
                    <div className="rounded-lg border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error">
                        {exportsError}
                    </div>
                )}

                <div className="overflow-x-auto rounded-xl border border-surface-secondary/60">
                    <table className="min-w-full text-sm">
                        <thead className="bg-surface-secondary/70 text-xs uppercase tracking-wide text-text-secondary">
                            <tr>
                                <th className="px-3 py-2 text-left">Waktu</th>
                                <th className="px-3 py-2 text-left">Tipe</th>
                                <th className="px-3 py-2 text-left">Range</th>
                                <th className="px-3 py-2 text-left">File</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-secondary/50">
                            {exportsLoading ? (
                                <tr>
                                    <td colSpan={4} className="px-3 py-8 text-center text-text-secondary">
                                        Memuat riwayat export...
                                    </td>
                                </tr>
                            ) : exportsHistory.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-3 py-8 text-center text-text-secondary">
                                        Belum ada riwayat export.
                                    </td>
                                </tr>
                            ) : (
                                exportsHistory.map((row) => (
                                    <tr key={row.id} className="hover:bg-surface-secondary/20 transition">
                                        <td className="px-3 py-2 text-text-primary">{formatDateTime(row.created_at)}</td>
                                        <td className="px-3 py-2 text-text-secondary">{row.export_type || '-'}</td>
                                        <td className="px-3 py-2 text-text-secondary">
                                            {row.from_at || row.to_at
                                                ? `${formatDateTime(row.from_at)} - ${formatDateTime(row.to_at)}`
                                                : 'Semua data'}
                                        </td>
                                        <td className="px-3 py-2 text-text-secondary">
                                            <div className="flex flex-wrap gap-2">
                                                {(row.files || []).map((file) => (
                                                    <span
                                                        key={`${row.id}-${file.path}`}
                                                        className="rounded-full border border-action/30 bg-action/10 px-2 py-0.5 text-[11px] text-action"
                                                    >
                                                        {file.key}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
