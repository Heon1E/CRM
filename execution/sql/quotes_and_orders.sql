-- ---------------------------------------------------------------------------
-- 견적서 · 발주서 + 제품 사진
--
-- 견적서는 고객이 보는 문서다. 품목 사진과 악세서리(상부캡·밸브) 사진을 함께
-- 실어야 "그래서 뭘 주는 건데"가 한눈에 들어온다.
-- 발주서는 우리가 쓰는 문서라 사진이 필요 없다.
--
-- Supabase SQL Editor에 붙여넣어 한 번에 실행할 것.
-- ---------------------------------------------------------------------------

-- ========================== 우리 회사 정보 ==========================
-- 견적서·발주서 머리글에 들어간다. 한 줄만 쓴다.
create table if not exists public.company_profile (
    id            int primary key default 1,
    name          text not null,
    ceo           text,
    biz_no        text,                  -- 사업자등록번호
    address       text,
    phone         text,
    fax           text,
    email         text,
    bank_account  text,                  -- 입금 계좌 (견적서 하단)
    stamp_url     text,                  -- 직인 이미지
    logo_url      text,
    updated_at    timestamptz not null default now(),
    constraint company_profile_single_row check (id = 1)
);

insert into public.company_profile (id, name, ceo, biz_no, address, phone, fax, email)
values (
    1,
    '아이앤디 주식회사',
    '이대현',
    '142-81-76012',
    '경기도 용인시 처인구 백암면 삼백로 367-20',
    '031-334-9625, 031-335-9625',
    '031-339-9625',
    'idibc@daum.net'
)
on conflict (id) do nothing;

-- ========================== 품목 사진 ==========================
-- products 테이블에 사진 칸만 더한다.
-- 규격은 이미 있는 `standard` 컬럼을 쓴다 (새로 만들지 않는다).
alter table public.products
    add column if not exists image_url text;

-- ========================== 악세서리 (캡 · 밸브) ==========================
--
-- 품목을 고르면 그에 맞는 악세서리를 고를 수 있고, 고르면 사진이 뜬다.
-- **'무밸브'도 하나의 선택지다** — 밸브가 없는 형태이고 그 부위 사진이 따로 있다.
--
-- ▶ 아래 product_accessories 표는 **더 이상 쓰지 않는다.**
--   캡·밸브도 결국 품목이라 따로 표를 두면 사진을 두 번 올려야 하고 이름이 갈렸다.
--   지금은 `products.type` 하나로 나눈다 — IBC/드럼/제리캔 = 완제품,
--   캡/밸브 = 악세서리, 부품 = 그 밖. 앱은 이 표를 읽지 않는다.
--   이미 만들어진 곳이 있어 정의만 남겨 둔다. 지워도 무방하다.
create table if not exists public.product_accessories (
    id         uuid primary key default gen_random_uuid(),
    kind       text not null,          -- '상부캡' | '밸브'
    name       text not null,          -- 예: 'DN50 버터플라이', '무밸브'
    spec       text,
    image_url  text,
    note       text,
    sort_order int not null default 0,
    active     boolean not null default true,
    created_at timestamptz not null default now(),
    unique (kind, name)
);

-- 밸브 쪽에는 '무밸브'가 반드시 있어야 한다 (사진은 나중에 채운다)
insert into public.product_accessories (kind, name, sort_order, note) values
    ('밸브',   '무밸브', 0, '밸브 없이 나가는 형태'),
    ('상부캡', '기본캡', 0, null)
on conflict (kind, name) do nothing;

-- ========================== 견적서 ==========================
create table if not exists public.quotes (
    id           uuid primary key default gen_random_uuid(),
    quote_no     text unique not null,           -- 예: Q-20260813-01
    quote_date   date not null default current_date,
    valid_days   int  not null default 30,       -- 견적 유효기간(일)

    client_id    uuid references public.clients(id) on delete set null,
    client_name  text not null,                  -- 연결이 끊겨도 남는 단서
    contact_name text,                           -- 받는 담당자
    contact_phone text,

    -- 금액은 라인에서 합산하지만, 발행 시점 값을 그대로 남긴다.
    -- 나중에 단가가 바뀌어도 그때 낸 견적은 그대로여야 하기 때문이다.
    subtotal     numeric not null default 0,     -- 공급가액
    vat          numeric not null default 0,     -- 부가세
    total        numeric not null default 0,

    status       text not null default '작성중', -- 작성중 | 발송 | 수주 | 실패 | 취소
    notes        text,                           -- 비고 (납기, 결제조건 등)
    sales_rep    text,

    created_by   uuid,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index if not exists idx_quotes_client on public.quotes (client_id);
create index if not exists idx_quotes_date   on public.quotes (quote_date desc);

create table if not exists public.quote_items (
    id           uuid primary key default gen_random_uuid(),
    quote_id     uuid not null references public.quotes(id) on delete cascade,
    line_no      int  not null default 1,

    product_id   uuid references public.products(id) on delete set null,
    name         text not null,                  -- 품목명 (발행 시점 그대로)
    spec         text,
    image_url    text,                           -- 발행 시점 사진

    -- 악세서리는 이름과 사진을 통째로 담아 둔다.
    -- 카탈로그가 바뀌어도 예전 견적서는 그때 모습 그대로여야 한다.
    -- [{ kind:'상부캡', name:'기본캡', image_url:'...' }, { kind:'밸브', name:'무밸브', ... }]
    accessories  jsonb not null default '[]'::jsonb,

    quantity     numeric not null default 0,
    unit         text default 'EA',
    unit_price   numeric not null default 0,
    amount       numeric not null default 0,     -- quantity * unit_price
    note         text
);

create index if not exists idx_quote_items_quote on public.quote_items (quote_id, line_no);

-- ========================== 발주서 ==========================
-- 우리가 협력업체에 보내는 문서. 사진 없이 일반적인 양식이면 된다.
create table if not exists public.purchase_orders (
    id            uuid primary key default gen_random_uuid(),
    po_no         text unique not null,          -- 예: PO-20260813-01
    po_date       date not null default current_date,

    vendor_name   text not null,                 -- 받는 업체
    vendor_contact text,
    vendor_phone  text,
    vendor_email  text,

    delivery_date date,                          -- 납기
    delivery_to   text,                          -- 납품 장소

    subtotal      numeric not null default 0,
    vat           numeric not null default 0,
    total         numeric not null default 0,

    status        text not null default '작성중', -- 작성중 | 발송 | 입고 | 취소
    notes         text,
    created_by    uuid,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index if not exists idx_po_date on public.purchase_orders (po_date desc);

create table if not exists public.po_items (
    id         uuid primary key default gen_random_uuid(),
    po_id      uuid not null references public.purchase_orders(id) on delete cascade,
    line_no    int  not null default 1,
    product_id uuid references public.products(id) on delete set null,
    name       text not null,
    spec       text,
    quantity   numeric not null default 0,
    unit       text default 'EA',
    unit_price numeric not null default 0,
    amount     numeric not null default 0,
    note       text
);

create index if not exists idx_po_items_po on public.po_items (po_id, line_no);

-- ========================== 사진 보관함 ==========================
-- 품목·악세서리 사진을 올려 둘 곳. 공개 버킷이라 견적서에서 바로 보인다.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product images read"  on storage.objects;
drop policy if exists "product images write" on storage.objects;

create policy "product images read" on storage.objects for select
    to public using (bucket_id = 'product-images');

create policy "product images write" on storage.objects for all
    to authenticated, anon
    using (bucket_id = 'product-images')
    with check (bucket_id = 'product-images');

-- ========================== RLS ==========================
alter table public.company_profile     enable row level security;
alter table public.product_accessories enable row level security;
alter table public.quotes              enable row level security;
alter table public.quote_items         enable row level security;
alter table public.purchase_orders     enable row level security;
alter table public.po_items            enable row level security;

do $$
declare t text;
begin
    foreach t in array array['company_profile','product_accessories','quotes','quote_items','purchase_orders','po_items']
    loop
        execute format('drop policy if exists "read %1$s"  on public.%1$I', t);
        execute format('drop policy if exists "write %1$s" on public.%1$I', t);
        execute format('create policy "read %1$s"  on public.%1$I for select to authenticated, anon using (true)', t);
        execute format('create policy "write %1$s" on public.%1$I for all    to authenticated, anon using (true) with check (true)', t);
    end loop;
end $$;
