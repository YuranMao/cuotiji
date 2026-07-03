-- 在 Supabase SQL Editor 中执行:
-- https://owuckenvwmdsithqvsod.supabase.co → SQL Editor

create table chapters (
  id bigserial primary key,
  name text not null,
  created_at timestamptz default now()
);

create table knowledge_points (
  id bigserial primary key,
  chapter_id bigint references chapters(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table questions (
  id bigserial primary key,
  knowledge_point_id bigint references knowledge_points(id) on delete cascade,
  image_data text not null,
  first_upload_date date not null,
  review_count int default 0,
  review_dates jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- 启用 RLS
alter table chapters enable row level security;
alter table knowledge_points enable row level security;
alter table questions enable row level security;

-- 允许 anon key 全权限操作（个人应用）
create policy "Allow all on chapters" on chapters for all using (true);
create policy "Allow all on knowledge_points" on knowledge_points for all using (true);
create policy "Allow all on questions" on questions for all using (true);
