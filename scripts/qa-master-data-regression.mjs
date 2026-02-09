#!/usr/bin/env node

import fs from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  const text = fs.readFileSync(path, "utf8");
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function nowIso() {
  return new Date().toISOString();
}

function printHeader(title) {
  console.log(`\n=== ${title} ===`);
}

function logResult(status, label, detail = "") {
  const suffix = detail ? ` :: ${detail}` : "";
  console.log(`[${status}] ${label}${suffix}`);
}

async function assertColumns(client, table, expectedColumns) {
  const { data, error } = await client.from(table).select("*").limit(1);
  if (error) {
    return {
      ok: false,
      message: `${error.code || "ERR"} ${error.message}`,
      columns: [],
    };
  }
  const sample = (data || [])[0] || {};
  const columns = Object.keys(sample);
  const missing = expectedColumns.filter((col) => !columns.includes(col));
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Missing columns: ${missing.join(", ")}`,
      columns,
    };
  }
  return {
    ok: true,
    message: `Columns OK (${expectedColumns.join(", ")})`,
    columns,
  };
}

async function main() {
  const envPath = ".env.local";
  if (!fs.existsSync(envPath)) {
    console.error("Missing .env.local");
    process.exit(1);
  }

  const env = loadEnv(envPath);
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !serviceRoleKey || !anonKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let hasFailure = false;

  printHeader("Meta");
  logResult("INFO", "Started", nowIso());

  printHeader("Schema Checks");
  const schemaChecks = [
    ["countries", ["id", "name"]],
    ["dioceses", ["id", "name", "country_id"]],
    ["churches", ["id", "name", "diocese_id", "google_maps_url"]],
    ["mass_schedules", ["id", "church_id", "day_number", "start_time", "title", "language"]],
  ];

  for (const [table, columns] of schemaChecks) {
    const result = await assertColumns(admin, table, columns);
    if (!result.ok) {
      hasFailure = true;
      logResult("FAIL", `${table} columns`, result.message);
    } else {
      logResult("PASS", `${table} columns`, result.message);
    }
  }

  printHeader("Anon Read Smoke (Flutter-like)");
  const flutterReadTables = ["countries", "dioceses", "churches", "mass_schedules"];
  for (const table of flutterReadTables) {
    const readRes = await anon.from(table).select("*", { count: "exact" }).limit(1);
    if (readRes.error) {
      hasFailure = true;
      logResult(
        "FAIL",
        `anon read ${table}`,
        `${readRes.error.code || "ERR"} ${readRes.error.message}`,
      );
      continue;
    }
    const keys = Object.keys((readRes.data || [])[0] || {});
    logResult(
      "PASS",
      `anon read ${table}`,
      `rows=${readRes.count || 0} sample_keys=${keys.slice(0, 8).join(",")}`,
    );
  }

  printHeader("Schedule CRUD Smoke (Service Role)");
  const { data: church, error: churchErr } = await admin
    .from("churches")
    .select("id, name")
    .order("name")
    .limit(1)
    .maybeSingle();

  if (churchErr || !church) {
    hasFailure = true;
    logResult("FAIL", "Load church seed", churchErr?.message || "No church data found");
  } else {
    logResult("PASS", "Load church seed", `${church.name} (${church.id})`);

    const insertPayload = {
      church_id: church.id,
      day_number: 2,
      start_time: "09:35:00",
      title: "QA Smoke Schedule",
      language: "Bahasa Indonesia",
    };

    const inserted = await admin
      .from("mass_schedules")
      .insert(insertPayload)
      .select("id, title, start_time")
      .maybeSingle();

    if (inserted.error || !inserted.data) {
      hasFailure = true;
      logResult("FAIL", "Insert schedule", inserted.error?.message || "No inserted row");
    } else {
      logResult("PASS", "Insert schedule", `${inserted.data.id}`);

      const updated = await admin
        .from("mass_schedules")
        .update({ title: "QA Smoke Schedule Updated", start_time: "10:10:00" })
        .eq("id", inserted.data.id)
        .select("id, title, start_time")
        .maybeSingle();

      if (updated.error || !updated.data) {
        hasFailure = true;
        logResult("FAIL", "Update schedule", updated.error?.message || "No updated row");
      } else {
        logResult("PASS", "Update schedule", `${updated.data.title} @ ${updated.data.start_time}`);
      }

      const removed = await admin.from("mass_schedules").delete().eq("id", inserted.data.id);
      if (removed.error) {
        hasFailure = true;
        logResult("FAIL", "Delete schedule", removed.error.message);
      } else {
        logResult("PASS", "Delete schedule", inserted.data.id);
      }
    }
  }

  printHeader("Church CRUD Smoke (Service Role)");
  const { data: diocese, error: dioceseErr } = await admin
    .from("dioceses")
    .select("id, name")
    .order("name")
    .limit(1)
    .maybeSingle();

  if (dioceseErr || !diocese) {
    hasFailure = true;
    logResult("FAIL", "Load diocese seed", dioceseErr?.message || "No diocese data found");
  } else {
    const stamp = Date.now();
    const churchPayload = {
      name: `QA Temp Church ${stamp}`,
      address: "QA temporary row",
      diocese_id: diocese.id,
      google_maps_url: null,
      latitude: null,
      longitude: null,
      type: "parish",
    };

    const insertedChurch = await admin
      .from("churches")
      .insert(churchPayload)
      .select("id, name")
      .maybeSingle();

    if (insertedChurch.error || !insertedChurch.data) {
      hasFailure = true;
      logResult("FAIL", "Insert church", insertedChurch.error?.message || "No inserted church");
    } else {
      logResult("PASS", "Insert church", insertedChurch.data.id);

      const updateChurch = await admin
        .from("churches")
        .update({ address: "QA updated address" })
        .eq("id", insertedChurch.data.id)
        .select("id, address")
        .maybeSingle();

      if (updateChurch.error || !updateChurch.data) {
        hasFailure = true;
        logResult("FAIL", "Update church", updateChurch.error?.message || "No updated church");
      } else {
        logResult("PASS", "Update church", updateChurch.data.address || "(empty)");
      }

      const deleteChurch = await admin.from("churches").delete().eq("id", insertedChurch.data.id);
      if (deleteChurch.error) {
        hasFailure = true;
        logResult("FAIL", "Delete church", deleteChurch.error.message);
      } else {
        logResult("PASS", "Delete church", insertedChurch.data.id);
      }
    }
  }

  printHeader("Dashboard -> Flutter Sync Probe");
  const { data: syncDiocese, error: syncDioceseErr } = await admin
    .from("dioceses")
    .select("id, name")
    .order("name")
    .limit(1)
    .maybeSingle();

  if (syncDioceseErr || !syncDiocese) {
    hasFailure = true;
    logResult("FAIL", "Load sync diocese seed", syncDioceseErr?.message || "No diocese data found");
  } else {
    const stamp = Date.now();
    const tempChurchName = `QA Flutter Sync ${stamp}`;
    const insertedChurch = await admin
      .from("churches")
      .insert({
        name: tempChurchName,
        address: "QA sync probe",
        diocese_id: syncDiocese.id,
        google_maps_url: "https://maps.google.com",
        latitude: 1.23,
        longitude: 103.45,
      })
      .select("id, name, diocese_id, google_maps_url, latitude, longitude")
      .maybeSingle();

    if (insertedChurch.error || !insertedChurch.data) {
      hasFailure = true;
      logResult("FAIL", "Insert sync church", insertedChurch.error?.message || "No inserted church");
    } else {
      const insertedSchedule = await admin
        .from("mass_schedules")
        .insert({
          church_id: insertedChurch.data.id,
          day_number: 7,
          start_time: "08:30:00",
          title: "QA Flutter Sync Mass",
          language: "Bahasa Indonesia",
        })
        .select("id, church_id, day_number, start_time, title, language")
        .maybeSingle();

      if (insertedSchedule.error || !insertedSchedule.data) {
        hasFailure = true;
        logResult(
          "FAIL",
          "Insert sync schedule",
          insertedSchedule.error?.message || "No inserted schedule",
        );
      } else {
        const anonChurch = await anon
          .from("churches")
          .select("id, name, diocese_id, google_maps_url, latitude, longitude")
          .eq("id", insertedChurch.data.id)
          .maybeSingle();
        const anonSchedule = await anon
          .from("mass_schedules")
          .select("id, church_id, day_number, start_time, title, language")
          .eq("id", insertedSchedule.data.id)
          .maybeSingle();

        if (anonChurch.error || !anonChurch.data) {
          hasFailure = true;
          logResult(
            "FAIL",
            "Anon read synced church",
            anonChurch.error?.message || "Data not visible",
          );
        } else {
          logResult("PASS", "Anon read synced church", anonChurch.data.id);
        }

        if (anonSchedule.error || !anonSchedule.data) {
          hasFailure = true;
          logResult(
            "FAIL",
            "Anon read synced schedule",
            anonSchedule.error?.message || "Data not visible",
          );
        } else {
          logResult(
            "PASS",
            "Anon read synced schedule",
            `${anonSchedule.data.id} day=${anonSchedule.data.day_number} time=${anonSchedule.data.start_time}`,
          );
        }

        const cleanupSchedule = await admin.from("mass_schedules").delete().eq("id", insertedSchedule.data.id);
        if (cleanupSchedule.error) {
          hasFailure = true;
          logResult("FAIL", "Cleanup sync schedule", cleanupSchedule.error.message);
        }
      }

      const cleanupChurch = await admin.from("churches").delete().eq("id", insertedChurch.data.id);
      if (cleanupChurch.error) {
        hasFailure = true;
        logResult("FAIL", "Cleanup sync church", cleanupChurch.error.message);
      }
    }
  }

  printHeader("Dependency Snapshot (Church Delete Risk)");
  const dependencyTables = ["profiles", "mass_schedules", "mass_checkins", "posts", "radars", "user_posts"];
  for (const table of dependencyTables) {
    const { count, error } = await admin
      .from(table)
      .select("church_id", { head: true, count: "exact" })
      .not("church_id", "is", null);

    if (error) {
      logResult("WARN", `${table}.church_id`, `${error.code || "ERR"} ${error.message}`);
      continue;
    }
    logResult("INFO", `${table}.church_id`, `rows=${count || 0}`);
  }

  printHeader("Schedule FK Dependency Snapshot");
  const scheduleDependencyTables = [
    ["mass_checkins", "schedule_id"],
    ["mass_checkins_v2", "mass_schedule_id"],
    ["mass_radars", "schedule_id"],
    ["radar_events", "mass_schedule_id"],
    ["radar_events", "schedule_id"],
    ["radar_invites", "mass_schedule_id"],
    ["radar_invites", "schedule_id"],
    ["radar_events_v2", "mass_schedule_id"],
    ["radar_events_v2", "schedule_id"],
    ["radar_invites_v2", "mass_schedule_id"],
    ["radar_invites_v2", "schedule_id"],
  ];
  for (const [table, column] of scheduleDependencyTables) {
    const { count, error } = await admin
      .from(table)
      .select(column, { head: true, count: "exact" })
      .not(column, "is", null);

    if (error) {
      const message = `${error.code || "ERR"} ${error.message || ""}`.trim();
      const isEmptyLegacyError = !error.code && !error.message;
      const isMissingColumn =
        String(error.code || "") === "42703" ||
        String(error.message || "").toLowerCase().includes("does not exist");
      if (isEmptyLegacyError || isMissingColumn) {
        logResult("INFO", `${table}.${column}`, `column not present (legacy variant): ${message}`);
      } else {
        logResult("WARN", `${table}.${column}`, message);
      }
      continue;
    }
    logResult("INFO", `${table}.${column}`, `rows=${count || 0}`);
  }

  printHeader("Anon Write Risk Probe");
  const randomId = "00000000-0000-0000-0000-000000000000";
  const probes = [
    ["countries", { name: "probe" }],
    ["dioceses", { name: "probe" }],
    ["churches", { name: "probe" }],
    ["mass_schedules", { title: "probe" }],
  ];

  for (const [table, payload] of probes) {
    const result = await anon.from(table).update(payload).eq("id", randomId);
    if (result.error) {
      logResult("PASS", `anon write blocked: ${table}`, `${result.error.code || "ERR"}`);
    } else {
      logResult("WARN", `anon write allowed or not blocked: ${table}`, "Review RLS/privileges");
    }
  }

  printHeader("Summary");
  if (hasFailure) {
    logResult("FAIL", "Regression Smoke", "Ada test kritikal yang gagal.");
    process.exit(1);
  }
  logResult("PASS", "Regression Smoke", "Semua test kritikal lulus.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
