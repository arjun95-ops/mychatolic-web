-- Admin RBAC + Monitoring + Backup Scheduler (v1)
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------
-- 1) Harden existing admin tables (compatible add-if-not-exists style)
-- -------------------------------------------------------------------

alter table if exists public.admin_users
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists role text default 'admin_ops',
  add column if not exists status text default 'pending_approval',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_role_check'
  ) then
    alter table public.admin_users
      add constraint admin_users_role_check
      check (role in ('super_admin', 'admin_ops')) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_status_check'
  ) then
    alter table public.admin_users
      add constraint admin_users_status_check
      check (status in ('pending_approval', 'approved', 'suspended')) not valid;
  end if;
end
$$;

create unique index if not exists idx_admin_users_auth_user_id_unique
  on public.admin_users(auth_user_id);

create index if not exists idx_admin_users_role_status
  on public.admin_users(role, status);

alter table if exists public.admin_sessions
  add column if not exists ip text,
  add column if not exists user_agent text,
  add column if not exists request_headers jsonb default '{}'::jsonb;

create index if not exists idx_admin_sessions_login_at
  on public.admin_sessions(login_at desc);

create index if not exists idx_admin_sessions_admin_auth_user_id
  on public.admin_sessions(admin_auth_user_id);

alter table if exists public.audit_logs
  add column if not exists actor_auth_user_id uuid,
  add column if not exists table_name text,
  add column if not exists record_id text,
  add column if not exists old_data jsonb,
  add column if not exists new_data jsonb,
  add column if not exists request_headers jsonb default '{}'::jsonb,
  add column if not exists occurred_at timestamptz default now();

create index if not exists idx_audit_logs_occurred_at
  on public.audit_logs(occurred_at desc);

create index if not exists idx_audit_logs_actor_auth_user_id
  on public.audit_logs(actor_auth_user_id);

create index if not exists idx_audit_logs_action
  on public.audit_logs(action);

-- -------------------------------------------------------------------
-- 2) Email allowlist for admin self-register
-- -------------------------------------------------------------------

create table if not exists public.admin_email_allowlist (
  email text primary key,
  note text,
  added_by uuid,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_email_allowlist_added_at
  on public.admin_email_allowlist(added_at desc);

-- -------------------------------------------------------------------
-- 3) Backup scheduler (custom cron, in-app + email reminder)
-- -------------------------------------------------------------------

create table if not exists public.admin_backup_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cron_expression text not null,
  timezone text not null default 'Asia/Jakarta',
  channels text[] not null default array['in_app','email']::text[],
  is_active boolean not null default true,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  last_reminded_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_backup_schedules_next_run_at
  on public.admin_backup_schedules(next_run_at)
  where is_active = true;

create table if not exists public.admin_backup_reminders (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references public.admin_backup_schedules(id) on delete set null,
  recipient_auth_user_id uuid not null,
  title text not null,
  message text not null,
  reminder_at timestamptz not null default now(),
  is_read boolean not null default false,
  read_at timestamptz,
  metadata jsonb default '{}'::jsonb
);

create index if not exists idx_admin_backup_reminders_recipient
  on public.admin_backup_reminders(recipient_auth_user_id, is_read, reminder_at desc);

create table if not exists public.admin_backup_exports (
  id uuid primary key default gen_random_uuid(),
  exported_by uuid,
  export_type text not null default 'on_demand',
  files jsonb not null default '[]'::jsonb,
  from_at timestamptz,
  to_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_backup_exports_created_at
  on public.admin_backup_exports(created_at desc);

-- -------------------------------------------------------------------
-- 3b) Grants for service_role (required for server API using service key)
-- -------------------------------------------------------------------

grant usage on schema public to service_role;

grant select, insert, update, delete on table public.admin_email_allowlist to service_role;
grant select, insert, update, delete on table public.admin_backup_schedules to service_role;
grant select, insert, update, delete on table public.admin_backup_reminders to service_role;
grant select, insert, update, delete on table public.admin_backup_exports to service_role;

-- Master Data (needed by admin server APIs for import/update)
grant select, insert, update, delete on table public.churches to service_role;
grant select, insert, update, delete on table public.dioceses to service_role;
grant select, insert, update, delete on table public.countries to service_role;

-- Optional/legacy tables used by Master Data cleanup routes.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'mass_schedules',
    'mass_checkins',
    'mass_checkins_v2',
    'mass_radars',
    'radar_events',
    'radar_invites',
    'radar_events_v2',
    'radar_invites_v2',
    'posts',
    'radars',
    'user_posts',
    'profiles'
  ] loop
    if to_regclass('public.' || tbl) is not null then
      execute format(
        'grant select, insert, update, delete on table public.%I to service_role',
        tbl
      );
    end if;
  end loop;
end
$$;

do $$
begin
  if to_regclass('public.schedules') is not null then
    execute 'grant select, insert, update, delete on table public.schedules to service_role';
  end if;
end
$$;

-- Client hardening: close direct browser writes for Country/Diocese master data.
-- UI writes should go through protected /api/admin/master-data/* routes.
do $$
begin
  if to_regclass('public.countries') is not null then
    execute 'revoke insert, update, delete on table public.countries from anon, authenticated';
  end if;

  if to_regclass('public.dioceses') is not null then
    execute 'revoke insert, update, delete on table public.dioceses from anon, authenticated';
  end if;
end
$$;

-- -------------------------------------------------------------------
-- 4) Bootstrap first Super Admin (manual)
-- -------------------------------------------------------------------
-- Steps:
-- 1. Create user first from Supabase Auth dashboard.
-- 2. Replace placeholders below, then run.
--
-- insert into public.admin_users (
--   auth_user_id, email, full_name, role, status, approved_at, approved_by, created_at, updated_at
-- ) values (
--   'YOUR_AUTH_USER_ID_UUID',
--   'superadmin@example.com',
--   'Super Admin',
--   'super_admin',
--   'approved',
--   now(),
--   null,
--   now(),
--   now()
-- )
-- on conflict (auth_user_id) do update set
--   role = excluded.role,
--   status = excluded.status,
--   approved_at = excluded.approved_at,
--   updated_at = now();
