export const ADMIN_ROLES = ["super_admin", "admin_ops"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_STATUSES = ["pending_approval", "approved", "suspended"] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];

export const RETENTION_DAYS = 365;
export const DEFAULT_TIMEZONE = "Asia/Jakarta";
export const BACKUP_BUCKET = "admin-backups";

export function normalizeLower(value: unknown): string {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

export function parseAdminRole(value: unknown): AdminRole | null {
  const normalized = normalizeLower(value);
  if ((ADMIN_ROLES as readonly string[]).includes(normalized)) {
    return normalized as AdminRole;
  }
  return null;
}

export function parseAdminStatus(value: unknown): AdminStatus | null {
  const normalized = normalizeLower(value);
  if ((ADMIN_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as AdminStatus;
  }
  return null;
}

export function safeTimeZone(value: unknown, fallback = DEFAULT_TIMEZONE): string {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format(new Date());
    return normalized;
  } catch {
    return fallback;
  }
}
