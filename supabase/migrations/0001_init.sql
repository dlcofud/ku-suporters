-- 서포트랩 초기 스키마 (초안)
-- 원칙: 원본 콘텐츠(사진·영상·캡션·공고 원문)는 저장하지 않는다. 지표·요약·출처만 저장한다.

-- 사용자 프로필 (auth.users와 1:1)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  major text,
  plan text not null default 'free' check (plan in ('free','basic','pro')),
  created_at timestamptz not null default now()
);

-- 크레딧 원장 (잔액은 저장하지 않고 합계로 계산)
create table public.credit_ledger (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  reason text not null,
  status text not null check (status in ('posted','pending','void')),
  idempotency_key text,
  ref_id text,
  memo text,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create view public.credit_balances as
  select user_id,
    coalesce(sum(amount) filter (where status = 'posted'), 0) as posted,
    coalesce(-sum(amount) filter (where status = 'pending' and amount < 0), 0) as held,
    coalesce(sum(amount) filter (where status = 'pending' and amount > 0), 0) as incoming
  from public.credit_ledger group by user_id;

-- 사용자가 준비 중인 활동 (공고 분석 결과)
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  source_url text,
  deadline date,
  announcement_date date,
  analysis jsonb not null,          -- notice.NoticeAnalysis (원문 제외)
  skeleton jsonb,                   -- skeleton.Skeleton
  plan jsonb,                       -- planner.Plan
  created_at timestamptz not null default now()
);

-- 연결한 인스타그램 계정 (토큰은 서버 전용 컬럼, 클라이언트에 노출 금지)
create table public.ig_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  ig_user_id text not null,
  username text,
  access_token_encrypted text not null,
  connected_at timestamptz not null default now()
);

-- 게시물 지표 스냅샷 (원본 미저장)
create table public.media_metrics (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  posted_on date not null,
  format text not null check (format in ('reels','cardnews','post')),
  permalink text,
  views integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  saves integer not null default 0,
  fetched_at timestamptz not null default now()
);

-- 합격자 기여
create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_key text not null,
  activity_name text not null,
  result text check (result in ('final_pass','document_pass','fail')),
  selected_media_ids text[] not null default '{}',
  proof_upload_ref text,            -- 검수 후 삭제
  structure jsonb,                  -- 문항별 강조점만, 원문 아님
  status text not null default 'draft'
    check (status in ('draft','submitted','in_review','approved','rejected','withdrawn')),
  review jsonb,
  history jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (user_id, activity_key)
);

-- 동의 기록 (버전·시각 보관, 철회 시 withdrawn_at 기록)
create table public.consents (
  id bigint generated always as identity primary key,
  contribution_id uuid not null references public.contributions(id) on delete cascade,
  kind text not null check (kind in ('copyright_use','personal_info','withdrawal_info','own_work')),
  agreed boolean not null,
  version text not null,
  agreed_at timestamptz not null,
  withdrawn_at timestamptz
);

-- 팀 큐레이션 데이터 (구글 시트에서 가져온 것: 출처·요약·점수·키워드만)
create table public.curated_reviews (
  id text primary key,
  url text not null unique,
  source_citation text not null,
  org text, activity text, field text, result text,
  scores jsonb not null default '{}',
  keywords text[] not null default '{}',
  process_keywords text[] not null default '{}',
  tip text,
  reliability text,
  review_status text,
  imported_at timestamptz not null default now()
);

-- 행 수준 보안: 본인 데이터만
alter table public.profiles enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.activities enable row level security;
alter table public.ig_accounts enable row level security;
alter table public.media_metrics enable row level security;
alter table public.contributions enable row level security;
alter table public.consents enable row level security;
alter table public.curated_reviews enable row level security;

create policy "own profile" on public.profiles for all using (auth.uid() = id);
create policy "own ledger read" on public.credit_ledger for select using (auth.uid() = user_id); -- 쓰기는 서버(service role)만
create policy "own activities" on public.activities for all using (auth.uid() = user_id);
create policy "own media" on public.media_metrics for select using (auth.uid() = user_id);
create policy "own contributions" on public.contributions for select using (auth.uid() = user_id);
create policy "own consents" on public.consents for select using (
  exists (select 1 from public.contributions c where c.id = contribution_id and c.user_id = auth.uid())
);
create policy "curated readable" on public.curated_reviews for select using (true);
-- ig_accounts: 정책 없음 = 클라이언트 접근 불가, 서버만 사용
