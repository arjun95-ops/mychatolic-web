export const VERIFIED_STATUSES = [
  'verified',
  'approved',
  // Legacy values kept for backward compatibility when reading old snapshots.
  'verified_catholic',
  'verified_pastoral',
] as const;

export type VerificationCategory =
  | 'verified'
  | 'pending'
  | 'rejected'
  | 'banned'
  | 'unverified';

const CLERGY_ROLES = new Set(['pastor', 'suster', 'bruder', 'frater']);

type OptionalName = {
  name?: string | null;
};

export interface VerificationUserLike {
  account_status?: string | null;
  verification_status?: string | null;
  role?: string | null;
  is_catechumen?: boolean | null;
  faith_status?: string | null;
  faith_verification_consent_at?: string | null;
  country?: string | null;
  diocese?: string | null;
  parish?: string | null;
  countries?: OptionalName | null;
  dioceses?: OptionalName | null;
  churches?: OptionalName | null;
  selfie_url?: string | null;
  verification_video_url?: string | null;
  ktp_url?: string | null;
  verification_ktp_url?: string | null;
  verification_document_url?: string | null;
  baptism_cert_url?: string | null;
  baptism_certificate_url?: string | null;
  baptism_document_url?: string | null;
  chrism_cert_url?: string | null;
  chrism_document_url?: string | null;
  assignment_letter_url?: string | null;
  task_letter_url?: string | null;
}

export interface VerificationDocuments {
  selfie: string | null;
  identity: string | null;
  baptism: string | null;
  chrism: string | null;
  assignment: string | null;
}

function normalize(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().toLowerCase();
}

function looksLikeUuid(value: string): boolean {
  const v = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function normalizeLocationName(value: unknown): string {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (looksLikeUuid(raw)) return '';
  if (raw.toLowerCase() === 'null' || raw.toLowerCase() === 'undefined') return '';
  return raw;
}

export function getUserStatus(user?: VerificationUserLike | null): string {
  return (
    normalize(user?.account_status) ||
    normalize(user?.verification_status) ||
    'unverified'
  );
}

export function isVerifiedStatus(status: string): boolean {
  return VERIFIED_STATUSES.includes(status as (typeof VERIFIED_STATUSES)[number]);
}

export function statusCategory(status: string): VerificationCategory {
  const normalized = normalize(status) || 'unverified';
  if (isVerifiedStatus(normalized)) return 'verified';
  if (normalized === 'pending') return 'pending';
  if (normalized === 'rejected') return 'rejected';
  if (normalized === 'banned') return 'banned';
  return 'unverified';
}

export function isClergyRole(role: string | null | undefined): boolean {
  return CLERGY_ROLES.has(normalize(role));
}

export function isCatechumenUser(user?: VerificationUserLike | null): boolean {
  return Boolean(user?.is_catechumen) || normalize(user?.faith_status) === 'catechumen';
}

export function approvedStatusForUser(user?: VerificationUserLike | null): string {
  void user;
  return 'verified';
}

export function normalizeProfileLocation<T extends VerificationUserLike>(user: T): T & {
  country: string;
  diocese: string;
  parish: string;
} {
  const joinedCountry = normalizeLocationName(user.countries?.name);
  const joinedDiocese = normalizeLocationName(user.dioceses?.name);
  const joinedParish = normalizeLocationName(user.churches?.name);
  const legacyCountry = normalizeLocationName(user.country);
  const legacyDiocese = normalizeLocationName(user.diocese);
  const legacyParish = normalizeLocationName(user.parish);

  return {
    ...user,
    country: joinedCountry || legacyCountry || '',
    diocese: joinedDiocese || legacyDiocese || '',
    parish: joinedParish || legacyParish || '',
  };
}

export function getVerificationDocuments(user?: VerificationUserLike | null): VerificationDocuments {
  return {
    selfie: user?.selfie_url || user?.verification_video_url || null,
    identity:
      user?.ktp_url ||
      user?.verification_ktp_url ||
      user?.verification_document_url ||
      null,
    baptism:
      user?.baptism_cert_url ||
      user?.baptism_certificate_url ||
      user?.baptism_document_url ||
      null,
    chrism: user?.chrism_cert_url || user?.chrism_document_url || null,
    assignment: user?.assignment_letter_url || user?.task_letter_url || null,
  };
}
