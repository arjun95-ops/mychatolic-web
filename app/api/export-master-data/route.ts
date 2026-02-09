import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireApprovedAdmin } from "@/lib/admin-guard";
import { logAdminAudit } from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

const DAY_LABELS: Record<number, string> = {
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
  6: "Sabtu",
  7: "Minggu",
};

type ScheduleRow = {
  church_id?: string | null;
  day_number?: number | null;
  start_time?: string | null;
  title?: string | null;
  language?: string | null;
};

type ChurchRow = {
  id?: string | null;
  name?: string | null;
  address?: string | null;
  image_url?: string | null;
  google_maps_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  dioceses?: {
    name?: string | null;
    countries?: {
      name?: string | null;
    } | null;
  } | null;
};

function normalizeTime(value: string | null | undefined): string {
  return String(value || "").substring(0, 5);
}

function formatSchedules(schedList: ScheduleRow[]): string {
  if (!schedList || schedList.length === 0) return "";

  return schedList
    .map((item) => {
      const day = DAY_LABELS[Number(item.day_number || 0)] || "Hari tidak valid";
      const time = normalizeTime(item.start_time);
      const title = String(item.title || "Misa").trim();
      const language = String(item.language || "").trim();
      const languageSuffix = language ? ` (${language})` : "";
      return `${day}: ${time} - ${title}${languageSuffix}`;
    })
    .join("; ");
}

export async function GET(req: NextRequest) {
  const ctx = await requireApprovedAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { user, supabaseAdminClient: adminClient, setCookiesToResponse } = ctx;

  try {
    const churchesRes = await adminClient
      .from("churches")
      .select(
        `
          id, name, address, image_url, google_maps_url, latitude, longitude,
          dioceses (
            name,
            countries ( name )
          )
        `,
      )
      .order("name");

    if (churchesRes.error) {
      throw new Error(`Error fetching churches: ${churchesRes.error.message}`);
    }

    const churches = (churchesRes.data || []) as ChurchRow[];

    const schedulesRes = await adminClient
      .from("mass_schedules")
      .select("church_id, day_number, start_time, title, language");

    if (schedulesRes.error) {
      throw new Error(`Error fetching mass_schedules: ${schedulesRes.error.message}`);
    }

    const schedules = (schedulesRes.data || []) as ScheduleRow[];

    const scheduleMap = new Map<string, ScheduleRow[]>();
    for (const schedule of schedules) {
      const churchId = String(schedule.church_id || "");
      if (!churchId) continue;
      if (!scheduleMap.has(churchId)) scheduleMap.set(churchId, []);
      scheduleMap.get(churchId)?.push(schedule);
    }

    const excelRows = churches.map((church) => {
      const churchId = String(church.id || "");
      const mySchedules = scheduleMap.get(churchId) || [];
      const sortedSchedules = [...mySchedules].sort((a, b) => {
        const dayDiff = Number(a.day_number || 0) - Number(b.day_number || 0);
        if (dayDiff !== 0) return dayDiff;
        return normalizeTime(a.start_time).localeCompare(normalizeTime(b.start_time));
      });

      return {
        id: churchId,
        Negara: church.dioceses?.countries?.name || "",
        Keuskupan: church.dioceses?.name || "",
        "Nama Paroki / Gereja": church.name || "",
        Alamat: church.address || "",
        "Jadwal Misa": formatSchedules(sortedSchedules),
        "Link Foto": church.image_url || "",
        "Link Maps": church.google_maps_url || "",
        Latitude: church.latitude == null ? "" : String(church.latitude),
        Longitude: church.longitude == null ? "" : String(church.longitude),
      };
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelRows);

    worksheet["!cols"] = [
      { wch: 40 }, // id
      { wch: 20 }, // Negara
      { wch: 30 }, // Keuskupan
      { wch: 40 }, // Nama Paroki
      { wch: 50 }, // Alamat
      { wch: 80 }, // Jadwal Misa
      { wch: 35 }, // Foto
      { wch: 35 }, // Maps
      { wch: 12 }, // Lat
      { wch: 12 }, // Lng
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "Master Data");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    await logAdminAudit({
      supabaseAdminClient: adminClient,
      actorAuthUserId: user.id,
      action: "EXPORT_MASTER_DATA",
      tableName: "churches",
      recordId: null,
      oldData: null,
      newData: {
        total_churches: churches.length,
        total_schedules: schedules.length,
      },
      request: req,
    });

    const res = new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="Master_Data_Catholic.xlsx"',
      },
    });

    setCookiesToResponse(res);
    return res;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Export API Error:", error);
    const res = NextResponse.json(
      { error: `Export Failed: ${message}` },
      { status: 500 },
    );
    setCookiesToResponse(res);
    return res;
  }
}
