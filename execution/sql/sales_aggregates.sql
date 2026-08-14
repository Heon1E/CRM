-- ---------------------------------------------------------------------------
-- 매출 집계 뷰 — 브라우저가 15,221행을 다 받지 않게 한다
--
-- 지금은 대시보드를 열 때마다 매출 전 행을 16쪽으로 나눠 받아 브라우저에서
-- 더한다. 거래가 3배로 늘면 그대로 3배 느려진다.
-- 집계는 Postgres가 훨씬 잘한다 — 15,221행을 훑어 수천 행으로 줄여 보낸다.
--
-- Supabase SQL Editor에 붙여넣어 실행할 것. **여러 번 돌려도 안전하다.**
--
-- ⚠ 뷰에는 반드시 `security_invoker = true`를 준다.
--   기본값(false)이면 뷰가 **소유자 권한으로** 돌아 RLS를 통째로 우회한다.
--   애써 닫아 둔 접근제어에 구멍이 뚫린다.
-- ---------------------------------------------------------------------------

-- ========================== 0. 인덱스 ==========================
-- 집계는 결국 sale_date와 client_id로 훑는다. 이게 없으면 매번 전체 스캔이다.
create index if not exists idx_sales_date   on public.sales (sale_date);
create index if not exists idx_sales_client on public.sales (client_id, sale_date);

-- ========================== 1. 거래처 × 월 ==========================
--
-- **이 뷰 하나가 대시보드·KPI·영업 코치를 전부 먹인다.**
-- 필요한 것이 전부 '어느 거래처가 어느 달에 얼마'이기 때문이다:
--   상단 카드 = 월 합계     KPI 부문기여 = 거래처×연도 합계
--   매출 추이 = 월별 합계    영업 코치   = 거래처의 최근 3개월 vs 그 전 3개월
--
-- 행 수는 (거래처 × 거래한 달)이라 원본보다 훨씬 적다.
-- 맨 아래 확인 조회로 실제 줄어든 정도를 볼 수 있다.
create or replace view public.client_month_sales
with (security_invoker = true) as
select
    s.client_id,
    date_trunc('month', s.sale_date)::date as ym,
    sum(coalesce(s.total_amount, 0))       as amount,
    count(*)                               as cnt,
    max(s.sale_date)                       as last_date
from public.sales s
where s.deleted_at is null      -- 휴지통에 든 것은 세지 않는다
group by 1, 2;

comment on view public.client_month_sales is
    '거래처×월 매출 합계. 대시보드·KPI·영업 코치가 원본 대신 이것을 읽는다.';

-- ========================== 2. 월별 전사 합계 ==========================
-- 상단 카드와 매출 추이가 쓴다. 몇십 행이면 끝난다.
create or replace view public.monthly_sales
with (security_invoker = true) as
select
    ym,
    sum(amount)                       as amount,
    sum(cnt)                          as cnt,
    count(distinct client_id)         as client_count
from public.client_month_sales
group by 1;

comment on view public.monthly_sales is '월별 전사 매출. 대시보드 상단 카드·추이용.';

-- ========================== 3. 거래처 요약 ==========================
--
-- 거래처 목록의 '매출 많은 순' 정렬과 영업 코치의 '누적 매출'이 쓴다.
-- 담당자(sales_rep)를 함께 담아 두면 담당별 집계를 한 번에 뽑을 수 있다.
create or replace view public.client_sales_summary
with (security_invoker = true) as
select
    c.id                                        as client_id,
    c.company,
    c.sales_rep,
    coalesce(sum(m.amount), 0)                  as total_amount,
    coalesce(sum(m.amount) filter (
        where m.ym >= date_trunc('year', current_date)), 0)                 as this_year,
    coalesce(sum(m.amount) filter (
        where m.ym >= date_trunc('year', current_date) - interval '1 year'
          and m.ym <  date_trunc('year', current_date)), 0)                 as last_year,
    coalesce(sum(m.amount) filter (
        where m.ym >= date_trunc('month', current_date) - interval '2 month'), 0) as recent_3m,
    coalesce(sum(m.amount) filter (
        where m.ym >= date_trunc('month', current_date) - interval '5 month'
          and m.ym <  date_trunc('month', current_date) - interval '2 month'), 0) as prev_3m,
    max(m.last_date)                            as last_sale_date
from public.clients c
left join public.client_month_sales m on m.client_id = c.id
where c.deleted_at is null
group by c.id, c.company, c.sales_rep;

comment on view public.client_sales_summary is
    '거래처별 매출 요약. 목록 정렬과 영업 코치가 쓴다.';

-- ========================== 4. 확인 ==========================
-- 얼마나 줄었는지 본다. 브라우저가 받아야 할 행 수가 이만큼 줄어든다.
select
    (select count(*) from public.sales where deleted_at is null) as "매출 원본",
    (select count(*) from public.client_month_sales)             as "거래처×월",
    (select count(*) from public.monthly_sales)                  as "월별 합계",
    (select count(*) from public.client_sales_summary)           as "거래처 요약";

-- 뷰가 RLS를 우회하지 않는지 확인 — security_invoker가 on이어야 한다.
select c.relname as view_name, c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('client_month_sales', 'monthly_sales', 'client_sales_summary');
