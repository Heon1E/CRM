-- ---------------------------------------------------------------------------
-- 텔레그램으로 받은 자료함 (telegram_inbox)
--
-- 휴대폰에서 봇에게 스크린샷이나 메시지를 보내면 여기에 '대기' 상태로 쌓인다.
-- **봇은 매출/거래처를 직접 건드리지 않는다.**
--   - 매출은 대사(reconcileSales)를 거쳐야 중복이 생기지 않는데, 그 로직은 앱에 있다.
--   - 봇이 바로 INSERT하면 2026-08-05 중복 사고와 같은 일이 다시 벌어진다.
-- 그래서 봇은 '읽어서 담아두기'만 하고, 반영은 앱(설정 > 받은 항목)에서 사람이 확인한 뒤 한다.
--
-- Supabase SQL Editor에 붙여넣어 실행할 것.
-- ---------------------------------------------------------------------------

create table if not exists public.telegram_inbox (
    id           uuid primary key default gen_random_uuid(),
    created_at   timestamptz not null default now(),

    -- 보낸 사람 (허용된 chat_id만 봇이 받아준다)
    chat_id      text not null,
    from_name    text,
    source       text not null default 'telegram',

    -- 원본
    raw_text     text,
    has_image    boolean not null default false,

    -- 판독 결과
    doc_type     text not null default 'unknown',   -- sales | receivables | activity | memo | unknown
    payload      jsonb not null default '{}'::jsonb, -- { rows: [...], summary, warnings: [...] }

    -- 처리 상태
    status       text not null default 'pending',    -- pending | applied | dismissed
    applied_at   timestamptz,
    note         text
);

create index if not exists idx_telegram_inbox_status
    on public.telegram_inbox (status, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- 봇(서버리스 함수)은 service_role 키를 쓰므로 RLS를 우회한다.
-- 앱에서는 로그인한 사용자만 읽고 고칠 수 있게 한다.
-- ---------------------------------------------------------------------------
alter table public.telegram_inbox enable row level security;

drop policy if exists "authenticated can read inbox"   on public.telegram_inbox;
drop policy if exists "authenticated can update inbox" on public.telegram_inbox;
drop policy if exists "authenticated can delete inbox" on public.telegram_inbox;

create policy "authenticated can read inbox"
    on public.telegram_inbox for select
    to authenticated using (true);

create policy "authenticated can update inbox"
    on public.telegram_inbox for update
    to authenticated using (true) with check (true);

create policy "authenticated can delete inbox"
    on public.telegram_inbox for delete
    to authenticated using (true);
