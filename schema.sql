-- 在 Supabase SQL Editor 中执行:
-- https://owuckenvwmdsithqvsod.supabase.co → SQL Editor

create table if not exists chapters (
  id bigserial primary key,
  name text not null,
  created_at timestamptz default now(),
  sort_order int
);

create table if not exists knowledge_points (
  id bigserial primary key,
  chapter_id bigint references chapters(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  sort_order int
);

create table if not exists questions (
  id bigserial primary key,
  knowledge_point_id bigint references knowledge_points(id) on delete cascade,
  image_data text not null,
  first_upload_date date not null,
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
  correct_count int default 0,
  wrong_count int default 0,
  review_log jsonb default '[]',
  created_at timestamptz default now()
);

-- 如果 core_questions 表已存在，执行以下 alter 来升级：
-- alter table core_questions alter column name drop not null;
-- alter table core_questions add column if not exists correct_count int default 0;
-- alter table core_questions add column if not exists wrong_count int default 0;
-- alter table core_questions add column if not exists review_log jsonb default '[]';

create table if not exists daily_schedule (
  id bigserial primary key,
  time_slot text not null,
  record_date date not null,
  subject text,
  label text,
  created_at timestamptz default now()
);

-- 如果 ebbinghaus_items 还没有 note 列，请执行：
-- ALTER TABLE ebbinghaus_items ADD COLUMN IF NOT EXISTS note text;

-- 启用 RLS
alter table chapters enable row level security;
alter table knowledge_points enable row level security;
alter table questions enable row level security;
alter table ebbinghaus_items enable row level security;
alter table timeline_events enable row level security;
alter table core_questions enable row level security;
alter table daily_schedule enable row level security;

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
  if not exists (select 1 from pg_policies where policyname='Allow all on daily_schedule') then
    create policy "Allow all on daily_schedule" on daily_schedule for all using (true);
  end if;
end $$;
