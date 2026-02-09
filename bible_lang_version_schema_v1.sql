-- =============================================
-- Migration Script: Bible Language + Version Scope (v1)
-- =============================================
-- Goal:
-- 1) Remove dependency on translation master table.
-- 2) Scope data directly by (language_code, version_code).
-- 3) Keep compatibility with Flutter: grouping + order_index.

create extension if not exists pgcrypto;

-- Cleanup previous translation-based design if it was applied before.
drop table if exists public.bible_translations cascade;

do $$
begin
  if to_regclass('public.bible_books') is not null then
    execute 'alter table public.bible_books drop constraint if exists bible_books_translation_id_fkey';
    execute 'alter table public.bible_books drop column if exists translation_id';
    execute 'alter table public.bible_books drop constraint if exists bible_books_order_index_key';
  end if;

  if to_regclass('public.bible_chapters') is not null then
    execute 'alter table public.bible_chapters drop constraint if exists bible_chapters_book_chapter_key';
  end if;

  if to_regclass('public.bible_verses') is not null then
    execute 'alter table public.bible_verses drop constraint if exists bible_verses_book_id_fkey';
    execute 'alter table public.bible_verses drop constraint if exists bible_verses_book_id_chapter_verse_number_type_key';
  end if;
end
$$;

drop index if exists idx_bible_books_translation_order;
drop index if exists idx_bible_translations_language_version;
drop index if exists idx_bible_translations_active;

-- -------------------------------------------------------------------
-- 1) Ensure base Bible tables exist
-- -------------------------------------------------------------------

create table if not exists public.bible_books (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abbreviation text
);

alter table if exists public.bible_books
  add column if not exists legacy_book_id text;

-- Normalize legacy bible_books.id (integer/bigint/etc) into uuid.
do $$
declare
  books_id_type text;
  rec record;
  pk_name text;
begin
  select c.udt_name
    into books_id_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'bible_books'
    and c.column_name = 'id';

  if books_id_type is not null and books_id_type <> 'uuid' then
    execute 'update public.bible_books set legacy_book_id = coalesce(nullif(legacy_book_id, ''''), id::text)';
    execute 'alter table public.bible_books add column if not exists id_uuid uuid default gen_random_uuid()';
    execute 'update public.bible_books set id_uuid = coalesce(id_uuid, gen_random_uuid())';

    for rec in
      select conrelid::regclass as table_name, conname
      from pg_constraint
      where contype = 'f'
        and confrelid = 'public.bible_books'::regclass
    loop
      execute format('alter table %s drop constraint if exists %I', rec.table_name, rec.conname);
    end loop;

    select conname
      into pk_name
    from pg_constraint
    where conrelid = 'public.bible_books'::regclass
      and contype = 'p'
    limit 1;

    if pk_name is not null then
      execute format('alter table public.bible_books drop constraint if exists %I', pk_name);
    end if;

    execute 'alter table public.bible_books drop column id';
    execute 'alter table public.bible_books rename column id_uuid to id';
    execute 'alter table public.bible_books alter column id set default gen_random_uuid()';
    execute 'alter table public.bible_books alter column id set not null';
    execute 'alter table public.bible_books add constraint bible_books_pkey primary key (id)';
    execute 'create unique index if not exists idx_bible_books_legacy_book_id on public.bible_books(legacy_book_id)';
  end if;

  -- Keep a stable text lookup key regardless of id type history.
  execute 'update public.bible_books set legacy_book_id = coalesce(nullif(legacy_book_id, ''''), id::text)';
end
$$;

create table if not exists public.bible_chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.bible_books(id) on delete cascade,
  chapter_number integer not null
);

create table if not exists public.bible_verses (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.bible_chapters(id) on delete cascade,
  verse_number integer not null,
  text text not null,
  pericope text
);

-- Ensure required columns exist for legacy schemas.
alter table if exists public.bible_chapters
  add column if not exists book_id uuid,
  add column if not exists chapter_number integer;

alter table if exists public.bible_verses
  add column if not exists chapter_id uuid,
  add column if not exists verse_number integer,
  add column if not exists text text,
  add column if not exists pericope text;

-- Normalize legacy bible_chapters.book_id into uuid.
do $$
declare
  chapters_book_id_type text;
begin
  select c.udt_name
    into chapters_book_id_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'bible_chapters'
    and c.column_name = 'book_id';

  if chapters_book_id_type is not null and chapters_book_id_type <> 'uuid' then
    execute 'alter table public.bible_chapters add column if not exists book_id_uuid uuid';

    execute $sql$
      update public.bible_chapters c
      set book_id_uuid = b.id
      from public.bible_books b
      where c.book_id_uuid is null
        and c.book_id is not null
        and coalesce(nullif(b.legacy_book_id, ''), b.id::text) = c.book_id::text
    $sql$;

    execute 'alter table public.bible_chapters drop constraint if exists bible_chapters_book_id_fkey';
    execute 'alter table public.bible_chapters drop constraint if exists bible_chapters_book_chapter_key';
    execute 'alter table public.bible_chapters drop constraint if exists bible_chapters_book_id_chapter_number_key';
    execute 'drop index if exists idx_bible_chapters_book_chapter';
    execute 'alter table public.bible_chapters drop column book_id';
    execute 'alter table public.bible_chapters rename column book_id_uuid to book_id';
  end if;
end
$$;

-- If legacy columns exist, map them to normalized columns.
do $$
begin
  -- Map legacy "verse" -> verse_number
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bible_verses'
      and column_name = 'verse'
  ) then
    execute $sql$
      update public.bible_verses
      set verse_number = coalesce(
        verse_number,
        case
          when nullif(trim(verse::text), '') ~ '^[0-9]+$' then trim(verse::text)::int
          else null
        end
      )
      where verse_number is null
    $sql$;
  end if;

  -- Map legacy "content" -> text
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bible_verses'
      and column_name = 'content'
  ) then
    execute $sql$
      update public.bible_verses
      set text = coalesce(nullif(text, ''), nullif(content, ''))
      where coalesce(text, '') = ''
    $sql$;
  end if;
end
$$;

-- -------------------------------------------------------------------
-- 2) Add language/version columns directly in bible_books
-- -------------------------------------------------------------------

alter table if exists public.bible_books
  add column if not exists language_code text,
  add column if not exists version_code text,
  add column if not exists grouping text,
  add column if not exists order_index integer;

-- If grouping was previously an enum (e.g. bible_grouping), convert it to text first.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bible_books'
      and column_name = 'grouping'
      and udt_name not in ('text', 'varchar', 'bpchar')
  ) then
    execute 'alter table public.bible_books alter column grouping type text using grouping::text';
  end if;
end
$$;

-- Backfill language/version for legacy data
update public.bible_books
set language_code = coalesce(nullif(language_code, ''), 'id'),
    version_code = coalesce(nullif(version_code, ''), 'TB');

-- Backfill grouping from legacy columns if available
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bible_books'
      and column_name = 'category'
  ) then
    execute $sql$
      update public.bible_books
      set grouping = case
        when lower(trim(coalesce(category, ''))) in ('perjanjian lama', 'old', 'old testament') then 'old'
        when lower(trim(coalesce(category, ''))) in ('perjanjian baru', 'new', 'new testament') then 'new'
        when lower(trim(coalesce(category, ''))) in ('deuterokanonika', 'deutero', 'deuterocanon') then 'deutero'
        else grouping
      end
      where grouping is null
    $sql$;
  end if;
end
$$;

-- Backfill order_index from legacy columns if available
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bible_books'
      and column_name = 'book_order'
  ) then
    execute $sql$
      update public.bible_books
      set order_index = nullif(book_order, 0)
      where order_index is null
    $sql$;
  end if;
end
$$;

update public.bible_books
set grouping = 'old'
where grouping is null;

-- Normalize legacy grouping labels to canonical values used by app/admin.
update public.bible_books
set grouping = case
  when lower(trim(coalesce(grouping, ''))) in ('', 'old', 'oldtestament', 'old_testament', 'perjanjian lama') then 'old'
  when lower(trim(coalesce(grouping, ''))) in ('new', 'newtestament', 'new_testament', 'perjanjian baru') then 'new'
  when lower(trim(coalesce(grouping, ''))) in ('deutero', 'deuterocanonical', 'deuterocanon', 'deuterokanonika') then 'deutero'
  else 'old'
end;

with ranked as (
  select id, row_number() over (partition by language_code, version_code order by id) as rn
  from public.bible_books
  where order_index is null
)
update public.bible_books b
set order_index = r.rn
from ranked r
where b.id = r.id;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bible_books_grouping_check'
  ) then
    alter table public.bible_books
      add constraint bible_books_grouping_check
      check (grouping in ('old', 'new', 'deutero'));
  end if;
end
$$;

alter table public.bible_books
  alter column language_code set not null,
  alter column version_code set not null,
  alter column grouping set not null,
  alter column order_index set not null;

create index if not exists idx_bible_books_lang_version_order
  on public.bible_books(language_code, version_code, order_index);

create index if not exists idx_bible_books_lang_version_group
  on public.bible_books(language_code, version_code, grouping);

-- -------------------------------------------------------------------
-- 3) Ensure upsert-safe constraints for chapters and verses
-- -------------------------------------------------------------------

-- Backfill chapter_id from legacy flat schema (book_id + chapter).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bible_verses'
      and column_name = 'book_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bible_verses'
      and column_name = 'chapter'
  ) then
    -- Create missing chapters from flat verse records.
    -- Always bridge by text to avoid uuid/integer operator mismatch.
    execute $sql$
      insert into public.bible_chapters (book_id, chapter_number)
      select distinct b.id, trim(v.chapter::text)::int
      from public.bible_verses v
      join public.bible_books b
        on coalesce(nullif(b.legacy_book_id, ''), b.id::text) = v.book_id::text
      where v.book_id is not null
        and nullif(trim(v.chapter::text), '') ~ '^[0-9]+$'
        and not exists (
          select 1
          from public.bible_chapters c
          where c.book_id::text = b.id::text
            and c.chapter_number = trim(v.chapter::text)::int
        )
    $sql$;

    -- Link verses to normalized chapter_id.
    execute $sql$
      update public.bible_verses v
      set chapter_id = c.id
      from public.bible_chapters c
      join public.bible_books b
        on b.id = c.book_id
      where v.chapter_id is null
        and nullif(trim(v.chapter::text), '') ~ '^[0-9]+$'
        and trim(v.chapter::text)::int = c.chapter_number
        and coalesce(nullif(b.legacy_book_id, ''), b.id::text) = v.book_id::text
    $sql$;
  end if;
end
$$;

-- Deduplicate chapters by (book_id, chapter_number) and remap verses first.
do $$
begin
  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.bible_verses'::regclass
      and attname = 'chapter_id'
      and not attisdropped
  ) then
    execute $sql$
      with ranked as (
        select
          id,
          book_id,
          chapter_number,
          row_number() over (
            partition by book_id, chapter_number
            order by id::text
          ) as rn,
          first_value(id) over (
            partition by book_id, chapter_number
            order by id::text
          ) as keep_id
        from public.bible_chapters
      ), remap as (
        select id as duplicate_id, keep_id
        from ranked
        where rn > 1
      )
      update public.bible_verses v
      set chapter_id = r.keep_id
      from remap r
      where v.chapter_id = r.duplicate_id
    $sql$;
  end if;

  execute $sql$
    with ranked as (
      select
        id,
        row_number() over (
          partition by book_id, chapter_number
          order by id::text
        ) as rn
      from public.bible_chapters
    )
    delete from public.bible_chapters c
    using ranked r
    where c.id = r.id
      and r.rn > 1
  $sql$;
end
$$;

-- Deduplicate verses by (chapter_id, verse_number), keeping best populated row.
do $$
begin
  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.bible_verses'::regclass
      and attname = 'chapter_id'
      and not attisdropped
  ) and exists (
    select 1
    from pg_attribute
    where attrelid = 'public.bible_verses'::regclass
      and attname = 'verse_number'
      and not attisdropped
  ) then
    execute $sql$
      with ranked as (
        select
          id,
          row_number() over (
            partition by chapter_id, verse_number
            order by
              case when coalesce(text, '') <> '' then 0 else 1 end,
              id
          ) as rn
        from public.bible_verses
        where chapter_id is not null
          and verse_number is not null
      )
      delete from public.bible_verses v
      using ranked r
      where v.id = r.id
        and r.rn > 1
    $sql$;
  end if;
end
$$;

-- Clean orphan chapter_id values before adding constraint/index.
do $$
begin
  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.bible_verses'::regclass
      and attname = 'chapter_id'
      and not attisdropped
  ) then
    execute $sql$
      update public.bible_verses v
      set chapter_id = null
      where v.chapter_id is not null
        and not exists (
          select 1
          from public.bible_chapters c
          where c.id = v.chapter_id
        )
    $sql$;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bible_chapters_book_id_chapter_number_key'
  ) then
    execute 'alter table public.bible_chapters add constraint bible_chapters_book_id_chapter_number_key unique (book_id, chapter_number)';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.bible_verses'::regclass
      and attname = 'chapter_id'
      and not attisdropped
  ) and exists (
    select 1
    from pg_attribute
    where attrelid = 'public.bible_verses'::regclass
      and attname = 'verse_number'
      and not attisdropped
  ) and not exists (
    select 1 from pg_constraint where conname = 'bible_verses_chapter_id_verse_number_key'
  ) then
    execute 'alter table public.bible_verses add constraint bible_verses_chapter_id_verse_number_key unique (chapter_id, verse_number)';
  end if;
end
$$;

create index if not exists idx_bible_chapters_book_chapter
  on public.bible_chapters(book_id, chapter_number);

do $$
begin
  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.bible_verses'::regclass
      and attname = 'chapter_id'
      and not attisdropped
  ) and exists (
    select 1
    from pg_attribute
    where attrelid = 'public.bible_verses'::regclass
      and attname = 'verse_number'
      and not attisdropped
  ) then
    execute 'create index if not exists idx_bible_verses_chapter_verse on public.bible_verses(chapter_id, verse_number)';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bible_chapters_book_id_fkey'
      and conrelid = 'public.bible_chapters'::regclass
  ) then
    execute 'alter table public.bible_chapters add constraint bible_chapters_book_id_fkey foreign key (book_id) references public.bible_books(id) on delete cascade not valid';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bible_verses_chapter_id_fkey'
      and conrelid = 'public.bible_verses'::regclass
  ) then
    execute 'alter table public.bible_verses add constraint bible_verses_chapter_id_fkey foreign key (chapter_id) references public.bible_chapters(id) on delete cascade not valid';
  end if;
end
$$;

-- -------------------------------------------------------------------
-- 4) Service role grants
-- -------------------------------------------------------------------

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.bible_books to service_role;
grant select, insert, update, delete on table public.bible_chapters to service_role;
grant select, insert, update, delete on table public.bible_verses to service_role;

-- -------------------------------------------------------------------
-- 5) RLS (public read, authenticated write)
-- -------------------------------------------------------------------

alter table public.bible_books enable row level security;
alter table public.bible_chapters enable row level security;
alter table public.bible_verses enable row level security;

drop policy if exists "Public can view bible books" on public.bible_books;
drop policy if exists "Authenticated can manage bible books" on public.bible_books;
create policy "Public can view bible books"
  on public.bible_books for select using (true);
create policy "Authenticated can manage bible books"
  on public.bible_books for all to authenticated using (true) with check (true);

drop policy if exists "Public can view bible chapters" on public.bible_chapters;
drop policy if exists "Authenticated can manage bible chapters" on public.bible_chapters;
create policy "Public can view bible chapters"
  on public.bible_chapters for select using (true);
create policy "Authenticated can manage bible chapters"
  on public.bible_chapters for all to authenticated using (true) with check (true);

drop policy if exists "Public can view bible verses" on public.bible_verses;
drop policy if exists "Authenticated can manage bible verses" on public.bible_verses;
create policy "Public can view bible verses"
  on public.bible_verses for select using (true);
create policy "Authenticated can manage bible verses"
  on public.bible_verses for all to authenticated using (true) with check (true);
