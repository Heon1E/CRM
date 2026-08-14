-- ---------------------------------------------------------------------------
-- 소프트 삭제(휴지통) + 변경 이력
--
-- 지금은 거래처를 잘못 지우면 그 거래처의 매출·활동·견적이 함께 사라지고
-- 되돌릴 방법이 없다. 유료 CRM이라면 당연히 있는 안전장치를 붙인다.
--
-- Supabase SQL Editor에 붙여넣어 한 번에 실행할 것.
-- **몇 번을 다시 돌려도 안전하다.**
--
-- 설계 결정 두 가지 — 나중에 왜 이렇게 했는지 헷갈리지 않도록 적어 둔다.
--
--   1. **매출은 변경 이력을 남기지 않는다(삭제만 남긴다).**
--      엑셀 일괄등록 한 번에 수천 행이 들어온다. INSERT/UPDATE까지 기록하면
--      이력 표가 매출보다 커지고 업로드가 느려진다. 정작 위험한 것은 삭제다.
--
--   2. **삭제는 '표시'만 하고 행은 남긴다.** 외래키로 물린 매출·활동·견적을
--      실제로 지우면 되살릴 수 없다. `deleted_at`을 채우고 앱이 걸러 보여준다.
-- ---------------------------------------------------------------------------

-- ========================== 1. 휴지통 칸 ==========================
-- 되살릴 수 있어야 하는 표에만 붙인다.
do $$
declare
    t text;
    tables text[] := array[
        'clients', 'sales', 'activities', 'products',
        'quotes', 'purchase_orders', 'schedules', 'client_contacts'
    ];
begin
    foreach t in array tables loop
        if to_regclass(format('public.%I', t)) is null then
            raise notice '건너뜀 (표 없음): %', t;
            continue;
        end if;
        execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
        execute format('alter table public.%I add column if not exists deleted_by uuid', t);
        -- 살아 있는 행만 보는 조회가 대부분이다. 부분 인덱스가 가장 싸다.
        execute format(
            'create index if not exists idx_%1$s_alive on public.%1$I (id) where deleted_at is null', t);
    end loop;
end $$;

-- ========================== 2. 변경 이력 ==========================
create table if not exists public.audit_log (
    id          bigserial primary key,
    table_name  text not null,
    row_id      uuid,
    action      text not null,           -- insert | update | delete | restore
    actor       uuid,                    -- auth.uid()
    actor_email text,
    label       text,                    -- 사람이 알아볼 이름 (거래처명 등)
    changed     jsonb,                   -- 바뀐 칸만 { 칸: [전, 후] }
    at          timestamptz not null default now()
);

create index if not exists idx_audit_at    on public.audit_log (at desc);
create index if not exists idx_audit_row   on public.audit_log (table_name, row_id);
create index if not exists idx_audit_actor on public.audit_log (actor, at desc);

/**
 * 바뀐 칸만 골라낸다.
 * 통째로 저장하면 이력 표가 원본만큼 커진다. 실제로 달라진 것만 남긴다.
 */
create or replace function public.audit_diff(old_row jsonb, new_row jsonb)
returns jsonb
language sql immutable
as $$
    select coalesce(jsonb_object_agg(key, jsonb_build_array(old_row -> key, new_row -> key)), '{}'::jsonb)
    from jsonb_object_keys(new_row) as key
    where old_row -> key is distinct from new_row -> key
      and key not in ('updated_at', 'created_at')   -- 시각만 바뀐 것은 변경이 아니다
$$;

/** 사람이 알아볼 이름을 표마다 다르게 뽑는다 */
create or replace function public.audit_label(t text, row_data jsonb)
returns text
language sql immutable
as $$
    select case t
        when 'clients'         then row_data ->> 'company'
        when 'products'        then row_data ->> 'name'
        when 'quotes'          then row_data ->> 'quote_no'
        when 'purchase_orders' then row_data ->> 'po_no'
        when 'sales'           then coalesce(row_data ->> 'client_name', row_data ->> 'item_name')
        when 'activities'      then row_data ->> 'client_name'
        when 'profiles'        then row_data ->> 'email'
        else null
    end
$$;

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
    d jsonb;
    act text;
    row_json jsonb;
begin
    if TG_OP = 'DELETE' then
        act := 'delete'; row_json := to_jsonb(OLD); d := null;
    elsif TG_OP = 'INSERT' then
        act := 'insert'; row_json := to_jsonb(NEW); d := null;
    else
        row_json := to_jsonb(NEW);
        d := public.audit_diff(to_jsonb(OLD), row_json);
        -- 바뀐 게 없으면 남기지 않는다 (updated_at만 스친 UPDATE가 흔하다)
        if d = '{}'::jsonb then return NEW; end if;
        -- 휴지통에 넣고 빼는 것은 따로 표시한다. 나중에 찾기 쉽다.
        if (to_jsonb(OLD) ->> 'deleted_at') is null and (row_json ->> 'deleted_at') is not null then
            act := 'delete';
        elsif (to_jsonb(OLD) ->> 'deleted_at') is not null and (row_json ->> 'deleted_at') is null then
            act := 'restore';
        else
            act := 'update';
        end if;
    end if;

    insert into public.audit_log (table_name, row_id, action, actor, actor_email, label, changed)
    values (
        TG_TABLE_NAME,
        (row_json ->> 'id')::uuid,
        act,
        auth.uid(),
        (select email from public.profiles where id = auth.uid()),
        public.audit_label(TG_TABLE_NAME, row_json),
        d
    );
    return coalesce(NEW, OLD);
exception when others then
    -- **이력 기록이 실패해도 업무를 막지 않는다.** 기록은 부수적인 일이다.
    raise warning '[audit] 기록 실패 %: %', TG_TABLE_NAME, SQLERRM;
    return coalesce(NEW, OLD);
end $$;

-- ========================== 3. 트리거 붙이기 ==========================
do $$
declare
    t text;
    -- 전부 기록하는 표 (건수가 적고 하나하나가 중요하다)
    full_tables text[] := array[
        'clients', 'products', 'quotes', 'purchase_orders', 'profiles', 'company_profile'
    ];
    -- 삭제만 기록하는 표 (일괄등록으로 수천 건이 오간다)
    del_only text[] := array['sales', 'activities'];
begin
    foreach t in array full_tables loop
        if to_regclass(format('public.%I', t)) is null then continue; end if;
        execute format('drop trigger if exists trg_audit on public.%I', t);
        execute format(
            'create trigger trg_audit after insert or update or delete on public.%I
             for each row execute function public.audit_trigger()', t);
    end loop;

    foreach t in array del_only loop
        if to_regclass(format('public.%I', t)) is null then continue; end if;
        execute format('drop trigger if exists trg_audit on public.%I', t);
        -- UPDATE도 받는 이유: 소프트 삭제가 UPDATE로 들어오기 때문이다.
        -- 트리거 함수가 deleted_at 변화만 골라 기록한다.
        execute format(
            'create trigger trg_audit after delete or update of deleted_at on public.%I
             for each row execute function public.audit_trigger()', t);
    end loop;
end $$;

-- ========================== 4. 이력의 접근제어 ==========================
alter table public.audit_log enable row level security;

do $$
declare p record;
begin
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'audit_log'
    loop
        execute format('drop policy if exists %I on public.audit_log', p.policyname);
    end loop;
end $$;

-- 이력은 **읽기만** 열어 둔다. 고치거나 지우면 이력이 아니다.
-- 판정 함수는 `(select ...)`로 감싼다 — 안 그러면 행마다 평가된다.
create policy "audit_log select" on public.audit_log for select to authenticated
    using ((select public.can_read()));

-- ========================== 5. 확인 ==========================
select table_name, count(*) as 이력건수
from public.audit_log
group by table_name
order by 2 desc;
