-- ---------------------------------------------------------------------------
-- 관리자 올리기
--
-- `auth_and_roles.sql`의 트리거는 **profiles가 비어 있을 때만** 첫 계정을
-- admin으로 만든다. 그런데 이 프로젝트에는 `profiles` 표가 예전부터 있었고
-- 행도 이미 들어 있었다(옛 Google 로그인 등). 그래서 나중에 만든 계정은
-- '첫 계정' 판정을 못 받고 `sales`로 들어간다.
--
-- 화면에서는 못 올린다 — 자기 역할을 스스로 바꾸는 것은 RLS가 막는다(의도한 것).
-- 그러니 여기서 한 번 올린다.
--
-- Supabase SQL Editor에서 실행할 것.
-- ---------------------------------------------------------------------------

-- 1) 지금 누가 있는지 본다
select
    p.id,
    p.email,
    p.full_name,
    p.role,
    p.sales_rep,
    p.active,
    p.created_at
from public.profiles p
order by p.created_at;

-- 2) 올릴 사람을 정한다.
--    아이디(이메일 앞부분)로 찾는다 — `heoniree@idibc.local`이든
--    `heoniree@gmail.com`이든 둘 다 걸린다.
update public.profiles
set role = 'admin', active = true, updated_at = now()
where split_part(coalesce(email, ''), '@', 1) = 'heoniree';

-- 3) 확인 — role이 admin으로 바뀌었는지
select email, role, sales_rep, active
from public.profiles
order by created_at;

-- ---------------------------------------------------------------------------
-- 쓰지 않는 계정이 있다면 (옛 Google 로그인 등) 아래로 잠글 수 있다.
-- 지우지 말고 잠그는 편이 낫다 — 그 계정이 남긴 기록이 있을 수 있다.
--
-- update public.profiles set active = false
-- where split_part(coalesce(email, ''), '@', 1) <> 'heoniree';
-- ---------------------------------------------------------------------------
