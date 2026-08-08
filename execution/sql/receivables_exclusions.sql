-- ---------------------------------------------------------------------------
-- 채권 제외 표시 (receivables 테이블에 열 2개 추가)
--
-- 대장에 미수로 잡혀 있지만 실제로는 채권이 아닌 건이 있다.
--   예) 한국기능성화장품연구센터 — 선입금 후 나중에 물건만 가져간 건을
--       회계팀이 미수금으로 잘못 잡았다.
--
-- 이런 건은 **지우면 안 된다.** 회계 장부가 고쳐지기 전까지는 다음 달 대장에도
-- 그대로 나오므로, 지워봐야 다음 업로드에서 되살아난다. 게다가 왜 뺐는지도 남지 않는다.
-- 그래서 '제외' 표시를 달아두고, 새 달을 올릴 때 같은 거래처면 표시를 물려받게 한다.
--
-- Supabase SQL Editor에 붙여넣어 실행할 것.
-- ---------------------------------------------------------------------------

alter table public.receivables
    add column if not exists excluded         boolean not null default false,
    add column if not exists exclusion_reason text;

comment on column public.receivables.excluded is
    '대장에는 있으나 실제 채권이 아닌 건(회계 착오 등). 합계·연체 건수에서 뺀다.';
comment on column public.receivables.exclusion_reason is
    '왜 제외했는지. 나중에 판단 근거를 되짚을 수 있어야 한다.';
