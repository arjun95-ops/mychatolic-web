-- =============================================
-- Migration Script: Bible Schema V3 (Final Structure)
-- =============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Drop tables if they exist (Clean Slate approach)
-- WARNING: This will delete ALL existing Bible data.
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
  pericope text, -- Section Header / Judul Perikop
  unique (chapter_id, verse_number)
);

-- =============================================
-- RLS Policies
-- =============================================

-- Enable RLS
alter table bible_books enable row level security;
alter table bible_chapters enable row level security;
alter table bible_verses enable row level security;

-- READ: Public access
create policy "Public can view bible books" on bible_books for select using (true);
create policy "Public can view bible chapters" on bible_chapters for select using (true);
create policy "Public can view bible verses" on bible_verses for select using (true);

-- WRITE (Insert, Update, Delete): Authenticated Users Only
create policy "Authenticated can insert books" on bible_books for insert to authenticated with check (true);
create policy "Authenticated can update books" on bible_books for update to authenticated using (true);
create policy "Authenticated can delete books" on bible_books for delete to authenticated using (true);

create policy "Authenticated can insert chapters" on bible_chapters for insert to authenticated with check (true);
create policy "Authenticated can update chapters" on bible_chapters for update to authenticated using (true);
create policy "Authenticated can delete chapters" on bible_chapters for delete to authenticated using (true);

create policy "Authenticated can insert verses" on bible_verses for insert to authenticated with check (true);
create policy "Authenticated can update verses" on bible_verses for update to authenticated using (true);
create policy "Authenticated can delete verses" on bible_verses for delete to authenticated using (true);
