-- ============================================================================
-- 개인 설정(settings) 표에 쓰기 정책을 준다
--
-- **증상** — 설정 화면을 열면 콘솔에 이렇게 뜬다:
--   `new row violates row-level security policy for table "settings"`
--
-- RLS를 닫을 때(auth_and_roles.sql) 업무 표 16개만 열어 줬는데 이 표가 빠졌다.
-- 읽지도 쓰지도 못하니 앱이 기본 설정 한 줄을 만들려다 막힌다.
--
-- 업무를 막지는 않는다(화면은 기본값으로 돈다). 다만 알림 켜고 끄기가
-- 저장되지 않고, 콘솔에 붉은 오류가 남아 진짜 고장으로 읽힌다.
--
-- **자기 줄만** 읽고 쓴다. 남의 알림 설정을 볼 이유가 없다.
-- 몇 번을 다시 돌려도 안전하다.
-- ============================================================================

alter table public.settings enable row level security;

-- 이 표에 붙어 있던 옛 정책을 모두 지운다 (이름을 몰라도 훑어서 지운다)
do $$
declare r record;
begin
    for r in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'settings'
    loop
        execute format('drop policy if exists %I on public.settings', r.policyname);
    end loop;
end $$;

-- `(select auth.uid())`로 감싼다. 감싸지 않으면 행마다 평가된다.
create policy "settings 내 것만 읽기" on public.settings
    for select to authenticated
    using (user_id = (select auth.uid()));

create policy "settings 내 것만 만들기" on public.settings
    for insert to authenticated
    with check (user_id = (select auth.uid()));

create policy "settings 내 것만 고치기" on public.settings
    for update to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

create policy "settings 내 것만 지우기" on public.settings
    for delete to authenticated
    using (user_id = (select auth.uid()));

-- 확인 — 정책 4개가 보여야 한다
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'settings'
order by cmd;
