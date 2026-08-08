-- ---------------------------------------------------------------------------
-- 채권(외상매출금) 현황
--
-- 회사 ERP의 '외상매출금 관리대장'을 월 단위로 담는다.
-- `execution/analyze_receivables.mjs --apply` 가 채운다.
--
-- 한 달에 한 줄씩 쌓이므로(거래처 x 기준월) 지난달과 비교할 수 있다.
-- 같은 달을 다시 올리면 덮어쓴다 (unique 제약 + upsert).
--
-- Supabase SQL Editor에 붙여넣어 실행할 것.
-- ---------------------------------------------------------------------------

create table if not exists public.receivables (
    id                  uuid primary key default gen_random_uuid(),

    -- 거래처. 대장에만 있고 CRM에 없는 곳도 있으므로 client_id는 비어 있을 수 있다.
    -- 거래처를 지워도 채권 기록은 남아야 하므로 cascade가 아니라 set null.
    client_id           uuid references public.clients(id) on delete set null,
    client_name         text not null,          -- 대장에 적힌 이름 (연결이 깨져도 남는 단서)

    base_month          text not null,          -- 기준월 'YYYY-MM'

    balance             numeric not null default 0,   -- 기준월 말 잔액
    overdue_amount      numeric not null default 0,   -- 당월 매출을 넘어선 금액 = 실제로 밀린 돈
    aging_months        integer not null default 0,   -- 가장 오래된 미수분이 몇 개월 전 매출인가
    oldest_unpaid_month text,                         -- 그 매출이 발생한 달 'YYYY-MM'

    delay_note          text,                   -- 대장 '지연' 열의 메모
    payment_terms       text,                   -- 결제조건 (말일/20일 등)

    updated_at          timestamptz not null default now(),

    -- 같은 달 같은 거래처는 한 줄. 다시 올리면 덮어쓴다.
    unique (client_name, base_month)
);

create index if not exists idx_receivables_base_month
    on public.receivables (base_month desc, aging_months desc, overdue_amount desc);
create index if not exists idx_receivables_client
    on public.receivables (client_id);

alter table public.receivables enable row level security;

drop policy if exists "authenticated can read receivables"  on public.receivables;
drop policy if exists "authenticated can write receivables" on public.receivables;

create policy "authenticated can read receivables"
    on public.receivables for select
    to authenticated using (true);

-- 반영은 스크립트(anon key + 로그인 없음)에서도 해야 하므로 anon에도 쓰기를 연다.
-- 이 표는 사내 집계 자료이며 개인정보가 없다.
create policy "authenticated can write receivables"
    on public.receivables for all
    to authenticated, anon using (true) with check (true);
