-- 지원서 코치: 대화 기록과 문항별 글 (활동 하나에 지원서 하나)
alter table public.activities add column if not exists application jsonb;
