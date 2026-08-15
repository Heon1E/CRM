-- ---------------------------------------------------------------------------
-- 문서 기본값 — 견적서·발주서에 늘 들어가는 문구
--
-- 견적서마다 손으로 적기엔 반복되고, 코드에 박아 두면 문구를 고칠 때마다
-- 배포해야 한다. 회사 정보 옆에 두고 화면에서 고친다.
--
-- Supabase SQL Editor에 붙여넣어 실행할 것. 여러 번 돌려도 안전하다.
-- ---------------------------------------------------------------------------

alter table public.company_profile add column if not exists quote_terms text;
alter table public.company_profile add column if not exists po_terms    text;

comment on column public.company_profile.quote_terms is '견적서 하단 안내문구 (결제조건·납기 등)';
comment on column public.company_profile.po_terms    is '발주서 하단 안내문구';

-- 비어 있으면 흔히 쓰는 문구를 넣어 둔다. 화면에서 고칠 수 있다.
update public.company_profile
set quote_terms = coalesce(nullif(trim(quote_terms), ''),
$$· 본 견적은 발행일로부터 유효기간 내에만 유효합니다.
· 표기 금액은 부가세 별도이며, 운임은 별도 협의입니다.
· 납기는 발주 확정 후 협의된 일정에 따릅니다.
· 제품 사양은 사전 통보 없이 개선될 수 있습니다.$$)
where id = 1;

update public.company_profile
set po_terms = coalesce(nullif(trim(po_terms), ''),
$$· 납품 시 거래명세서를 반드시 동봉해 주십시오.
· 수량·규격이 다를 경우 사전에 연락 바랍니다.
· 대금은 월 마감 후 익월 결제를 원칙으로 합니다.$$)
where id = 1;

-- 확인
select name, email, phone, quote_terms is not null as 견적문구, po_terms is not null as 발주문구
from public.company_profile where id = 1;
