-- ============================================================
-- 고래영어 원생관리 · 서버형(클라우드) 스키마
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 [Run] 하세요.
-- 한 번만 실행하면 됩니다. 다시 실행해도 안전합니다.
-- ============================================================

-- 기록 한 줄이 학생 1명, 출결 1건, 청구서 1건에 해당합니다.
create table if not exists public.records (
  kind        text        not null,   -- student / attendance / patrol / memo / task / payment / academy
  id          text        not null,
  data        jsonb       not null default '{}'::jsonb,
  deleted     boolean     not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  primary key (kind, id)
);

-- 바뀐 기록만 빠르게 받아오기 위한 색인
create index if not exists records_updated_at_idx on public.records (updated_at);

-- 수정 시각은 서버가 찍습니다.
-- 선생님들 기기의 시계가 서로 조금씩 달라도 순서가 뒤집히지 않게 하기 위해서입니다.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch
  before insert or update on public.records
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 접근 권한 (RLS)
--  · 로그인한 학원 계정만 읽고 쓸 수 있습니다.
--  · 로그인하지 않은 사람은 한 줄도 볼 수 없습니다.
--  · 진짜 삭제(delete)는 아무도 못 합니다. 삭제는 deleted 표시로만 이뤄지며,
--    그래야 다른 선생님 기기에도 삭제가 전달됩니다.
-- ============================================================
alter table public.records enable row level security;

drop policy if exists "staff can read"   on public.records;
drop policy if exists "staff can insert" on public.records;
drop policy if exists "staff can update" on public.records;

create policy "staff can read"
  on public.records for select
  to authenticated
  using (true);

create policy "staff can insert"
  on public.records for insert
  to authenticated
  with check (true);

create policy "staff can update"
  on public.records for update
  to authenticated
  using (true)
  with check (true);
