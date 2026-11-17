-- 아이디·비밀번호 로그인
-- password_hash 는 scrypt 해시("scrypt$N$salt$hash"). 비밀번호 원문은 저장하지 않는다.
alter table public.app_users add column if not exists login_id text;
alter table public.app_users add column if not exists password_hash text;
create unique index if not exists app_users_login_id on public.app_users (login_id);
