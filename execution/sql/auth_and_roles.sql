-- ---------------------------------------------------------------------------
-- 로그인 · 역할 · 접근제어
--
-- 지금까지는 RLS가 `to authenticated, anon using (true) with check (true)`
-- 였다. 배포 번들에 anon 키가 그대로 박혀 있으므로 **주소를 아는 사람은
-- 누구나 거래처·매출·채권을 읽고 쓰고 지울 수 있었다.**
-- 이 파일이 그것을 닫는다.
--
-- Supabase SQL Editor에 붙여넣어 한 번에 실행할 것.
-- **몇 번을 다시 돌려도 안전하다.** 이미 있는 것은 건드리지 않고 모자란 것만 채운다.
--
-- ⚠ 실행 전에 읽을 것
--   `api/telegram-webhook.js`·`api/daily-digest.js`는 서버에서 도는데
--   키가 없으면 VITE_ anon 키로 폴백한다. 이 파일을 실행한 뒤에는 anon으로
--   아무것도 못 하므로 **Vercel 환경변수에 `SUPABASE_SERVICE_ROLE_KEY`를
--   반드시 넣어야** 봇과 아침 브리핑이 산다.
--   (Supabase > Project Settings > API > service_role. VITE_ 접두어 금지.)
--
-- 이미 겪은 문제 두 가지 — 같은 실수를 반복하지 말 것
--   1. `profiles` 표가 예전부터 있었다. `create table if not exists`는 조용히
--      건너뛰므로 뒤따르는 `sales_rep` 참조가 42703으로 죽는다.
--      → 컬럼은 전부 `add column if not exists`로 따로 채운다.
--   2. 그 표의 기존 정책이 **자기 자신을 조회**해 42P17(무한 재귀)이 났다.
--      → 정책 안에서는 `profiles`를 직접 읽지 않는다. 판정은 전부
--        SECURITY DEFINER 함수를 거친다 (RLS를 우회하므로 재귀가 없다).
-- ---------------------------------------------------------------------------

-- ========================== 0. 지금 상태 보기 ==========================
-- 실행하면 결과창에 현재 profiles 컬럼이 뜬다. 문제가 생기면 이걸 먼저 확인.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

-- ========================== 1. 표와 컬럼 ==========================
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade
);

-- 이미 있던 표일 수 있으므로 컬럼은 하나씩 채운다.
-- `role`은 일부러 text로 둔다 — 예전 표에 enum이 아닌 text로 있을 수 있고,
-- 그때 형이 어긋나면 정책이 통째로 깨진다. 값은 아래 제약으로 지킨다.
alter table public.profiles add column if not exists email      text;
alter table public.profiles add column if not exists full_name  text;
alter table public.profiles add column if not exists sales_rep  text;
alter table public.profiles add column if not exists role       text;
alter table public.profiles add column if not exists active     boolean;
alter table public.profiles add column if not exists created_at timestamptz;
alter table public.profiles add column if not exists updated_at timestamptz;

-- 비어 있는 값 채우기 (기존 행이 있을 수 있다)
update public.profiles set role       = 'sales' where role is null;
update public.profiles set active     = true    where active is null;
update public.profiles set created_at = now()   where created_at is null;
update public.profiles set updated_at = now()   where updated_at is null;

-- 새로 생기는 행은 '승인 대기'다. 가입만으로 데이터가 열리면 안 된다
-- (배포 주소는 공개돼 있다). 관리자가 설정 > 계정 · 권한에서 올려 준다.
alter table public.profiles alter column role       set default 'pending';
alter table public.profiles alter column active     set default true;
alter table public.profiles alter column created_at set default now();
alter table public.profiles alter column updated_at set default now();
alter table public.profiles alter column role   set not null;
alter table public.profiles alter column active set not null;

-- 역할 값은 셋 중 하나
do $$ begin
    alter table public.profiles
        add constraint profiles_role_check check (role in ('admin', 'sales', 'viewer', 'pending'));
exception when duplicate_object then null;
end $$;

create index if not exists idx_profiles_rep on public.profiles (sales_rep);

-- ========================== 2. 계정 생성 시 프로필 ==========================
-- **맨 처음 생기는 계정은 admin이다** — 관리자를 손으로 심을 방법이 없으면
-- 아무도 들어올 수 없다. 두 번째부터는 **승인 대기(pending)** 로 들어온다.
-- pending은 아무것도 못 읽는다. 관리자가 올려 줘야 쓸 수 있다.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- 이미 가입돼 있는데 프로필이 없는 계정을 채운다 (이 파일을 늦게 돌린 경우)
insert into public.profiles (id, email, full_name, role, active)
select u.id, u.email,
       coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
       case when not exists (select 1 from public.profiles) then 'admin' else 'pending' end,
       true
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- ========================== 3. 판정 함수 ==========================
-- **정책 안에서 profiles를 직접 읽으면 무한 재귀(42P17)가 난다.**
-- SECURITY DEFINER 함수는 RLS를 우회하므로 안전하다. 판정은 전부 여기를 거친다.
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and active $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() = 'admin', false) $$;

/**
 * 읽을 수 있는가.
 *
 * **'역할이 있으면 읽는다'로 두면 안 된다.** 승인 대기(pending)도 역할이므로
 * 가입만으로 회사 데이터가 통째로 열린다. 읽을 수 있는 역할을 적어 둔다.
 */
create or replace function public.can_read()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() in ('admin', 'sales', 'viewer'), false) $$;

/** 고칠 수 있는가 — 조회전용(viewer)은 못 고친다 */
create or replace function public.can_write()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() in ('admin', 'sales'), false) $$;

/** 내 한글 이름 (clients.sales_rep과 맞물린다) */
create or replace function public.my_sales_rep()
returns text
language sql stable security definer set search_path = public
as $$ select sales_rep from public.profiles where id = auth.uid() and active $$;

-- ========================== 4. profiles 자신의 접근제어 ==========================
alter table public.profiles enable row level security;

-- 예전 정책을 **이름을 모르더라도** 전부 걷어낸다.
-- 재귀를 일으키던 정책이 여기에 있었다.
do $$
declare p record;
begin
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'profiles'
    loop
        execute format('drop policy if exists %I on public.profiles', p.policyname);
    end loop;
end $$;

-- 내 프로필은 내가, 남의 프로필은 관리자만
create policy "profiles select" on public.profiles for select to authenticated
    using (id = (select auth.uid()) or (select public.is_admin()));

-- 내 이름은 내가 고칠 수 있다. **역할은 못 바꾼다** (스스로 관리자가 되면 안 된다).
-- my_role()은 SECURITY DEFINER라 여기서 profiles를 읽어도 재귀하지 않는다.
create policy "profiles update self" on public.profiles for update to authenticated
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()) and role = (select public.my_role()));

create policy "profiles admin all" on public.profiles for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));

-- ========================== 5. 업무 표 전체 ==========================
--
-- **판정 함수는 반드시 `(select ...)`로 감싼다.**
-- 그냥 `using (public.can_read())`라고 쓰면 Postgres가 이것을 행 필터로 보고
-- **행마다 한 번씩** 부른다. 매출이 15,221행이니 조회 한 번에 함수가 15,221번
-- 돌고, 그때마다 profiles를 다시 읽는다. 대시보드 한 번 여는 데 몇 배가 느려졌다.
-- `(select ...)`로 감싸면 InitPlan이 되어 **조회당 한 번만** 평가된다.
--
-- 읽기  : 로그인한 활성 계정 전부
--         (영업사원 3명이 전사 매출을 함께 본다. KPI 수익성이 전사 기준이고,
--          담당을 지정하지 않는 거래처가 대부분이라(중요 거래처에만 지정한다)
--          담당별로 막으면 화면이 텅 빈다.
--          회사가 커져 담당별 격리가 필요해지면 can_read()만 좁히면 된다.)
-- 쓰기  : admin + sales
-- 지우기: **admin만.** 되돌릴 수단이 아직 없으므로 지우기는 좁게 연다.
--
do $$
declare
    t text;
    p record;
    tables text[] := array[
        'clients', 'sales', 'activities', 'products', 'client_contacts',
        'schedules', 'receivables', 'issues',
        'quotes', 'quote_items', 'purchase_orders', 'po_items',
        'company_profile', 'revenue_forecasts', 'telegram_inbox', 'bot_allowlist'
    ];
begin
    foreach t in array tables loop
        if to_regclass(format('public.%I', t)) is null then
            raise notice '건너뜀 (표 없음): %', t;
            continue;
        end if;

        execute format('alter table public.%I enable row level security', t);

        -- 이름을 모르는 옛 정책까지 전부 걷어낸다 (anon 전체 허용이 여기 있었다)
        for p in select policyname from pg_policies
                 where schemaname = 'public' and tablename = t
        loop
            execute format('drop policy if exists %I on public.%I', p.policyname, t);
        end loop;

        execute format(
            'create policy "%1$s select" on public.%1$I for select to authenticated using ((select public.can_read()))', t);
        execute format(
            'create policy "%1$s insert" on public.%1$I for insert to authenticated with check ((select public.can_write()))', t);
        execute format(
            'create policy "%1$s update" on public.%1$I for update to authenticated using ((select public.can_write())) with check ((select public.can_write()))', t);
        execute format(
            'create policy "%1$s delete" on public.%1$I for delete to authenticated using ((select public.is_admin()))', t);
    end loop;
end $$;

-- ========================== 5-2. 빠진 표 쓸어담기 ==========================
--
-- 위 목록은 손으로 적은 것이라 **새 표가 생기면 빠진다.** 실제로 첫 실행 뒤
-- `product_accessories`가 anon 전체 허용인 채로 남아 있었다(지금은 안 쓰는 표).
-- 그래서 public 스키마에 anon 정책이 남은 표를 전부 훑어 닫는다.
--
-- 여기서 걸리는 표가 있다면 그건 '앱이 로그인 없이 쓰는 표'가 아니라
-- '닫는 걸 잊은 표'다. 서버 함수는 서비스 롤 키를 쓰므로 anon이 필요 없다.
do $$
declare p record;
begin
    for p in
        select tablename, policyname
        from pg_policies
        where schemaname = 'public' and 'anon' = any(roles)
    loop
        execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
        raise notice 'anon 정책 제거: %.%', p.tablename, p.policyname;
    end loop;

    -- 정책을 다 뗀 표는 RLS만 켜 두면 아무도 못 읽는다.
    -- 쓰는 표라면 위 목록에 이름을 넣어 정식 정책을 받아야 한다.
    for p in
        select c.relname as tablename
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    loop
        execute format('alter table public.%I enable row level security', p.tablename);
        raise notice 'RLS 켬: %', p.tablename;
    end loop;
end $$;

-- 안 쓰는 표를 아예 없애려면 아래 주석을 풀 것.
-- `product_accessories`는 캡·밸브를 `products.type`으로 옮기면서 쓰지 않게 됐다
-- (CLAUDE.md 참고). 남은 2줄은 무밸브·기본캡 씨앗이고 products에 이미 있다.
-- drop table if exists public.product_accessories;

-- ========================== 6. 사진 보관함 ==========================
-- 품목 사진은 견적서에 박혀 나가므로 읽기는 열어 둔다 (카탈로그 사진이라 민감하지 않다).
-- 올리고 지우는 것은 로그인한 사람만.
drop policy if exists "product images read"  on storage.objects;
drop policy if exists "product images write" on storage.objects;

create policy "product images read" on storage.objects for select
    to public using (bucket_id = 'product-images');

create policy "product images write" on storage.objects for all
    to authenticated
    using (bucket_id = 'product-images')
    with check (bucket_id = 'product-images');

-- ========================== 7. 확인 ==========================
-- anon으로 열려 있는 정책이 남아 있는지. **한 줄도 안 나와야 정상이다.**
select tablename, policyname, roles
from pg_policies
where schemaname = 'public' and 'anon' = any(roles)
order by tablename;
