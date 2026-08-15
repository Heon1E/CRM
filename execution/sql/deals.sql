-- ---------------------------------------------------------------------------
-- 영업 기회 (deals) — 파이프라인의 실체
--
-- 지금 파이프라인은 **거래처를 `clients.status`로 묶어** 보여준다. 그래서:
--   · 거래처 하나가 단계 하나만 가질 수 있다. 한 곳과 두 건을 동시에
--     진행하면(하나는 협상, 하나는 이제 접촉) 표현할 방법이 없다.
--   · 금액이 없다. 파이프라인에 얼마가 걸려 있는지 알 수 없다.
--   · 예상 마감이 없다. 이번 달에 뭐가 떨어질지 못 본다.
--   · 성사되면 status가 바뀌면서 **그 건의 기록이 사라진다.** 수주율을 못 낸다.
--
-- Pipedrive·HubSpot·Salesforce가 전부 '기회(deal/opportunity)'를 별도
-- 레코드로 두는 이유가 이것이다. 거래처는 관계이고, 기회는 건별로 뜬다.
--
-- Supabase SQL Editor에서 실행할 것. 여러 번 돌려도 안전하다.
-- ---------------------------------------------------------------------------

create table if not exists public.deals (
    id            uuid primary key default gen_random_uuid(),

    client_id     uuid references public.clients(id) on delete set null,
    client_name   text not null,          -- 연결이 끊겨도 남는 단서
    title         text not null,          -- '2026 IBC 연간 물량' 처럼 건을 부르는 이름

    stage         text not null default '리드',
    amount        numeric not null default 0,     -- 예상 금액 (공급가액)
    probability   int,                            -- 비우면 단계 기본값을 쓴다
    expected_close date,                          -- 언제쯤 떨어질 것인가

    owner         text,                           -- 담당자 한글 이름 (clients.sales_rep과 같은 값)
    quote_id      uuid references public.quotes(id) on delete set null,

    -- 닫힌 건
    closed_at     timestamptz,
    lost_reason   text,

    -- 다음 할 일 (활동의 next_action과 같은 개념이지만 건에 붙는다)
    next_action      text,
    next_action_date date,

    notes         text,
    created_by    uuid,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),

    -- 휴지통 (soft_delete_and_audit.sql과 같은 방식)
    deleted_at    timestamptz,
    deleted_by    uuid
);

-- 단계는 코드(`src/utils/dealStages.js`)와 짝을 맞춘다. 한쪽만 고치면 어긋난다.
do $$ begin
    alter table public.deals add constraint deals_stage_check
        check (stage in ('리드', '접촉', '제안', '샘플', '협상', '수주', '실패'));
exception when duplicate_object then null;
end $$;

create index if not exists idx_deals_stage  on public.deals (stage) where deleted_at is null;
create index if not exists idx_deals_client on public.deals (client_id);
create index if not exists idx_deals_owner  on public.deals (owner) where deleted_at is null;
create index if not exists idx_deals_close  on public.deals (expected_close) where deleted_at is null;

-- 단계가 바뀐 때를 기억한다. **'며칠째 안 움직이는 건'을 찾으려면 이게 있어야 한다.**
-- updated_at은 메모만 고쳐도 바뀌므로 정체 판정에 쓸 수 없다.
alter table public.deals add column if not exists stage_changed_at timestamptz;
update public.deals set stage_changed_at = coalesce(stage_changed_at, created_at, now());

create or replace function public.deals_touch()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    if TG_OP = 'UPDATE' and new.stage is distinct from old.stage then
        new.stage_changed_at := now();
        -- 닫힌 단계로 가면 시각을 남기고, 다시 열면 지운다
        if new.stage in ('수주', '실패') then
            new.closed_at := coalesce(new.closed_at, now());
        else
            new.closed_at := null;
            new.lost_reason := null;
        end if;
    end if;
    return new;
end $$;

drop trigger if exists trg_deals_touch on public.deals;
create trigger trg_deals_touch before insert or update on public.deals
    for each row execute function public.deals_touch();

-- ========================== 접근제어 ==========================
alter table public.deals enable row level security;

do $$
declare p record;
begin
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'deals'
    loop
        execute format('drop policy if exists %I on public.deals', p.policyname);
    end loop;
end $$;

-- 판정 함수는 `(select ...)`로 감싼다 — 안 그러면 행마다 평가된다.
create policy "deals select" on public.deals for select to authenticated
    using ((select public.can_read()));
create policy "deals insert" on public.deals for insert to authenticated
    with check ((select public.can_write()));
create policy "deals update" on public.deals for update to authenticated
    using ((select public.can_write())) with check ((select public.can_write()));
create policy "deals delete" on public.deals for delete to authenticated
    using ((select public.is_admin()));

-- 변경 이력 (soft_delete_and_audit.sql을 먼저 실행했어야 한다)
do $$ begin
    if to_regproc('public.audit_trigger') is not null then
        drop trigger if exists trg_audit on public.deals;
        create trigger trg_audit after insert or update or delete on public.deals
            for each row execute function public.audit_trigger();
    else
        raise notice '변경 이력 트리거를 건너뜁니다 — soft_delete_and_audit.sql 을 먼저 실행하세요.';
    end if;
end $$;

-- ========================== 확인 ==========================
select stage, count(*) as 건수, sum(amount) as 금액
from public.deals where deleted_at is null
group by stage order by 1;
