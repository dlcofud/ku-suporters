-- 서포트랩 스키마 (ku_suporters)
-- 접근 방식: 브라우저는 DB에 직접 접근하지 않고, Next.js 서버가 secret 키로만 읽고 쓴다.
-- 그래서 모든 테이블에 RLS를 켜고 정책을 두지 않는다 (= anon/authenticated 키로는 접근 불가).
-- 원칙: 공고 원문, 게시물 사진·캡션 원본은 저장하지 않는다. 지표·요약·출처만 저장한다.

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  ig_user_id text,
  ig_username text,
  ig_access_token text,            -- 서버 전용. 배포 시 Vault 등으로 암호화 권장
  created_at timestamptz not null default now()
);

create table public.credit_ledger (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  amount integer not null,
  reason text not null,
  status text not null check (status in ('posted','pending','void')),
  idempotency_key text,
  ref_id text,
  memo text,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index credit_ledger_user on public.credit_ledger (user_id);

create table public.activities (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  name text not null,
  source_url text,
  analysis jsonb not null,          -- 공고에서 뽑은 사실 (원문 제외)
  guides jsonb not null default '[]',
  plan jsonb,
  skeleton jsonb,
  account_kit jsonb,
  created_at timestamptz not null default now()
);
create index activities_user on public.activities (user_id, created_at desc);

create table public.scene_plans (
  user_id uuid not null references public.app_users(id) on delete cascade,
  plan_item_id text not null,
  scenes jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_item_id)
);

create table public.content_clips (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  plan_item_id text not null,
  scene_index integer not null,
  storage_key text not null,
  duration_sec numeric not null,
  has_audio boolean not null,
  created_at timestamptz not null default now()
);
create index content_clips_item on public.content_clips (user_id, plan_item_id);

create table public.renders (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  plan_item_id text not null,
  storage_key text not null,
  total_sec numeric not null,
  created_at timestamptz not null default now()
);
create index renders_item on public.renders (user_id, plan_item_id);

create table public.scheduled_posts (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  plan_item_id text,
  status text not null,
  publish_at timestamptz not null,
  data jsonb not null,              -- publish.ScheduledPost 전체
  updated_at timestamptz not null default now()
);
create index scheduled_posts_due on public.scheduled_posts (status, publish_at);
create index scheduled_posts_user on public.scheduled_posts (user_id);

create table public.contributions (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  activity_key text not null,
  activity_name text not null,
  status text not null,
  data jsonb not null,              -- contribution.Contribution 전체 (동의 기록 포함)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contributions_status on public.contributions (status);
create index contributions_user on public.contributions (user_id);

create table public.demo_media (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  media jsonb not null
);

alter table public.app_users enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.activities enable row level security;
alter table public.scene_plans enable row level security;
alter table public.content_clips enable row level security;
alter table public.renders enable row level security;
alter table public.scheduled_posts enable row level security;
alter table public.contributions enable row level security;
alter table public.demo_media enable row level security;

-- 영상·증빙 파일 버킷 (비공개). 인스타가 가져갈 때는 서버가 만든 서명 URL을 쓴다.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 209715200)
on conflict (id) do nothing;
