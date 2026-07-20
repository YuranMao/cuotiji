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

-- 启用 RLS
alter table chapters enable row level security;
alter table knowledge_points enable row level security;
alter table questions enable row level security;
alter table ebbinghaus_items enable row level security;
alter table timeline_events enable row level security;

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
end $$;
