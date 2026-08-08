-- ---------------------------------------------------------------------------
-- 일정(schedules) + 텔레그램 받은함(telegram_inbox)
--
-- 텔레그램으로 "내일 오후 2시 한국화학 방문" 처럼 보내면 일정이 달력에 바로 뜬다.
-- 매출·채권처럼 대사가 필요한 자료는 받은함에 담아두고 앱에서 확인 후 반영한다.
--
-- Supabase SQL Editor에 붙여넣어 한 번에 실행할 것.
-- ---------------------------------------------------------------------------

-- ============================== 일정 ==============================
--
-- **activities와 따로 둔다.** activities는 '다녀온 기록'이고 KPI 정기적방문횟수의
-- 근거다. 아직 가지 않은 계획을 같은 표에 넣으면 방문 실적이 부풀려진다.
-- (일일업무보고서의 '금일 영업 계획'을 넣지 않는 것과 같은 이유다.)
create table if not exists public.schedules (
    id            uuid primary key default gen_random_uuid(),

    title         text not null,
    starts_at     timestamptz not null,
    ends_at       timestamptz,
    all_day       boolean not null default false,

    client_id     uuid references public.clients(id) on delete set null,
    client_name   text,                       -- 거래처를 못 찾아도 이름은 남긴다

    location      text,
    notes         text,
    kind          text not null default '방문',   -- 방문 | 미팅 | 전화 | 기타
    status        text not null default '예정',   -- 예정 | 완료 | 취소

    source        text not null default 'app',    -- app | telegram
    created_by    uuid,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index if not exists idx_schedules_starts_at on public.schedules (starts_at);
create index if not exists idx_schedules_client    on public.schedules (client_id);

alter table public.schedules enable row level security;

drop policy if exists "read schedules"  on public.schedules;
drop policy if exists "write schedules" on public.schedules;

create policy "read schedules"  on public.schedules for select
    to authenticated, anon using (true);
create policy "write schedules" on public.schedules for all
    to authenticated, anon using (true) with check (true);

-- ========================== 텔레그램 받은함 ==========================
--
-- **봇은 매출을 직접 INSERT하지 않는다.** 매출은 대사(reconcileSales)를 거쳐야
-- 중복이 안 생기는데 그 로직은 앱에 있다. 봇이 바로 넣으면 2026-08-05
-- 중복 사고(2,835건)가 재현된다. 그래서 담아두고 사람이 확인한 뒤 반영한다.
create table if not exists public.telegram_inbox (
    id           uuid primary key default gen_random_uuid(),
    created_at   timestamptz not null default now(),

    chat_id      text not null,
    from_name    text,
    source       text not null default 'telegram',

    raw_text     text,
    has_image    boolean not null default false,

    doc_type     text not null default 'unknown',   -- sales | receivables | activity | schedule | memo | unknown
    payload      jsonb not null default '{}'::jsonb,

    status       text not null default 'pending',   -- pending | applied | dismissed | auto
    applied_at   timestamptz,
    note         text
);

create index if not exists idx_telegram_inbox_status
    on public.telegram_inbox (status, created_at desc);

alter table public.telegram_inbox enable row level security;

drop policy if exists "read inbox"  on public.telegram_inbox;
drop policy if exists "write inbox" on public.telegram_inbox;

create policy "read inbox"  on public.telegram_inbox for select
    to authenticated, anon using (true);
create policy "write inbox" on public.telegram_inbox for all
    to authenticated, anon using (true) with check (true);

-- ========================== 봇 사용 허용 목록 ==========================
--
-- 텔레그램 봇 아이디는 누구나 검색할 수 있다. 허용 목록이 실질적인 자물쇠다.
--
-- 환경변수 대신 여기에 둔다 (설정할 게 하나라도 줄어야 한다).
-- **첫 사람만 스스로 등록할 수 있다.** 목록이 비어 있을 때만 INSERT가 되고,
-- 한 명이라도 들어오면 그 뒤로는 막힌다. 봇을 만들고 바로 /start 를 보낼 것.
-- 남이 먼저 채갔다면 이 표를 비우고 다시 /start 하면 된다.
create table if not exists public.bot_allowlist (
    chat_id    text primary key,
    label      text,
    created_at timestamptz not null default now()
);

alter table public.bot_allowlist enable row level security;

drop policy if exists "read allowlist"       on public.bot_allowlist;
drop policy if exists "first claim only"     on public.bot_allowlist;
drop policy if exists "authenticated manage" on public.bot_allowlist;

create policy "read allowlist" on public.bot_allowlist for select
    to authenticated, anon using (true);

-- 비어 있을 때만 등록 가능 (선착순 1회). 이후로는 잠긴다.
create policy "first claim only" on public.bot_allowlist for insert
    to authenticated, anon
    with check ((select count(*) from public.bot_allowlist) = 0);

-- 로그인한 사용자는 언제든 고칠 수 있다 (잘못 등록됐을 때 되돌리기)
create policy "authenticated manage" on public.bot_allowlist for all
    to authenticated using (true) with check (true);
