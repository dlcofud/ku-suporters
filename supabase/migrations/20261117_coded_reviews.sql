-- 팀이 코딩한 합격 후기 (경향 분석의 '분석' 단계)
-- 후기 원문은 저장하지 않는다. 출처·우리 말 요약·점수·키워드·근거(우리 말)만 data(jsonb)에 둔다.
create table if not exists public.coded_reviews (
  id text primary key,
  url text not null,
  status text not null check (status in ('AI 초안', '검수 완료')),
  created_by uuid references public.app_users(id) on delete set null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists coded_reviews_url on public.coded_reviews (url);
-- 서버의 secret 키로만 접근한다 (다른 테이블과 같은 방식)
alter table public.coded_reviews enable row level security;
