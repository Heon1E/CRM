-- ---------------------------------------------------------------------------
-- 로그인 · 역할 · 접근제어
--
-- 지금까지는 RLS가 `to authenticated, anon using (true) with check (true)`
-- 였다. 배포 번들에 anon 키가 그대로 박혀 있으므로 **주소를 아는 사람은
-- 누구나 거래처·매출·채권을 읽고 쓰고 지울 수 있었다.**
-- 이 파일이 그것을 닫는다.
--
-- Supabase SQL Editor에 붙여넣어 한 번에 실행할 것.
-- 실행하면 로그인하지 않은 접근은 전부 차단된다 — 앱에 로그인 화면이
-- 붙어 있어야 한다 (이 커밋에 함께 들어 있다).
--
-- ⚠ 실행 전에 읽을 것
--   `api/telegram-webhook.js`·`api/daily-digest.js`는 서버에서 도는데,
--   지금은 키가 없으면 VITE_ anon 키로 폴백한다. 이 파일을 실행한 뒤에는
--   anon으로 아무것도 못 하므로 **Vercel 환경변수에
--   `SUPABASE_SERVICE_ROLE_KEY`를 반드시 넣어야** 봇과 아침 브리핑이 산다.
--   (Supabase > Project Settings > API > service_role. VITE_ 접두어 금지.)
-- ---------------------------------------------------------------------------

-- ========================== 역할 ==========================
do $$ begin
    create type public.app_role as enum ('admin', 'sales', 'viewer');
exception when duplicate_object then null;
end $$;

-- 로그인 계정 하나에 프로필 한 줄.
-- `sales_rep`은 `clients.sales_rep`과 맞물리는 **한글 이름**이다.
-- 이 값이 있어야 '내 담당'이 잡힌다 (예전에는 이메일에서 이름을 추측했다).
create table if not exists public.profiles (
    id         uuid primary key references auth.users(id) on delete cascade,
    email      text,
    full_name  text,
    sales_rep  text,
    role       public.app_role not null default 'sales',
    active     boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_rep on public.profiles (sales_rep);

-- 계정이 생기면 프로필을 자동으로 만든다.
-- **맨 처음 생기는 계정은 admin이다** — 관리자를 손으로 심을 방법이 없으면
-- 아무도 들어올 수 없다. 두 번째부터는 sales로 들어오고 admin이 올려 준다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
    first_user boolean;
begin
    select count(*) = 0 into first_user from public.profiles;
    insert into public.profiles (id, email, full_name, role)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        case when first_user then 'admin'::public.app_role else 'sales'::public.app_role end
    )
    on conflict (id) do nothing;
    return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ========================== 판정 함수 ==========================
-- SECURITY DEFINER라 정책 안에서 profiles를 읽어도 재귀에 걸리지 않는다.
create or replace function public.my_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and active $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() = 'admin', false) $$;

/** 읽을 수 있는가 — 로그인했고 활성 계정이면 읽는다 */
create or replace function public.can_read()
returns boolean
language sql stable security definer set search_path = public
as $$ select public.my_role() is not null $$;

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

-- ========================== profiles 자신의 접근제어 ==========================
alter table public.profiles enable row level security;

drop policy if exists "profiles read"        on public.profiles;
drop policy if exists "profiles update self" on public.profiles;
drop policy if exists "profiles admin all"   on public.profiles;

-- 내 프로필은 내가, 남의 프로필은 관리자만
create policy "profiles read" on public.profiles for select to authenticated
    using (id = auth.uid() or public.is_admin());

-- 내 이름은 내가 고칠 수 있다. **역할은 못 바꾼다** (스스로 관리자가 되면 안 된다)
create policy "profiles update self" on public.profiles for update to authenticated
    using (id = auth.uid())
    with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

create policy "profiles admin all" on public.profiles for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

-- ========================== 업무 표 전체에 같은 규칙 ==========================
--
-- 읽기  : 로그인한 활성 계정 전부
--         (영업사원 3명이 전사 매출을 함께 본다. KPI 수익성이 전사 기준이고,
--          담당이 비어 있는 거래처가 1,064곳이라 담당별로 막으면 화면이 텅 빈다.
--          회사가 커져 담당별 격리가 필요해지면 이 정책만 좁히면 된다.)
-- 쓰기  : admin + sales
-- 지우기: **admin만.** 되돌릴 수단이 아직 없으므로 지우기는 좁게 연다.
--
do $$
declare
    t text;
    tables text[] := array[
        'clients', 'sales', 'activities', 'products', 'client_contacts',
        'schedules', 'receivables', 'issues',
        'quotes', 'quote_items', 'purchase_orders', 'po_items',
        'company_profile', 'revenue_forecasts', 'telegram_inbox', 'bot_allowlist'
    ];
begin
    foreach t in array tables loop
        -- 없는 표는 건너뛴다 (마이그레이션을 다 돌리지 않았을 수 있다)
        if to_regclass(format('public.%I', t)) is null then
            raise notice '건너뜀 (표 없음): %', t;
            continue;
        end if;

        execute format('alter table public.%I enable row level security', t);

        -- 예전에 깔아 둔 전체 허용 정책을 걷어낸다
        execute format('drop policy if exists "read %1$s"  on public.%1$I', t);
        execute format('drop policy if exists "write %1$s" on public.%1$I', t);
        execute format('drop policy if exists "Enable all access for all users" on public.%I', t);
        execute format('drop policy if exists "Allow all" on public.%I', t);
        execute format('drop policy if exists "%1$s select" on public.%1$I', t);
        execute format('drop policy if exists "%1$s insert" on public.%1$I', t);
        execute format('drop policy if exists "%1$s update" on public.%1$I', t);
        execute format('drop policy if exists "%1$s delete" on public.%1$I', t);

        execute format(
            'create policy "%1$s select" on public.%1$I for select to authenticated using (public.can_read())', t);
        execute format(
            'create policy "%1$s insert" on public.%1$I for insert to authenticated with check (public.can_write())', t);
        execute format(
            'create policy "%1$s update" on public.%1$I for update to authenticated using (public.can_write()) with check (public.can_write())', t);
        execute format(
            'create policy "%1$s delete" on public.%1$I for delete to authenticated using (public.is_admin())', t);
    end loop;
end $$;

-- ========================== 사진 보관함 ==========================
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

-- ========================== 확인 ==========================
-- 실행 후 아래를 돌려 anon 정책이 남아 있지 않은지 본다.
--
--   select tablename, policyname, roles
--   from pg_policies
--   where schemaname = 'public' and 'anon' = any(roles)
--   order by tablename;
--
-- 한 줄도 안 나와야 정상이다.
