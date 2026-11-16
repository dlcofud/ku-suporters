-- 콘텐츠 제작·예약 게시

-- 업로드한 촬영 클립 (영상 파일은 Storage에, 여기에는 메타데이터만)
create table public.content_clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete cascade,
  plan_item_id text,
  scene_index integer,
  storage_path text not null,
  duration_sec numeric not null,
  has_audio boolean not null,
  created_at timestamptz not null default now()
);

-- 편집 작업 (장면 계획 + 편집 계획 + 결과물 위치)
create table public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_item_id text,
  scenes jsonb not null,
  edit_plan jsonb not null,
  status text not null default 'queued' check (status in ('queued','rendering','done','failed')),
  output_path text,
  error text,
  created_at timestamptz not null default now()
);

-- 예약 게시
create table public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ig_user_id text not null,
  plan_item_id text,
  media_type text not null check (media_type in ('REELS','IMAGE')),
  media_url text not null,
  caption text not null,
  share_to_feed boolean not null default true,
  publish_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','container_created','ready','published','failed','canceled')),
  container_id text,
  media_id text,
  attempts integer not null default 0,
  last_error text,
  log jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index scheduled_posts_due on public.scheduled_posts (status, publish_at);

alter table public.content_clips enable row level security;
alter table public.render_jobs enable row level security;
alter table public.scheduled_posts enable row level security;
create policy "own clips" on public.content_clips for all using (auth.uid() = user_id);
create policy "own renders" on public.render_jobs for select using (auth.uid() = user_id);
create policy "own schedules read" on public.scheduled_posts for select using (auth.uid() = user_id);
-- 예약 생성·취소와 tick 실행은 서버 라우트(service role)에서만
