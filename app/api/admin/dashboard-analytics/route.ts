// import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server"; // Added NextRequest
import { requireApprovedAdmin } from "@/lib/admin-guard"; // Added guard
import { addDays, format, startOfMonth, subDays, subMonths } from "date-fns";
import { isVerifiedStatus } from "@/lib/verification-status";

export const dynamic = "force-dynamic";

type RangePreset = "1d" | "7d" | "30d" | "12m" | "custom";
type Granularity = "day" | "month";
type LocationScope = "country" | "diocese" | "church";
type LocationMode = "top" | "all";
type LocationMetric = "total" | "active";

type ProfileRow = {
  id: string;
  full_name?: string | null;
  role?: string | null;
  is_catechumen?: boolean | null;
  user_category?: string | null;
  account_status?: string | null;
  verification_status?: string | null;
  country_id?: string | null;
  diocese_id?: string | null;
  church_id?: string | null;
  is_online?: boolean | null;
  last_seen?: string | null;
  last_active?: string | null;
};

type ReportRow = {
  status?: string | null;
  created_at?: string | null;
};

type ActivityRow = {
  user_id?: string | null;
  activity_date?: string | null;
};

type CountryRow = { id: string; name: string };
type DioceseRow = { id: string; name: string; country_id: string | null };
type ChurchRow = { id: string; name: string; diocese_id: string | null };
type PastoralPerson = {
  id: string;
  name: string;
  country_name: string;
  diocese_name: string;
  church_name: string;
};

const DEFAULT_TZ = "Asia/Jakarta";
const REQUIRED_ROLES = ["pastor", "suster", "bruder", "frater", "katekis", "umat"] as const;
const REQUIRED_STATUSES = ["verified", "pending", "unverified", "rejected", "banned"] as const;
const PASTORAL_ROLE_ORDER = ["pastor", "suster", "bruder", "frater"] as const;
const RANGE_PRESETS: RangePreset[] = ["1d", "7d", "30d", "12m", "custom"];

function normalize(value: unknown): string {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

function safeTimeZone(value: string | null): string {
  if (!value) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return DEFAULT_TZ;
  }
}

function getTzDateParts(date: Date, timeZone: string): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  let year = "";
  let month = "";
  let day = "";

  for (const part of parts) {
    if (part.type === "year") year = part.value;
    if (part.type === "month") month = part.value;
    if (part.type === "day") day = part.value;
  }

  return { year, month, day };
}

function toDayKey(date: Date, timeZone: string): string {
  const { year, month, day } = getTzDateParts(date, timeZone);
  return `${year}-${month}-${day}`;
}

function toDayLabel(dayKey: string, timeZone: string): string {
  const safeDate = new Date(`${dayKey}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("id-ID", {
    timeZone,
    day: "2-digit",
    month: "short",
  }).format(safeDate);
}

function toMonthLabel(monthKey: string, timeZone: string): string {
  const safeDate = new Date(`${monthKey}-15T12:00:00.000Z`);
  return new Intl.DateTimeFormat("id-ID", {
    timeZone,
    month: "short",
    year: "2-digit",
  }).format(safeDate);
}

function isDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDayKey(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

function normalizeDayKey(value: unknown, timeZone: string): string {
  if (!value) return "";

  if (typeof value === "string") {
    if (isDayKey(value)) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return toDayKey(parsed, timeZone);
    return "";
  }

  try {
    const parsed = new Date(value as Date);
    if (Number.isNaN(parsed.getTime())) return "";
    return toDayKey(parsed, timeZone);
  } catch {
    return "";
  }
}

function dayDiffInclusive(startDayKey: string, endDayKey: string): number {
  const start = parseDayKey(startDayKey).getTime();
  const end = parseDayKey(endDayKey).getTime();
  const diff = Math.floor((end - start) / (24 * 60 * 60 * 1000));
  return Math.max(1, diff + 1);
}

function listDayKeys(startDayKey: string, endDayKey: string): string[] {
  const keys: string[] = [];
  let cursor = parseDayKey(startDayKey);
  const end = parseDayKey(endDayKey);

  while (cursor.getTime() <= end.getTime()) {
    keys.push(format(cursor, "yyyy-MM-dd"));
    cursor = addDays(cursor, 1);
  }

  return keys;
}

function listMonthKeys(startDayKey: string, endDayKey: string): string[] {
  const startMonth = startDayKey.slice(0, 7);
  const endMonth = endDayKey.slice(0, 7);

  const [startYearRaw, startMonthRaw] = startMonth.split("-");
  const [endYearRaw, endMonthRaw] = endMonth.split("-");

  let year = Number(startYearRaw);
  let month = Number(startMonthRaw);
  const endYear = Number(endYearRaw);
  const endMonthNum = Number(endMonthRaw);

  const months: string[] = [];

  while (year < endYear || (year === endYear && month <= endMonthNum)) {
    months.push(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return months;
}

function resolveRangePreset(value: string | null): RangePreset {
  if (!value) return "30d";
  if (RANGE_PRESETS.includes(value as RangePreset)) return value as RangePreset;
  return "30d";
}

function resolvePeriod({
  rangeInput,
  fromInput,
  toInput,
  now,
  timeZone,
}: {
  rangeInput: string | null;
  fromInput: string | null;
  toInput: string | null;
  now: Date;
  timeZone: string;
}): {
  range: RangePreset;
  startDayKey: string;
  endDayKey: string;
  granularity: Granularity;
  todayKey: string;
} {
  let range = resolveRangePreset(rangeInput);
  const todayKey = toDayKey(now, timeZone);
  let startDayKey = todayKey;
  let endDayKey = todayKey;
  let granularity: Granularity = "day";

  if (range === "1d") {
    startDayKey = todayKey;
  } else if (range === "7d") {
    startDayKey = toDayKey(subDays(now, 6), timeZone);
  } else if (range === "30d") {
    startDayKey = toDayKey(subDays(now, 29), timeZone);
  } else if (range === "12m") {
    startDayKey = toDayKey(startOfMonth(subMonths(now, 11)), timeZone);
    granularity = "month";
  } else {
    const from = fromInput && isDayKey(fromInput) ? fromInput : "";
    const to = toInput && isDayKey(toInput) ? toInput : "";

    if (!from && !to) {
      range = "30d";
      startDayKey = toDayKey(subDays(now, 29), timeZone);
      endDayKey = todayKey;
    } else {
      startDayKey = from || to;
      endDayKey = to || from;
    }

    if (startDayKey > endDayKey) {
      const tmp = startDayKey;
      startDayKey = endDayKey;
      endDayKey = tmp;
    }

    const days = dayDiffInclusive(startDayKey, endDayKey);
    granularity = days > 120 ? "month" : "day";
  }

  return { range, startDayKey, endDayKey, granularity, todayKey };
}

function deriveStatus(user: Pick<ProfileRow, "account_status" | "verification_status">):
  | "verified"
  | "pending"
  | "unverified"
  | "rejected"
  | "banned" {
  const account = normalize(user.account_status);
  const verification = normalize(user.verification_status);

  if (account === "banned") return "banned";
  if (account === "rejected" || verification === "rejected") return "rejected";
  if (isVerifiedStatus(verification) || account === "verified") return "verified";
  if (account === "pending" || verification === "pending") return "pending";
  return "unverified";
}

function deriveRole(user: Pick<ProfileRow, "role">): (typeof REQUIRED_ROLES)[number] {
  const role = normalize(user.role);
  if (role === "catechist") return "katekis";
  if (role === "katekis") return "katekis";
  if (role === "pastor") return "pastor";
  if (role === "suster") return "suster";
  if (role === "bruder") return "bruder";
  if (role === "frater") return "frater";
  return "umat";
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function resolveLocationScope(value: string | null): LocationScope {
  if (value === "diocese" || value === "church") return value;
  return "country";
}

function resolveLocationMode(value: string | null): LocationMode {
  if (value === "all") return "all";
  return "top";
}

function resolveLocationMetric(value: string | null): LocationMetric {
  if (value === "active") return "active";
  return "total";
}

function pickTopOrPaginate<T>({
  items,
  mode,
  limit,
  page,
}: {
  items: T[];
  mode: LocationMode;
  limit: number;
  page: number;
}): { page: number; limit: number; totalPages: number; totalItems: number; pagedItems: T[] } {
  const totalItems = items.length;

  if (mode === "top") {
    const take = Math.max(1, Math.min(limit, 100));
    return {
      page: 1,
      limit: take,
      totalPages: 1,
      totalItems,
      pagedItems: items.slice(0, take),
    };
  }

  const safeLimit = Math.max(1, Math.min(limit, 100));
  const totalPages = Math.max(1, Math.ceil(totalItems / safeLimit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit;

  return {
    page: safePage,
    limit: safeLimit,
    totalPages,
    totalItems,
    pagedItems: items.slice(from, to),
  };
}

export async function GET(req: NextRequest) {
  // 1. Guard: Authentication & Authorization
  const ctx = await requireApprovedAdmin(req);

  if (ctx instanceof NextResponse) {
    return ctx;
  }

  const { supabaseAdminClient: supabase, setCookiesToResponse } = ctx;

  const reply = (body: any, init?: any) => {
    const res = NextResponse.json(body, init);
    setCookiesToResponse(res);
    return res;
  };



  try {
    const { searchParams } = req.nextUrl;

    const timeZone = safeTimeZone(searchParams.get("tz"));
    const now = new Date();

    const period = resolvePeriod({
      rangeInput: searchParams.get("range"),
      fromInput: searchParams.get("from"),
      toInput: searchParams.get("to"),
      now,
      timeZone,
    });

    const locationScope = resolveLocationScope(searchParams.get("location_scope"));
    const locationMode = resolveLocationMode(searchParams.get("mode"));
    const locationMetric = resolveLocationMetric(searchParams.get("location_metric"));
    const locationParentId = searchParams.get("location_id") || "";
    const locationQuery = normalize(searchParams.get("location_q"));
    const locationLimit = parsePositiveInt(searchParams.get("limit"), locationMode === "top" ? 10 : 25);
    const locationPage = parsePositiveInt(searchParams.get("page"), 1);

    const lastYearStart = toDayKey(subMonths(now, 12), timeZone);
    const activityQueryStart = lastYearStart < period.startDayKey ? lastYearStart : period.startDayKey;

    const [
      { data: countriesData, error: countriesError },
      { data: diocesesData, error: diocesesError },
      { data: churchesData, error: churchesError },
      { count: articlesCount, error: articlesError },
      { data: profilesData, error: profilesError },
      { data: reportsData, error: reportsError },
      { data: activityData, error: activityError },
    ] = await Promise.all([
      supabase.from("countries").select("id, name").order("name"),
      supabase.from("dioceses").select("id, name, country_id").order("name"),
      supabase.from("churches").select("id, name, diocese_id").order("name"),
      supabase.from("articles").select("id", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select(
          "id, full_name, role, is_catechumen, user_category, account_status, verification_status, country_id, diocese_id, church_id, is_online, last_seen, last_active"
        ),
      supabase.from("reports").select("status, created_at").order("created_at", { ascending: true }),
      supabase
        .from("user_daily_activity")
        .select("user_id, activity_date")
        .gte("activity_date", activityQueryStart)
        .lte("activity_date", period.endDayKey)
        .order("activity_date", { ascending: true }),
    ]);

    if (countriesError) throw countriesError;
    if (diocesesError) throw diocesesError;
    if (churchesError) throw churchesError;
    if (profilesError) throw profilesError;

    if (articlesError && articlesError.code !== "42P01") {
      throw articlesError;
    }

    if (reportsError && reportsError.code !== "42P01") {
      throw reportsError;
    }

    if (activityError && activityError.code !== "42P01") {
      throw activityError;
    }

    const countries = (countriesData || []) as CountryRow[];
    const dioceses = (diocesesData || []) as DioceseRow[];
    const churches = (churchesData || []) as ChurchRow[];
    const profiles = (profilesData || []) as ProfileRow[];
    const reports = (reportsData || []) as ReportRow[];
    const activities = (activityData || []) as ActivityRow[];

    const countryNameById = new Map(countries.map((c) => [String(c.id), c.name]));
    const dioceseNameById = new Map(dioceses.map((d) => [String(d.id), d.name]));
    const churchNameById = new Map(churches.map((c) => [String(c.id), c.name]));
    const dioceseCountryIdById = new Map(
      dioceses.map((d) => [String(d.id), d.country_id ? String(d.country_id) : ""])
    );
    const churchDioceseIdById = new Map(
      churches.map((c) => [String(c.id), c.diocese_id ? String(c.diocese_id) : ""])
    );

    const roleCountMap: Record<(typeof REQUIRED_ROLES)[number], number> = {
      pastor: 0,
      suster: 0,
      bruder: 0,
      frater: 0,
      katekis: 0,
      umat: 0,
    };

    const statusCountMap: Record<(typeof REQUIRED_STATUSES)[number], number> = {
      verified: 0,
      pending: 0,
      unverified: 0,
      rejected: 0,
      banned: 0,
    };

    const categoryMap: Record<string, number> = {};
    const countryUserCountMap: Record<string, number> = {};
    const dioceseUserCountMap: Record<string, number> = {};
    const churchUserCountMap: Record<string, number> = {};
    const activeCountryUserCountMap: Record<string, number> = {};
    const activeDioceseUserCountMap: Record<string, number> = {};
    const activeChurchUserCountMap: Record<string, number> = {};
    const pastoralPeopleMap: Record<(typeof PASTORAL_ROLE_ORDER)[number], PastoralPerson[]> = {
      pastor: [],
      suster: [],
      bruder: [],
      frater: [],
    };
    const pastoralPeopleSeenMap: Record<(typeof PASTORAL_ROLE_ORDER)[number], Set<string>> = {
      pastor: new Set<string>(),
      suster: new Set<string>(),
      bruder: new Set<string>(),
      frater: new Set<string>(),
    };

    let usersOnlineNow = 0;

    for (const profile of profiles) {
      const status = deriveStatus(profile);
      const role = deriveRole(profile);

      roleCountMap[role] += 1;
      statusCountMap[status] += 1;

      if ((PASTORAL_ROLE_ORDER as readonly string[]).includes(role)) {
        const pastoralRole = role as (typeof PASTORAL_ROLE_ORDER)[number];
        const userId = String(profile.id);
        const directCountryId = profile.country_id ? String(profile.country_id) : "";
        const directDioceseId = profile.diocese_id ? String(profile.diocese_id) : "";
        const directChurchId = profile.church_id ? String(profile.church_id) : "";
        const resolvedDioceseId =
          directDioceseId || (directChurchId ? churchDioceseIdById.get(directChurchId) || "" : "");
        const resolvedCountryId =
          directCountryId || (resolvedDioceseId ? dioceseCountryIdById.get(resolvedDioceseId) || "" : "");

        if (!pastoralPeopleSeenMap[pastoralRole].has(userId)) {
          pastoralPeopleSeenMap[pastoralRole].add(userId);
          pastoralPeopleMap[pastoralRole].push({
            id: userId,
            name: (profile.full_name || "").trim() || `User-${userId.slice(0, 8)}`,
            country_name: resolvedCountryId
              ? countryNameById.get(resolvedCountryId) || "Belum diisi"
              : "Belum diisi",
            diocese_name: resolvedDioceseId
              ? dioceseNameById.get(resolvedDioceseId) || "Belum diisi"
              : "Belum diisi",
            church_name: directChurchId ? churchNameById.get(directChurchId) || "Belum diisi" : "Belum diisi",
          });
        }
      }

      const category = (profile.user_category || "Tanpa Kategori").trim();
      categoryMap[category] = (categoryMap[category] || 0) + 1;

      if (profile.country_id) {
        const countryId = String(profile.country_id);
        countryUserCountMap[countryId] = (countryUserCountMap[countryId] || 0) + 1;
      }

      if (profile.diocese_id) {
        const dioceseId = String(profile.diocese_id);
        dioceseUserCountMap[dioceseId] = (dioceseUserCountMap[dioceseId] || 0) + 1;
      }

      if (profile.church_id) {
        const churchId = String(profile.church_id);
        churchUserCountMap[churchId] = (churchUserCountMap[churchId] || 0) + 1;
      }

      if (profile.is_online === true) {
        usersOnlineNow += 1;
      }
    }

    const roles = REQUIRED_ROLES.map((role) => ({ role, count: roleCountMap[role] }));
    const verification_status = REQUIRED_STATUSES.map((status) => ({
      status,
      count: statusCountMap[status],
    }));

    const user_categories = Object.entries(categoryMap)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

    const pastoral_roles_detail = PASTORAL_ROLE_ORDER.map((role) => ({
      role,
      count: roleCountMap[role],
      people: pastoralPeopleMap[role]
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((person) => ({
          id: person.id,
          name: person.name,
          country_name: person.country_name,
          diocese_name: person.diocese_name,
          church_name: person.church_name,
        })),
    }));

    const reportStatusMap: Record<string, number> = {};
    const reportDayCountMap: Record<string, number> = {};

    for (const report of reports) {
      const status = normalize(report.status) || "unknown";
      reportStatusMap[status] = (reportStatusMap[status] || 0) + 1;

      const dayKey = normalizeDayKey(report.created_at, timeZone);
      if (!dayKey) continue;
      if (dayKey < period.startDayKey || dayKey > period.endDayKey) continue;
      reportDayCountMap[dayKey] = (reportDayCountMap[dayKey] || 0) + 1;
    }

    const report_status = Object.entries(reportStatusMap)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));

    const dayUsersMap = new Map<string, Set<string>>();
    let activitySource: "user_daily_activity" | "profiles_last_active" = "user_daily_activity";

    if (activities.length > 0) {
      for (const activity of activities) {
        const dayKey = normalizeDayKey(activity.activity_date, timeZone);
        if (!dayKey) continue;
        const userId = activity.user_id ? String(activity.user_id) : "";
        if (!userId) continue;

        let users = dayUsersMap.get(dayKey);
        if (!users) {
          users = new Set<string>();
          dayUsersMap.set(dayKey, users);
        }
        users.add(userId);
      }
    } else {
      activitySource = "profiles_last_active";
      for (const profile of profiles) {
        const ts = profile.last_active || profile.last_seen;
        const dayKey = normalizeDayKey(ts, timeZone);
        if (!dayKey) continue;
        const userId = String(profile.id);

        let users = dayUsersMap.get(dayKey);
        if (!users) {
          users = new Set<string>();
          dayUsersMap.set(dayKey, users);
        }
        users.add(userId);
      }
    }

    const activeDayCountMap: Record<string, number> = {};
    for (const [dayKey, users] of dayUsersMap.entries()) {
      activeDayCountMap[dayKey] = users.size;
    }

    const dayKeysInSelectedRange = listDayKeys(period.startDayKey, period.endDayKey);
    const monthKeysInSelectedRange = listMonthKeys(period.startDayKey, period.endDayKey);

    const activeMonthCountMap: Record<string, number> = {};
    const reportMonthCountMap: Record<string, number> = {};

    for (const dayKey of dayKeysInSelectedRange) {
      const monthKey = dayKey.slice(0, 7);
      activeMonthCountMap[monthKey] = (activeMonthCountMap[monthKey] || 0) + (activeDayCountMap[dayKey] || 0);
      reportMonthCountMap[monthKey] = (reportMonthCountMap[monthKey] || 0) + (reportDayCountMap[dayKey] || 0);
    }

    const activeTrendPoints =
      period.granularity === "month"
        ? monthKeysInSelectedRange.map((monthKey) => ({
          date: monthKey,
          label: toMonthLabel(monthKey, timeZone),
          count: activeMonthCountMap[monthKey] || 0,
        }))
        : dayKeysInSelectedRange.map((dayKey) => ({
          date: dayKey,
          label: toDayLabel(dayKey, timeZone),
          count: activeDayCountMap[dayKey] || 0,
        }));

    const reportTrendPoints =
      period.granularity === "month"
        ? monthKeysInSelectedRange.map((monthKey) => ({
          date: monthKey,
          label: toMonthLabel(monthKey, timeZone),
          count: reportMonthCountMap[monthKey] || 0,
        }))
        : dayKeysInSelectedRange.map((dayKey) => ({
          date: dayKey,
          label: toDayLabel(dayKey, timeZone),
          count: reportDayCountMap[dayKey] || 0,
        }));

    const usersActiveToday = activeDayCountMap[period.todayKey] || 0;

    const usersActiveInPeriodSet = new Set<string>();
    for (const dayKey of dayKeysInSelectedRange) {
      const users = dayUsersMap.get(dayKey);
      if (!users) continue;
      for (const userId of users) {
        usersActiveInPeriodSet.add(userId);
      }
    }

    const reportsInPeriod = dayKeysInSelectedRange.reduce((acc, dayKey) => acc + (reportDayCountMap[dayKey] || 0), 0);

    for (const profile of profiles) {
      const userId = String(profile.id);
      if (!usersActiveInPeriodSet.has(userId)) continue;

      if (profile.country_id) {
        const countryId = String(profile.country_id);
        activeCountryUserCountMap[countryId] = (activeCountryUserCountMap[countryId] || 0) + 1;
      }

      if (profile.diocese_id) {
        const dioceseId = String(profile.diocese_id);
        activeDioceseUserCountMap[dioceseId] = (activeDioceseUserCountMap[dioceseId] || 0) + 1;
      }

      if (profile.church_id) {
        const churchId = String(profile.church_id);
        activeChurchUserCountMap[churchId] = (activeChurchUserCountMap[churchId] || 0) + 1;
      }
    }

    const countryList = countries
      .map((country) => ({
        id: String(country.id),
        name: country.name,
        total_count: countryUserCountMap[String(country.id)] || 0,
        active_count: activeCountryUserCountMap[String(country.id)] || 0,
        count:
          locationMetric === "active"
            ? activeCountryUserCountMap[String(country.id)] || 0
            : countryUserCountMap[String(country.id)] || 0,
        link: `/dashboard/location/country/${country.id}`,
      }))
      .sort((a, b) => b.count - a.count || b.total_count - a.total_count || a.name.localeCompare(b.name));

    const dioceseList = dioceses
      .map((diocese) => ({
        id: String(diocese.id),
        name: diocese.name,
        parent_id: diocese.country_id ? String(diocese.country_id) : "",
        parent_name: diocese.country_id ? countryNameById.get(String(diocese.country_id)) || "" : "",
        total_count: dioceseUserCountMap[String(diocese.id)] || 0,
        active_count: activeDioceseUserCountMap[String(diocese.id)] || 0,
        count:
          locationMetric === "active"
            ? activeDioceseUserCountMap[String(diocese.id)] || 0
            : dioceseUserCountMap[String(diocese.id)] || 0,
        link: `/dashboard/location/diocese/${diocese.id}`,
      }))
      .sort((a, b) => b.count - a.count || b.total_count - a.total_count || a.name.localeCompare(b.name));

    const churchList = churches
      .map((church) => ({
        id: String(church.id),
        name: church.name,
        parent_id: church.diocese_id ? String(church.diocese_id) : "",
        parent_name: church.diocese_id ? dioceseNameById.get(String(church.diocese_id)) || "" : "",
        total_count: churchUserCountMap[String(church.id)] || 0,
        active_count: activeChurchUserCountMap[String(church.id)] || 0,
        count:
          locationMetric === "active"
            ? activeChurchUserCountMap[String(church.id)] || 0
            : churchUserCountMap[String(church.id)] || 0,
        link: `/dashboard/location/church/${church.id}`,
      }))
      .sort((a, b) => b.count - a.count || b.total_count - a.total_count || a.name.localeCompare(b.name));

    let locationRawItems: Array<{
      id: string;
      name: string;
      parent_id?: string;
      parent_name?: string;
      total_count: number;
      active_count: number;
      count: number;
      link: string;
    }> = [];

    if (locationScope === "country") {
      locationRawItems = countryList;
    } else if (locationScope === "diocese") {
      locationRawItems = locationParentId
        ? dioceseList.filter((item) => item.parent_id === locationParentId)
        : dioceseList;
    } else {
      locationRawItems = locationParentId
        ? churchList.filter((item) => item.parent_id === locationParentId)
        : churchList;
    }

    if (locationQuery) {
      locationRawItems = locationRawItems.filter(
        (item) =>
          normalize(item.name).includes(locationQuery) ||
          normalize(item.parent_name || "").includes(locationQuery)
      );
    }

    const { page, limit, totalPages, totalItems, pagedItems } = pickTopOrPaginate({
      items: locationRawItems,
      mode: locationMode,
      limit: locationLimit,
      page: locationPage,
    });

    const selectedParent = (() => {
      if (!locationParentId) return null;
      if (locationScope === "diocese") {
        const name = countryNameById.get(locationParentId);
        return name ? { id: locationParentId, name, type: "country" } : null;
      }
      if (locationScope === "church") {
        const name = dioceseNameById.get(locationParentId);
        return name ? { id: locationParentId, name, type: "diocese" } : null;
      }
      return null;
    })();

    const reportsOpen = report_status
      .filter((item) => item.status === "open")
      .reduce((acc, item) => acc + item.count, 0);

    const response = {
      generated_at: now.toISOString(),
      timezone: timeZone,
      filters: {
        range: period.range,
        from: period.startDayKey,
        to: period.endDayKey,
        mode: locationMode,
        location_metric: locationMetric,
        location_scope: locationScope,
        location_id: locationParentId || null,
        location_q: locationQuery || null,
        page,
        limit,
      },
      kpis: {
        countries: countries.length,
        dioceses: dioceses.length,
        churches: churches.length,
        articles: articlesCount || 0,
        users_total: profiles.length,
        users_online_now: usersOnlineNow,
        users_active_today: usersActiveToday,
        users_active_period: usersActiveInPeriodSet.size,
        users_verified: statusCountMap.verified,
        users_pending: statusCountMap.pending,
        users_unverified: statusCountMap.unverified,
        users_rejected: statusCountMap.rejected,
        users_banned: statusCountMap.banned,
        reports_total: reports.length,
        reports_in_period: reportsInPeriod,
        reports_open: reportsOpen,
      },
      trends: {
        active_users: {
          source: activitySource,
          granularity: period.granularity,
          points: activeTrendPoints,
        },
        reports: {
          granularity: period.granularity,
          points: reportTrendPoints,
        },
      },
      roles,
      pastoral_roles_detail,
      verification_status,
      report_status,
      user_categories,
      location: {
        scope: locationScope,
        mode: locationMode,
        metric: locationMetric,
        page,
        limit,
        total_items: totalItems,
        total_pages: totalPages,
        selected_parent: selectedParent,
        items: pagedItems,
        options: {
          countries: countries.map((country) => ({ id: String(country.id), name: country.name })),
          dioceses: dioceses.map((diocese) => ({
            id: String(diocese.id),
            name: diocese.name,
            country_id: diocese.country_id ? String(diocese.country_id) : "",
          })),
        },
      },
      location_summary: {
        countries: countryList.slice(0, 10),
        dioceses: dioceseList.slice(0, 10),
        churches: churchList.slice(0, 10),
      },
      compatibility: {
        dau_today: usersActiveToday,
        reports_week: reportTrendPoints.slice(-7),
      },
    };

    return reply(response);
  } catch (error: unknown) {
    console.error("Analytics Fatal Error:", error);
    const message = error instanceof Error ? error.message : "Server Error";
    return reply({ error: message }, { status: 500 });
  }
}
