-- 在 Supabase SQL Editor 中执行:
-- https://owuckenvwmdsithqvsod.supabase.co → SQL Editor

create table if not exists chapters (
  id bigserial primary key,
  name text not null,
  created_at timestamptz default now(),
  sort_order int default 0
);

create table if not exists knowledge_points (
  id bigserial primary key,
  chapter_id bigint references chapters(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  sort_order int default 0,
  note text default '',
  color text default ''
);

create table if not exists questions (
  id bigserial primary key,
  knowledge_point_id bigint references knowledge_points(id) on delete cascade,
  image_data text not null,
  answer text default '',
  answer_image text default '',
  note text default '',
  first_upload_date date not null,
  file_name text,
  sort_order int default 0,
  correct_count int default 0,
  wrong_count int default 0,
  review_log jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists ebbinghaus_items (
  id bigserial primary key,
  name text not null,
  first_date date not null default current_date,
  subject text default '专业课',
  reviews jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists political_mindmaps (
  id bigserial primary key,
  name text not null,
  code text not null default 'mindmap\n  root((章节))',
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists sentence_analyses (
  id bigserial primary key,
  sentence text not null,
  question_type text not null default 'translation',
  hint text default '',
  analysis jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table sentence_analyses
  add column if not exists question_type text not null default 'translation';

create table if not exists phrase_pairs (
  id bigserial primary key,
  phrase text not null,
  meaning text default '',
  note text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists vocab_spectrum_entries (
  id bigserial primary key,
  word text not null,
  entry_type text not null check (entry_type in ('meaning', 'usage')),
  detail text not null,
  example text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists vocab_spectrum_entries_word_idx
  on vocab_spectrum_entries (lower(word));

create table if not exists timeline_events (
  id bigserial primary key,
  subject text not null,
  label text not null,
  start_date date not null,
  end_date date not null,
  color text,
  created_at timestamptz default now()
);

create table if not exists core_questions (
  id bigserial primary key,
  chapter_id bigint references chapters(id) on delete cascade,
  name text,
  image_data text not null,
  tag text default '',
  note text default '',
  sort_order int default 0,
  correct_count int default 0,
  wrong_count int default 0,
  review_log jsonb default '[]',
  created_at timestamptz default now()
);

-- 已存在的表执行以下升级：
alter table knowledge_points add column if not exists note text default '';
alter table knowledge_points add column if not exists color text default '';
alter table questions add column if not exists answer text default '';
alter table questions add column if not exists answer_image text default '';
alter table questions add column if not exists note text default '';
alter table core_questions add column if not exists note text default '';
alter table core_questions add column if not exists answer text default '';
alter table core_questions add column if not exists answer_image text default '';

-- 如果 core_questions 表已存在，执行以下 alter 来升级：
-- alter table core_questions alter column name drop not null;
-- alter table core_questions add column if not exists sort_order int;
-- alter table core_questions add column if not exists correct_count int default 0;
-- alter table core_questions add column if not exists wrong_count int default 0;
-- alter table core_questions add column if not exists review_log jsonb default '[]';

create table if not exists schedule_time_slots (
  id bigserial primary key,
  slot_name text not null,
  sort_order int,
  created_at timestamptz default now()
);

create table if not exists daily_schedule (
  id bigserial primary key,
  time_slot text not null,
  record_date date not null,
  subject text,
  label text,
  created_at timestamptz default now()
);

-- 启用 RLS
alter table chapters enable row level security;
alter table knowledge_points enable row level security;
alter table questions enable row level security;
alter table ebbinghaus_items enable row level security;
alter table timeline_events enable row level security;
alter table core_questions enable row level security;
alter table schedule_time_slots enable row level security;
alter table daily_schedule enable row level security;
alter table political_mindmaps enable row level security;
alter table sentence_analyses enable row level security;
alter table phrase_pairs enable row level security;
alter table vocab_spectrum_entries enable row level security;

-- 允许 anon key 全权限操作（个人应用）
do $$
begin
  if not exists (select 1 from pg_policies where policyname='Allow all on chapters') then
    create policy "Allow all on chapters" on chapters for all using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='Allow all on knowledge_points') then
    create policy "Allow all on knowledge_points" on knowledge_points for all using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='Allow all on questions') then
    create policy "Allow all on questions" on questions for all using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='Allow all on ebbinghaus_items') then
    create policy "Allow all on ebbinghaus_items" on ebbinghaus_items for all using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='Allow all on timeline_events') then
    create policy "Allow all on timeline_events" on timeline_events for all using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='Allow all on core_questions') then
    create policy "Allow all on core_questions" on core_questions for all using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='Allow all on schedule_time_slots') then
    create policy "Allow all on schedule_time_slots" on schedule_time_slots for all using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='Allow all on daily_schedule') then
    create policy "Allow all on daily_schedule" on daily_schedule for all using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='Allow all on political_mindmaps') then
    create policy "Allow all on political_mindmaps" on political_mindmaps for all using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='Allow all on sentence_analyses') then
    create policy "Allow all on sentence_analyses" on sentence_analyses for all using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='Allow all on phrase_pairs') then
    create policy "Allow all on phrase_pairs" on phrase_pairs for all using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='Allow all on vocab_spectrum_entries') then
    create policy "Allow all on vocab_spectrum_entries" on vocab_spectrum_entries for all using (true);
  end if;
end $$;

-- 章节来源清单：已有数据库可单独执行此段。
create table if not exists public.chapter_sources (
  id uuid primary key default gen_random_uuid(),
  chapter_id bigint not null references public.chapters(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists chapter_sources_chapter_id_idx
  on public.chapter_sources (chapter_id);

alter table public.chapter_sources enable row level security;

-- 沿用现有个人应用的 anon 访问方式。
grant select, insert, update, delete on public.chapter_sources to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chapter_sources'
      and policyname = 'Allow all on chapter_sources'
  ) then
    create policy "Allow all on chapter_sources"
      on public.chapter_sources for all to anon, authenticated
      using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';

-- 全局来源及任意深度层级：已有数据库可单独执行此事务，支持重复执行。
begin;

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  parent_id uuid references public.sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint sources_parent_not_self check (parent_id is distinct from id)
);

create unique index if not exists sources_parent_name_key
  on public.sources (parent_id, name) where parent_id is not null;
create unique index if not exists sources_root_name_key
  on public.sources (name) where parent_id is null;

create or replace function public.check_source_hierarchy()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  ancestor_id uuid := new.parent_id;
  visited_ids uuid[] := array[new.id];
begin
  while ancestor_id is not null loop
    if ancestor_id = any(visited_ids) then
      raise exception 'Source hierarchy must not contain a cycle'
        using errcode = '23514';
    end if;
    visited_ids := array_append(visited_ids, ancestor_id);
    -- 锁住祖先的父关系，避免并发改挂节点时形成环；无递归深度上限。
    select s.parent_id into ancestor_id
    from public.sources as s
    where s.id = ancestor_id
    for update;
  end loop;
  return new;
end;
$$;

drop trigger if exists sources_check_hierarchy on public.sources;
create trigger sources_check_hierarchy
  before insert or update of id, parent_id on public.sources
  for each row execute function public.check_source_hierarchy();

alter table public.chapter_sources
  add column if not exists source_id uuid;
alter table public.questions
  add column if not exists source_id uuid;
alter table public.core_questions
  add column if not exists source_id uuid;

-- 在映射及去重期间阻止并发写入；旧 name 保留，已关联的来源不重新映射。
lock table public.chapter_sources in access exclusive mode;
lock table public.sources in share row exclusive mode;

insert into public.sources (name)
select distinct btrim(cs.name)
from public.chapter_sources as cs
where cs.source_id is null
on conflict (name) where parent_id is null do nothing;

update public.chapter_sources as cs
set source_id = s.id
from public.sources as s
where cs.source_id is null
  and s.parent_id is null
  and s.name = btrim(cs.name);

with merged as (
  select chapter_id, source_id, bool_or(done) as done,
    (array_agg(id order by created_at, id))[1] as keep_id
  from public.chapter_sources
  group by chapter_id, source_id
)
update public.chapter_sources as cs
set done = merged.done
from merged
where cs.id = merged.keep_id
  and cs.done is distinct from merged.done;

with ranked as (
  select id, row_number() over (
    partition by chapter_id, source_id order by created_at, id
  ) as position
  from public.chapter_sources
)
delete from public.chapter_sources as cs
using ranked
where cs.id = ranked.id and ranked.position > 1;

alter table public.chapter_sources alter column source_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.chapter_sources'::regclass
      and conname = 'chapter_sources_source_id_fkey'
  ) then
    alter table public.chapter_sources
      add constraint chapter_sources_source_id_fkey
      foreign key (source_id) references public.sources(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.chapter_sources'::regclass
      and conname = 'chapter_sources_chapter_id_source_id_key'
  ) then
    alter table public.chapter_sources
      add constraint chapter_sources_chapter_id_source_id_key
      unique (chapter_id, source_id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.questions'::regclass
      and conname = 'questions_source_id_fkey'
  ) then
    alter table public.questions
      add constraint questions_source_id_fkey
      foreign key (source_id) references public.sources(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.core_questions'::regclass
      and conname = 'core_questions_source_id_fkey'
  ) then
    alter table public.core_questions
      add constraint core_questions_source_id_fkey
      foreign key (source_id) references public.sources(id) on delete set null;
  end if;
end $$;

create index if not exists chapter_sources_source_id_idx
  on public.chapter_sources (source_id);
create index if not exists questions_source_id_idx
  on public.questions (source_id);
create index if not exists core_questions_source_id_idx
  on public.core_questions (source_id);

alter table public.sources enable row level security;
grant select, insert, update, delete on public.sources to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sources'
      and policyname = 'Allow all on sources'
  ) then
    create policy "Allow all on sources"
      on public.sources for all to anon, authenticated
      using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
