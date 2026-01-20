import { NextResponse } from 'next/server';
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // 1. Fetch Churches + Dioceses + Countries (Safe Query)
        // Removed nama_stasi as per Schema V4
        const churchesRes = await supabase
            .from('churches')
            .select(`
                *,
                dioceses (
                    name,
                    countries ( name )
                )
            `)
            .order('id');

        if (churchesRes.error) {
            throw new Error("Error fetching Churches: " + churchesRes.error.message);
        }

        const churches = churchesRes.data || [];

        // 2. Fetch Mass Schedules (Fail-Safe)
        let schedules = [];
        try {
            const schedRes = await supabase.from('mass_schedules').select('*');
            if (schedRes.error) {
                console.warn("Export Warning: Failed to fetch mass_schedules. Proceeding without schedules.", schedRes.error.message);
            } else {
                schedules = schedRes.data || [];
            }
        } catch (e) {
            console.warn("Export Exception: Failed to fetch mass_schedules", e);
        }

        // 3. Map Schedules
        const scheduleMap = new Map<number, any[]>();
        schedules.forEach((s: any) => {
            if (!scheduleMap.has(s.church_id)) {
                scheduleMap.set(s.church_id, []);
            }
            scheduleMap.get(s.church_id)?.push(s);
        });

        // 4. Processing logic
        const formatSchedules = (schedList: any[]) => {
            if (!schedList || schedList.length === 0) return "";
            return schedList.map(s => {
                const day = s.day_name || s.day || "";
                const time = (s.time_start || s.time || "").substring(0, 5);
                return `${day}: ${time}`;
            }).join('; ');
        };

        const excelRows = churches.map((c: any) => {
            const mySchedules = scheduleMap.get(c.id) || [];

            return {
                "id": c.id,
                "Negara": c.dioceses?.countries?.name || "",
                "Keuskupan": c.dioceses?.name || "",
                "Nama Paroki / Gereja": c.nama_paroki || "", // Main Name
                "Alamat": c.address || "",
                "Jadwal Misa": formatSchedules(mySchedules),
                "Link Foto": c.image_url || "",
                "Link Sosmed": c.instagram_url || ""
            };
        });

        // 5. Generate Excel
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(excelRows);

        const wscols = [
            { wch: 10 }, // id
            { wch: 20 }, // Negara
            { wch: 30 }, // Keuskupan
            { wch: 40 }, // Nama Paroki / Gereja
            { wch: 50 }, // Alamat
            { wch: 50 }, // Jadwal
            { wch: 30 }, // Foto
            { wch: 30 }  // Sosmed
        ];
        worksheet['!cols'] = wscols;

        XLSX.utils.book_append_sheet(workbook, worksheet, "Master Data");

        const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        return new NextResponse(buf, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': 'attachment; filename="Master_Data_Catholic.xlsx"',
            },
        });

    } catch (err: any) {
        console.error("Export API Error:", err);
        return NextResponse.json({ error: "Export Failed: " + err.message }, { status: 500 });
    }
}
