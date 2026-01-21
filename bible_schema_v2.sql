-- =============================================
-- Migration Script: Update Bible Schema (Catholic)
-- =============================================

-- Enable UUID extension just in case it's not enabled
create extension if not exists "uuid-ossp";

-- 1. Drop existing tables if they exist (to ensure fresh schema match)
-- WARNING: This deletes existing data. 
drop table if exists bible_verses cascade;
drop table if exists bible_chapters cascade;
drop table if exists bible_books cascade;

-- 2. Create `bible_books` table
create table bible_books (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  abbreviation text not null unique,
  category text not null check (category in ('Perjanjian Lama', 'Perjanjian Baru', 'Deuterokanonika')),
  book_order int not null
);

-- 3. Create `bible_chapters` table
create table bible_chapters (
  id uuid default uuid_generate_v4() primary key,
  book_id uuid references bible_books(id) on delete cascade not null,
  chapter_number int not null,
  unique (book_id, chapter_number)
);

-- 4. Create `bible_verses` table
create table bible_verses (
  id uuid default uuid_generate_v4() primary key,
  chapter_id uuid references bible_chapters(id) on delete cascade not null,
  verse_number int not null,
  text text not null,
  pericope text, -- Section title/header for the verse block
  unique (chapter_id, verse_number)
);

-- =============================================
-- RLS Policies
-- =============================================

-- Enable RLS on all tables
alter table bible_books enable row level security;
alter table bible_chapters enable row level security;
alter table bible_verses enable row level security;

-- Create Policies

-- READ: Public access for everyone
create policy "Public can view bible books" on bible_books for select using (true);
create policy "Public can view bible chapters" on bible_chapters for select using (true);
create policy "Public can view bible verses" on bible_verses for select using (true);

-- WRITE (Insert, Update, Delete): Only authenticated service_role and users (assuming admin logic or generic auth for now as per request)
-- Adjust 'authenticated' to specific roles if you have a `public.profiles` or roles system.
-- For now, we allow any authenticated user to write (as per request "writable by authenticated service_role or admin users", usually implies auth.role() = 'service_role' OR auth.uid() checks)

-- Note: 'service_role' bypasses RLS by default, so we just need policies for authenticated admin users.
-- Assuming 'authenticated' users are admins for this context or just general auth write access:

create policy "Authenticated users can insert books" on bible_books for insert to authenticated with check (true);
create policy "Authenticated users can update books" on bible_books for update to authenticated using (true);
create policy "Authenticated users can delete books" on bible_books for delete to authenticated using (true);

create policy "Authenticated users can insert chapters" on bible_chapters for insert to authenticated with check (true);
create policy "Authenticated users can update chapters" on bible_chapters for update to authenticated using (true);
create policy "Authenticated users can delete chapters" on bible_chapters for delete to authenticated using (true);

create policy "Authenticated users can insert verses" on bible_verses for insert to authenticated with check (true);
create policy "Authenticated users can update verses" on bible_verses for update to authenticated using (true);
create policy "Authenticated users can delete verses" on bible_verses for delete to authenticated using (true);

-- End of Migration
