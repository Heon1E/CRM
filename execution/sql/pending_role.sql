-- ============================================================================
-- 새로 가입한 계정을 '승인 대기'로 받는다
--
-- **지금은 가입 버튼을 누른 사람이 곧바로 `sales`가 된다.**
-- `sales`는 거래처·매출·활동을 전부 읽고 쓸 수 있다. 배포된 주소는 공개돼
-- 있으므로, 주소를 아는 누구나 계정을 만들어 회사 데이터 전체를 가져갈 수 있다.
-- (구글 로그인도 같은 경로다. 아무 구글 계정이나 들어온다.)
--
-- 그래서 새 계정은 `pending`으로 받는다. `pending`은 **아무것도 못 읽는다.**
-- 관리자가 설정 > 계정 · 권한에서 역할을 올려 줘야 쓸 수 있다.
--
-- 이건 두 겹 중 안쪽이다. 바깥쪽은 Supabase 대시보드에서 가입 자체를 막는 것:
--   Authentication > Sign In / Providers > Email > "Allow new users to sign up" 끄기
--   같은 화면에서 Google provider도 필요 없으면 끄기
-- 바깥이 열려 있어도 안쪽이 막으면 데이터는 지킨다.
--
-- **몇 번을 다시 돌려도 안전하다.** 이미 있는 계정의 역할은 건드리지 않는다.
-- ============================================================================

-- 1. 역할 값에 pending을 더한다 (기존 제약을 갈아 끼운다)
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
    add constraint profiles_role_check check (role in ('admin', 'sales', 'viewer', 'pending'));

-- 기본값도 pending으로. 트리거를 거치지 않고 행이 생겨도 권한이 새지 않는다.
alter table public.profiles alter column role set default 'pending';

-- 2. 새 계정은 pending으로 받는다
--    맨 처음 계정만 admin이다 — 관리자를 심을 방법이 없으면 아무도 못 들어온다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
    first_user boolean;
begin
    select count(*) = 0 into first_user from public.profiles;
    insert into public.profiles (id, email, full_name, role, active)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        case when first_user then 'admin' else 'pending' end,
        true
    )
    on conflict (id) do nothing;
    return new;
end $$;

-- 3. pending은 읽지 못한다
--    can_read가 '역할이 있으면 읽는다'였다. 그래서 pending을 새로 만들어도
--    그대로 두면 아무 소용이 없다. **읽을 수 있는 역할을 적어 둔다.**
create or replace function public.can_read()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() in ('admin', 'sales', 'viewer'), false) $$;

-- can_write는 그대로다 (admin, sales). 확인용으로 다시 적어 둔다.
create or replace function public.can_write()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() in ('admin', 'sales'), false) $$;

-- 4. 확인 — 지금 계정과 역할
select email, role, active, created_at::date as 가입일
from public.profiles
order by case role when 'pending' then 0 when 'admin' then 1 else 2 end, email;

-- 승인 대기 계정이 있으면 여기 맨 위에 뜬다.
-- 모르는 계정이 있으면 Supabase > Authentication > Users 에서 지울 것.
