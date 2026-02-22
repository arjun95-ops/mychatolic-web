"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { CheckCircle2, Download, Eye, Loader2, RefreshCcw, Search, Upload, X, XCircle } from "lucide-react";
import { toast } from "react-hot-toast";
import Modal from "@/components/ui/Modal";

type DonationStatusFilter =
  | "ALL"
  | "PENDING_VERIFICATION"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";

type LatestProof = {
  proof_id?: string | null;
  storage_path?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  uploaded_at?: string | null;
};

type DonationListRow = {
  id: string;
  user_id?: string | null;
  donor_name?: string | null;
  donor_contact?: string | null;
  donor_display_name: string;
  donor_display_contact?: string | null;
  amount: number;
  note?: string | null;
  status?: string | null;
  submitted_at?: string | null;
  verified_at?: string | null;
  verified_by?: string | null;
  verified_by_label?: string | null;
  reject_reason?: string | null;
  latest_proof?: LatestProof | null;
};

type DonationDetailProof = {
  id: string;
  donation_id: string;
  storage_path: string;
  file_type?: string | null;
  file_size?: number | null;
  checksum?: string | null;
  uploaded_by?: string | null;
  uploaded_at?: string | null;
  created_at?: string | null;
  signed_url?: string | null;
  is_pdf?: boolean;
};

type DonationDetailPayload = {
  donation: DonationListRow;
  proofs: DonationDetailProof[];
};

type DonationListResponse = {
  rows: DonationListRow[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
  summary: {
    pending_count: number;
    approved_today_count: number;
    approved_today_amount: number;
    approved_month_count: number;
    approved_month_amount: number;
  };
};

type DonationQrConfig = {
  id: number;
  qr_image_url?: string | null;
  instruction_text?: string | null;
  is_active?: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
};

const PAGE_SIZE = 20;
const MAX_QR_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_QR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

const QUICK_REJECT_REASONS = [
  "Bukti tidak jelas",
  "Nominal tidak sesuai",
  "Bukti bukan transaksi QRIS",
  "Bukti transaksi duplikat",
] as const;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatFileSize(value?: number | null): string {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function statusLabel(status?: string | null): string {
  const normalized = (status || "").toUpperCase();
  if (normalized === "PENDING_VERIFICATION") return "Menunggu verifikasi";
  if (normalized === "APPROVED") return "Disetujui";
  if (normalized === "REJECTED") return "Ditolak";
  if (normalized === "CANCELLED") return "Dibatalkan";
  if (normalized === "EXPIRED") return "Kedaluwarsa";
  return normalized || "-";
}

function statusBadgeClass(status?: string | null): string {
  const normalized = (status || "").toUpperCase();
  if (normalized === "APPROVED") {
    return "bg-status-success/10 text-status-success border-status-success/30";
  }
  if (normalized === "REJECTED") {
    return "bg-status-error/10 text-status-error border-status-error/30";
  }
  if (normalized === "PENDING_VERIFICATION") {
    return "bg-status-pending/10 text-status-pending border-status-pending/30";
  }
  return "bg-surface-secondary text-text-secondary border-surface-secondary";
}

export default function DonationManager() {
  const [rows, setRows] = useState<DonationListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<DonationStatusFilter>("PENDING_VERIFICATION");
  const [searchInput, setSearchInput] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [summary, setSummary] = useState({
    pending_count: 0,
    approved_today_count: 0,
    approved_today_amount: 0,
    approved_month_count: 0,
    approved_month_amount: 0,
  });

  const [pagination, setPagination] = useState({
    page: 1,
    page_size: PAGE_SIZE,
    total: 0,
    total_pages: 1,
  });

  const [selectedDonationId, setSelectedDonationId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DonationDetailPayload | null>(null);

  const [actionLoading, setActionLoading] = useState<"approve" | "reject" | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [qrConfig, setQrConfig] = useState<DonationQrConfig | null>(null);
  const [qrLoading, setQrLoading] = useState(true);
  const [qrSaving, setQrSaving] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrInstruction, setQrInstruction] = useState("");
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);

  const buildQueryParams = useCallback(
    (includePage = true) => {
      const params = new URLSearchParams();
      params.set("status", status);
      if (searchInput.trim()) params.set("q", searchInput.trim());
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (includePage) {
        params.set("page", String(page));
        params.set("page_size", String(PAGE_SIZE));
      }
      return params;
    },
    [status, searchInput, dateFrom, dateTo, page]
  );

  const loadData = useCallback(
    async (silent = false) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const params = buildQueryParams(true);
        const response = await fetch(`/api/admin/donations?${params.toString()}`, {
          cache: "no-store",
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result?.error || `Gagal memuat donasi (${response.status}).`);
        }

        const payload = result as DonationListResponse;
        setRows(Array.isArray(payload.rows) ? payload.rows : []);
        setSummary(
          payload.summary || {
            pending_count: 0,
            approved_today_count: 0,
            approved_today_amount: 0,
            approved_month_count: 0,
            approved_month_amount: 0,
          }
        );
        setPagination(
          payload.pagination || {
            page: 1,
            page_size: PAGE_SIZE,
            total: 0,
            total_pages: 1,
          }
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Gagal memuat data donasi.";
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [buildQueryParams]
  );

  const loadDetail = useCallback(async (donationId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await fetch(`/api/admin/donations/${donationId}`, {
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || `Gagal memuat detail (${response.status}).`);
      }
      setDetail(result as DonationDetailPayload);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal memuat detail donasi.";
      setDetailError(message);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadQrConfig = useCallback(async () => {
    setQrLoading(true);
    setQrError(null);
    try {
      const response = await fetch("/api/admin/donation-qr", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || result?.error || `Gagal memuat konfigurasi QRIS (${response.status}).`);
      }

      const config = (result?.config || null) as DonationQrConfig | null;
      setQrConfig(config);
      setQrInstruction(String(config?.instruction_text || "").trim());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal memuat konfigurasi QRIS.";
      setQrError(message);
    } finally {
      setQrLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  useEffect(() => {
    void loadQrConfig();
  }, [loadQrConfig]);

  useEffect(() => {
    if (!qrFile) {
      setQrPreviewUrl(null);
      return;
    }

    const objectUrl = window.URL.createObjectURL(qrFile);
    setQrPreviewUrl(objectUrl);
    return () => {
      window.URL.revokeObjectURL(objectUrl);
    };
  }, [qrFile]);

  const onApplyFilters = async () => {
    setPage(1);
    await loadData(false);
  };

  const onRefresh = async () => {
    await Promise.all([loadData(true), loadQrConfig()]);
    if (selectedDonationId) {
      await loadDetail(selectedDonationId);
    }
  };

  const openDetail = async (donationId: string) => {
    setSelectedDonationId(donationId);
    setRejectReason("");
    await loadDetail(donationId);
  };

  const closeDetail = () => {
    setSelectedDonationId(null);
    setDetail(null);
    setDetailError(null);
    setRejectReason("");
  };

  const handleApprove = async () => {
    if (!selectedDonationId) return;
    const confirmed = window.confirm("Setujui donasi ini?");
    if (!confirmed) return;

    setActionLoading("approve");
    try {
      const response = await fetch(`/api/admin/donations/${selectedDonationId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || `Gagal approve (${response.status}).`);
      }
      toast.success("Donasi berhasil disetujui.");
      await loadData(true);
      await loadDetail(selectedDonationId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal approve donasi.";
      toast.error(message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!selectedDonationId) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error("Alasan penolakan wajib diisi.");
      return;
    }

    setActionLoading("reject");
    try {
      const response = await fetch(`/api/admin/donations/${selectedDonationId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || `Gagal reject (${response.status}).`);
      }

      toast.success("Donasi berhasil ditolak.");
      await loadData(true);
      await loadDetail(selectedDonationId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal menolak donasi.";
      toast.error(message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleExportCsv = async () => {
    try {
      const params = buildQueryParams(false);
      params.set("format", "csv");

      const response = await fetch(`/api/admin/donations?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || `Gagal export CSV (${response.status}).`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = `donations_${Date.now()}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);

      toast.success("CSV berhasil diunduh.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal export CSV.";
      toast.error(message);
    }
  };

  const handleQrFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null;
    if (!nextFile) {
      setQrFile(null);
      return;
    }

    if (!ALLOWED_QR_MIME_TYPES.includes(nextFile.type)) {
      toast.error("Format file QRIS harus JPG, PNG, atau WEBP.");
      event.target.value = "";
      return;
    }

    if (nextFile.size > MAX_QR_SIZE_BYTES) {
      toast.error("Ukuran file QRIS maksimal 5 MB.");
      event.target.value = "";
      return;
    }

    setQrError(null);
    setQrFile(nextFile);
  };

  const resetQrDraft = () => {
    setQrFile(null);
    setQrError(null);
    setQrInstruction(String(qrConfig?.instruction_text || "").trim());
  };

  const handleSaveQrConfig = async () => {
    const nextInstruction = qrInstruction.trim();
    const currentInstruction = String(qrConfig?.instruction_text || "").trim();
    const hasInstructionChange = nextInstruction.length > 0 && nextInstruction !== currentInstruction;

    if (!qrFile && !hasInstructionChange) {
      toast.error("Tidak ada perubahan untuk disimpan.");
      return;
    }

    setQrSaving(true);
    setQrError(null);
    try {
      const payload = new FormData();
      if (qrFile) payload.append("file", qrFile);
      if (hasInstructionChange) payload.append("instruction_text", nextInstruction);

      const response = await fetch("/api/admin/donation-qr", {
        method: "PUT",
        body: payload,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || result?.error || `Gagal menyimpan QRIS (${response.status}).`);
      }

      const nextConfig = (result?.config || null) as DonationQrConfig | null;
      setQrConfig(nextConfig);
      setQrInstruction(String(nextConfig?.instruction_text || "").trim());
      setQrFile(null);
      toast.success("Konfigurasi QRIS berhasil diperbarui.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal menyimpan konfigurasi QRIS.";
      setQrError(message);
      toast.error(message);
    } finally {
      setQrSaving(false);
    }
  };

  const canGoPrev = pagination.page > 1;
  const canGoNext = pagination.page < pagination.total_pages;
  const activeQrImage = (qrPreviewUrl || qrConfig?.qr_image_url || "").trim();

  return (
    <div className="space-y-6 p-6 pb-16">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Donasi Masuk</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Verifikasi donasi QRIS dengan bukti pembayaran dari pengguna.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm font-semibold text-text-primary hover:bg-surface-secondary"
          >
            {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
            Refresh
          </button>
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-action/20 bg-action/10 px-3 py-2 text-sm font-semibold text-action hover:bg-action/20"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-surface-secondary bg-surface-primary p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-text-primary">Konfigurasi QRIS Donasi</h2>
            <p className="text-xs text-text-secondary">
              Ganti QRIS yang tampil di aplikasi tanpa harus update app.
            </p>
          </div>
          {qrConfig?.updated_at ? (
            <p className="text-xs text-text-secondary">Terakhir update: {formatDateTime(qrConfig.updated_at)}</p>
          ) : null}
        </div>

        {qrLoading ? (
          <div className="flex min-h-[180px] items-center justify-center gap-2 text-sm text-text-secondary">
            <Loader2 size={16} className="animate-spin" />
            Memuat konfigurasi QRIS...
          </div>
        ) : (
          <div className="mt-4 grid gap-4 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <div className="rounded-xl border border-surface-secondary bg-surface-secondary/30 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Preview QRIS</p>
                {activeQrImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeQrImage}
                    alt="Preview QRIS donasi"
                    className="w-full rounded-lg border border-surface-secondary object-contain"
                  />
                ) : (
                  <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-surface-secondary bg-surface-primary text-xs text-text-secondary">
                    Belum ada QRIS aktif.
                  </div>
                )}
                {qrFile ? (
                  <p className="mt-2 text-xs font-medium text-action">Preview menampilkan file baru yang dipilih.</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-3 xl:col-span-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Upload File QRIS
                </label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  onChange={handleQrFileChange}
                  disabled={qrSaving}
                  className="block w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-action/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-action"
                />
                <p className="mt-1 text-xs text-text-secondary">Format: JPG/PNG/WEBP, maksimal 5 MB.</p>
                {qrFile ? (
                  <div className="mt-2 flex items-center justify-between rounded-lg border border-action/20 bg-action/5 px-3 py-2 text-xs text-text-primary">
                    <span className="truncate pr-2">
                      {qrFile.name} ({formatFileSize(qrFile.size)})
                    </span>
                    <button
                      type="button"
                      onClick={() => setQrFile(null)}
                      className="inline-flex items-center gap-1 rounded-md border border-surface-secondary px-2 py-1 text-text-secondary hover:bg-surface-secondary"
                    >
                      <X size={12} />
                      Hapus
                    </button>
                  </div>
                ) : null}
              </div>

              <label>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Instruksi di Aplikasi
                </span>
                <textarea
                  value={qrInstruction}
                  onChange={(event) => setQrInstruction(event.target.value)}
                  placeholder="Instruksi proses donasi untuk user app..."
                  rows={4}
                  disabled={qrSaving}
                  className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm focus:border-action focus:outline-none"
                />
              </label>

              {qrError ? (
                <div className="rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
                  {qrError}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void handleSaveQrConfig()}
                  disabled={qrSaving}
                  className="inline-flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-text-inverse hover:bg-action/90 disabled:opacity-60"
                >
                  {qrSaving ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  Simpan Konfigurasi QRIS
                </button>
                <button
                  onClick={resetQrDraft}
                  disabled={qrSaving}
                  className="rounded-lg border border-surface-secondary px-4 py-2 text-sm font-semibold text-text-primary hover:bg-surface-secondary disabled:opacity-60"
                >
                  Reset Draft
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-surface-secondary bg-surface-primary p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Pending</p>
          <p className="mt-2 text-2xl font-bold text-status-pending">{summary.pending_count}</p>
        </div>
        <div className="rounded-xl border border-surface-secondary bg-surface-primary p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Approved Hari Ini</p>
          <p className="mt-2 text-xl font-bold text-status-success">{formatCurrency(summary.approved_today_amount)}</p>
          <p className="mt-1 text-xs text-text-secondary">{summary.approved_today_count} donasi</p>
        </div>
        <div className="rounded-xl border border-surface-secondary bg-surface-primary p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Approved Bulan Ini</p>
          <p className="mt-2 text-xl font-bold text-status-success">{formatCurrency(summary.approved_month_amount)}</p>
          <p className="mt-1 text-xs text-text-secondary">{summary.approved_month_count} donasi</p>
        </div>
        <div className="rounded-xl border border-surface-secondary bg-surface-primary p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Total Tampil</p>
          <p className="mt-2 text-2xl font-bold text-text-primary">{pagination.total}</p>
        </div>
      </section>

      <section className="rounded-xl border border-surface-secondary bg-surface-primary p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="xl:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Cari Donatur / Kontak / Nominal
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Contoh: Budi, 50000"
                className="w-full rounded-lg border border-surface-secondary bg-surface-primary py-2 pl-9 pr-3 text-sm focus:border-action focus:outline-none"
              />
            </div>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">Status</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as DonationStatusFilter);
                setPage(1);
              }}
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm focus:border-action focus:outline-none"
            >
              <option value="PENDING_VERIFICATION">Pending Verification</option>
              <option value="ALL">Semua Status</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">Tanggal Dari</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm focus:border-action focus:outline-none"
            />
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">Tanggal Sampai</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm focus:border-action focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={onApplyFilters}
            className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-text-inverse hover:bg-action/90"
          >
            Terapkan Filter
          </button>
          <button
            onClick={() => {
              setStatus("PENDING_VERIFICATION");
              setSearchInput("");
              setDateFrom("");
              setDateTo("");
              setPage(1);
              void loadData(false);
            }}
            className="rounded-lg border border-surface-secondary px-4 py-2 text-sm font-semibold text-text-primary hover:bg-surface-secondary"
          >
            Reset
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-surface-secondary bg-surface-primary">
        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center gap-2 text-text-secondary">
            <Loader2 size={18} className="animate-spin" />
            Memuat donasi...
          </div>
        ) : error ? (
          <div className="p-5 text-sm text-status-error">{error}</div>
        ) : rows.length === 0 ? (
          <div className="p-5 text-sm text-text-secondary">Tidak ada data donasi untuk filter ini.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-surface-secondary text-sm">
                <thead className="bg-surface-secondary/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-text-secondary">Donatur</th>
                    <th className="px-4 py-3 text-right font-semibold text-text-secondary">Nominal</th>
                    <th className="px-4 py-3 text-left font-semibold text-text-secondary">Submit</th>
                    <th className="px-4 py-3 text-left font-semibold text-text-secondary">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-text-secondary">Bukti</th>
                    <th className="px-4 py-3 text-right font-semibold text-text-secondary">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-secondary">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-surface-secondary/40">
                      <td className="px-4 py-3 align-top">
                        <p className="font-semibold text-text-primary">{row.donor_display_name}</p>
                        <p className="text-xs text-text-secondary">{row.donor_display_contact || "-"}</p>
                        <p className="mt-1 text-[11px] text-text-secondary">ID: {row.id.slice(0, 8)}...</p>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-text-primary align-top">
                        {formatCurrency(row.amount)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary align-top">
                        {formatDateTime(row.submitted_at)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
                            row.status
                          )}`}
                        >
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-text-secondary">
                        {row.latest_proof?.proof_id ? "Ada" : "Belum ada"}
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        <button
                          onClick={() => void openDetail(row.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-action/30 px-3 py-1.5 text-xs font-semibold text-action hover:bg-action/10"
                        >
                          <Eye size={14} />
                          Lihat Bukti
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-surface-secondary px-4 py-3 text-sm">
              <p className="text-text-secondary">
                Halaman {pagination.page} dari {pagination.total_pages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!canGoPrev) return;
                    setPage((current) => Math.max(1, current - 1));
                  }}
                  disabled={!canGoPrev}
                  className="rounded-lg border border-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-primary disabled:opacity-40"
                >
                  Sebelumnya
                </button>
                <button
                  onClick={() => {
                    if (!canGoNext) return;
                    setPage((current) => current + 1);
                  }}
                  disabled={!canGoNext}
                  className="rounded-lg border border-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-primary disabled:opacity-40"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <Modal
        isOpen={Boolean(selectedDonationId)}
        onClose={closeDetail}
        title="Detail Donasi"
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-8 text-text-secondary">
            <Loader2 size={18} className="animate-spin" />
            <span className="ml-2">Memuat detail...</span>
          </div>
        ) : detailError ? (
          <div className="rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
            {detailError}
          </div>
        ) : !detail ? (
          <p className="text-sm text-text-secondary">Detail belum tersedia.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl border border-surface-secondary bg-surface-secondary/40 p-3 text-sm">
              <div>
                <p className="text-xs text-text-secondary">Donatur</p>
                <p className="font-semibold text-text-primary">{detail.donation.donor_display_name}</p>
                <p className="text-xs text-text-secondary">{detail.donation.donor_display_contact || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Nominal</p>
                <p className="text-base font-bold text-text-primary">{formatCurrency(detail.donation.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Status</p>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
                    detail.donation.status
                  )}`}
                >
                  {statusLabel(detail.donation.status)}
                </span>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Diajukan</p>
                <p className="font-medium text-text-primary">{formatDateTime(detail.donation.submitted_at)}</p>
              </div>
              {detail.donation.verified_at ? (
                <div>
                  <p className="text-xs text-text-secondary">Diverifikasi</p>
                  <p className="font-medium text-text-primary">
                    {formatDateTime(detail.donation.verified_at)}
                    {detail.donation.verified_by_label ? ` oleh ${detail.donation.verified_by_label}` : ""}
                  </p>
                </div>
              ) : null}
              {detail.donation.note ? (
                <div>
                  <p className="text-xs text-text-secondary">Catatan Donatur</p>
                  <p className="text-text-primary">{detail.donation.note}</p>
                </div>
              ) : null}
              {detail.donation.reject_reason ? (
                <div>
                  <p className="text-xs text-text-secondary">Alasan Reject Terakhir</p>
                  <p className="text-status-error font-medium">{detail.donation.reject_reason}</p>
                </div>
              ) : null}
            </div>

            <div>
              <h4 className="text-sm font-bold text-text-primary">Bukti Pembayaran</h4>
              {detail.proofs.length === 0 ? (
                <p className="mt-2 text-sm text-text-secondary">Belum ada bukti terunggah.</p>
              ) : (
                <div className="mt-2 max-h-[320px] space-y-3 overflow-y-auto pr-1">
                  {detail.proofs.map((proof) => (
                    <div
                      key={proof.id}
                      className="rounded-xl border border-surface-secondary bg-surface-primary p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-text-secondary">
                        <span>{formatDateTime(proof.uploaded_at)}</span>
                        <span>{proof.file_type || "-"}</span>
                      </div>

                      {proof.signed_url ? (
                        proof.is_pdf ? (
                          <a
                            href={proof.signed_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-lg border border-action/20 bg-action/10 px-3 py-2 text-xs font-semibold text-action hover:bg-action/20"
                          >
                            Buka PDF Bukti
                          </a>
                        ) : (
                          <a href={proof.signed_url} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={proof.signed_url}
                              alt="Bukti pembayaran"
                              className="max-h-64 w-full rounded-lg object-contain"
                            />
                          </a>
                        )
                      ) : (
                        <p className="text-xs text-status-error">Gagal membuat signed URL bukti.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-surface-secondary bg-surface-secondary/40 p-3">
              <p className="mb-2 text-sm font-semibold text-text-primary">Aksi Verifikasi</p>

              <div className="flex flex-wrap gap-2">
                {QUICK_REJECT_REASONS.map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setRejectReason(reason)}
                    className="rounded-full border border-surface-secondary px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-secondary"
                  >
                    {reason}
                  </button>
                ))}
              </div>

              <textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Alasan penolakan (wajib untuk reject)..."
                rows={3}
                className="mt-2 w-full rounded-lg border border-surface-secondary bg-surface-primary px-3 py-2 text-sm focus:border-action focus:outline-none"
              />

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <button
                  onClick={() => void handleApprove()}
                  disabled={actionLoading != null}
                  className="inline-flex items-center gap-2 rounded-lg bg-status-success px-3 py-2 text-sm font-semibold text-text-inverse hover:bg-status-success/90 disabled:opacity-60"
                >
                  {actionLoading === "approve" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  Approve
                </button>
                <button
                  onClick={() => void handleReject()}
                  disabled={actionLoading != null}
                  className="inline-flex items-center gap-2 rounded-lg bg-status-error px-3 py-2 text-sm font-semibold text-text-inverse hover:bg-status-error/90 disabled:opacity-60"
                >
                  {actionLoading === "reject" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <XCircle size={16} />
                  )}
                  Reject
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
