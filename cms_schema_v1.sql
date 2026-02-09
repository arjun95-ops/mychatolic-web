-- =============================================
-- Migration Script: CMS Features
-- =============================================

-- Enable UUID extension just in case
create extension if not exists "uuid-ossp";

-- 1. Homepage Sections (Dynamic App Layout)
create table if not exists homepage_sections (
  id uuid default uuid_generate_v4() primary key,
  section_key text not null unique,
  label text not null,
  is_active boolean default true,
  order_index int default 0,
  settings jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Insert Default Sections
insert into homepage_sections (section_key, label, order_index, is_active)
values 
  ('banner', 'Banner & Highlights', 10, true),
  ('last_read', 'Terakhir Dibaca', 40, true),
  ('reading_plan', 'Rencana Bacaan', 60, true)
on conflict (section_key) do nothing;

-- 2. Audit Logs (Security & Tracking)
create table if not exists audit_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id),
  action text not null,
  details jsonb,
  created_at timestamp with time zone default now()
);

-- =============================================
-- RLS Policies
-- =============================================

-- 1. Homepage Sections Policies
alter table homepage_sections enable row level security;

-- Public Read (Everyone needs to see the layout)
create policy "Public can view active homepage sections" 
  on homepage_sections for select 
  using (true);

-- Admin Write (Authenticated users in dashboard context)
create policy "Authenticated users can manage homepage sections"
  on homepage_sections for all
  to authenticated
  using (true)
  with check (true);

-- 2. Audit Logs Policies
alter table audit_logs enable row level security;

-- Insert: Allow authenticated users (to log their own actions)
create policy "Users can insert audit logs" 
  on audit_logs for insert 
  to authenticated 
  with check (auth.uid() = user_id);

-- Read: Allow authenticated users (Admins) to view logs
create policy "Admins can view audit logs" 
  on audit_logs for select 
  to authenticated
  using (true);

-- End Migration
