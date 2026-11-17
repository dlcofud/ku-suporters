-- 크레딧 충전 주문과 구독 (결제는 지금 테스트 결제만)
create table if not exists public.orders (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists orders_user on public.orders (user_id, created_at desc);
alter table public.orders enable row level security;

create table if not exists public.subscriptions (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
