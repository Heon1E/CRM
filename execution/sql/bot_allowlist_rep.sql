-- ============================================================================
-- 텔레그램 대화 -> 영업사원 이름
--
-- **왜 필요한가** — `activities.user_name`은 '누가 다녀왔는가'이고 담당 판정의
-- 근거다. 앱에서 넣은 활동은 로그인한 사람을 넣는데, 봇으로 들어온 활동은
-- 지금까지 비어 있었다(33건).
--
-- 지금은 거래처마다 담당이 다 지정돼 있어 KPI 누락이 0건이지만,
-- **담당 없는 거래처를 봇으로 처음 기록하면** 그 거래처는 담당이 안 붙고
-- KPI 정기적방문횟수·영업 코치에서 빠진다. 영업사원이 둘 더 늘면 '누가
-- 다녀왔는지'도 구분해야 한다.
--
-- 이 칸이 없어도 봇은 그대로 동작한다 — 없으면 예전처럼 비워 둘 뿐이다.
-- 몇 번을 다시 돌려도 안전하다.
-- ============================================================================

alter table public.bot_allowlist
    add column if not exists sales_rep text;

comment on column public.bot_allowlist.sales_rep is
    '이 대화로 들어온 활동의 user_name. clients.sales_rep과 같은 표기를 쓴다 (예: 이헌일).';

-- 이미 등록된 대화에 이름을 넣는다. label이 사람 이름이므로 그것으로 짐작하지
-- 않고 명시한다 — 표기가 다르면 담당 판정이 어긋난다.
update public.bot_allowlist
set sales_rep = '이헌일'
where sales_rep is null
  and label ilike '%heon%';

-- 확인
select chat_id, label, sales_rep from public.bot_allowlist;
