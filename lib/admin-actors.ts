import type { SupabaseClient } from "@supabase/supabase-js";

type SupabaseAdminClient = SupabaseClient;

export async function resolveActorMap(
  supabaseAdminClient: SupabaseAdminClient,
  actorIds: string[]
): Promise<Map<string, { email: string; full_name: string; role: string; status: string }>> {
  const map = new Map<string, { email: string; full_name: string; role: string; status: string }>();
  const uniqueIds = Array.from(new Set(actorIds.filter(Boolean)));
  if (uniqueIds.length === 0) return map;

  const { data: adminRows } = await supabaseAdminClient
    .from("admin_users")
    .select("auth_user_id, email, full_name, role, status")
    .in("auth_user_id", uniqueIds);

  for (const row of adminRows || []) {
    const id = String(row.auth_user_id || "");
    if (!id) continue;
    map.set(id, {
      email: String(row.email || ""),
      full_name: String(row.full_name || ""),
      role: String(row.role || ""),
      status: String(row.status || ""),
    });
  }

  const unresolvedIds = uniqueIds.filter((id) => !map.has(id));
  if (unresolvedIds.length === 0) return map;

  const { data: profiles } = await supabaseAdminClient
    .from("profiles")
    .select("id, full_name")
    .in("id", unresolvedIds);

  const profileNameMap = new Map<string, string>();
  for (const profile of profiles || []) {
    profileNameMap.set(String(profile.id), String(profile.full_name || ""));
  }

  for (const id of unresolvedIds) {
    try {
      const { data, error } = await supabaseAdminClient.auth.admin.getUserById(id);
      if (error) continue;
      map.set(id, {
        email: String(data?.user?.email || ""),
        full_name: profileNameMap.get(id) || "",
        role: "",
        status: "",
      });
    } catch {
      map.set(id, {
        email: "",
        full_name: profileNameMap.get(id) || "",
        role: "",
        status: "",
      });
    }
  }

  return map;
}
