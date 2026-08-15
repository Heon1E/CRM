/**
 * 영업 단계 — 파이프라인의 뼈대
 *
 * Pipedrive·HubSpot이 쓰는 방식을 이 회사의 실제 흐름에 맞췄다.
 * `샘플`이 한 단계로 들어간 것이 이 회사의 특징이다 — 화학·식품 용기라
 * 고객이 반드시 샘플을 받아 테스트하고, 거기서 몇 달이 걸리기도 한다.
 * (영업 코치의 '샘플 진행', 거래처 브리핑의 STAGES와 같은 눈높이다.)
 *
 * **확률은 단계에 붙는다.** 사람이 매번 감으로 적으면 값이 제각각이라
 * 합계가 의미를 잃는다. 필요하면 건별로 덮어쓸 수 있다.
 *
 * DB의 check 제약(`execution/sql/deals.sql`)과 이름이 같아야 한다.
 * 한쪽만 고치면 저장이 조용히 실패한다.
 */

export const STAGES = [
    { key: '리드', label: '리드', prob: 10, hint: '이름만 아는 단계. 아직 얘기 전.' },
    { key: '접촉', label: '접촉', prob: 25, hint: '만나거나 통화해서 필요를 파악 중.' },
    { key: '제안', label: '제안', prob: 45, hint: '견적을 냈다.' },
    { key: '샘플', label: '샘플', prob: 60, hint: '샘플을 보내 테스트 중. 이 회사는 여기서 오래 걸린다.' },
    { key: '협상', label: '협상', prob: 80, hint: '단가·납기를 맞추는 중.' },
]

/** 닫힌 단계 — 보드에서는 따로 센다 */
export const CLOSED = [
    { key: '수주', label: '수주', prob: 100, won: true },
    { key: '실패', label: '실패', prob: 0, won: false },
]

export const ALL_STAGES = [...STAGES, ...CLOSED]
export const STAGE_KEYS = ALL_STAGES.map((s) => s.key)
export const OPEN_KEYS = STAGES.map((s) => s.key)

export const isOpen = (stage) => OPEN_KEYS.includes(stage)
export const isWon = (stage) => stage === '수주'
export const isLost = (stage) => stage === '실패'

export const stageOf = (key) => ALL_STAGES.find((s) => s.key === key) || null

/** 확률 — 건별 값이 있으면 그것, 없으면 단계 기본값 */
export const probabilityOf = (deal) => {
    if (deal?.probability !== null && deal?.probability !== undefined && deal.probability !== '') {
        const n = Number(deal.probability)
        if (Number.isFinite(n)) return Math.max(0, Math.min(100, n))
    }
    return stageOf(deal?.stage)?.prob ?? 0
}

/** 가중 금액 = 금액 × 확률. 파이프라인 '기대값'은 이걸 더한 것이다. */
export const weightedAmount = (deal) =>
    (Number(deal?.amount) || 0) * probabilityOf(deal) / 100

const DAY = 86400000

/**
 * 며칠째 이 단계에 머물러 있나.
 * `updated_at`이 아니라 `stage_changed_at`을 본다 — 메모만 고쳐도 바뀌는 값으로
 * 정체를 재면 손댈 때마다 '방금 움직인 건'이 되어 영영 안 잡힌다.
 */
export const daysInStage = (deal, now = Date.now()) => {
    const t = deal?.stage_changed_at || deal?.created_at
    if (!t) return 0
    return Math.max(0, Math.floor((now - new Date(t).getTime()) / DAY))
}

/**
 * 단계별로 '이만큼 지나면 멈춘 것' 기준.
 * 샘플은 원래 오래 걸리므로 길게 잡는다 — 똑같이 30일로 두면 샘플 건이 전부
 * 빨갛게 떠서 경고가 의미를 잃는다.
 */
export const STALE_DAYS = { 리드: 21, 접촉: 21, 제안: 30, 샘플: 60, 협상: 21 }

export const isStale = (deal, now = Date.now()) => {
    if (!isOpen(deal?.stage)) return false
    const limit = STALE_DAYS[deal.stage] ?? 30
    return daysInStage(deal, now) > limit
}

/** 예상 마감이 지났는데 아직 안 닫힌 건 */
export const isOverdue = (deal, now = Date.now()) => {
    if (!isOpen(deal?.stage) || !deal?.expected_close) return false
    return new Date(`${String(deal.expected_close).slice(0, 10)}T23:59:59`).getTime() < now
}

/** 보드 위쪽에 띄우는 요약 */
export const summarize = (deals, now = Date.now()) => {
    const open = (deals || []).filter((d) => isOpen(d.stage))
    const won = (deals || []).filter((d) => isWon(d.stage))
    const lost = (deals || []).filter((d) => isLost(d.stage))
    const closed = won.length + lost.length
    return {
        openCount: open.length,
        openAmount: open.reduce((a, d) => a + (Number(d.amount) || 0), 0),
        weighted: open.reduce((a, d) => a + weightedAmount(d), 0),
        staleCount: open.filter((d) => isStale(d, now)).length,
        overdueCount: open.filter((d) => isOverdue(d, now)).length,
        wonCount: won.length,
        wonAmount: won.reduce((a, d) => a + (Number(d.amount) || 0), 0),
        lostCount: lost.length,
        // 수주율은 **닫힌 건만** 놓고 센다. 진행 중인 건을 분모에 넣으면
        // 기회를 많이 만들수록 수주율이 떨어지는 이상한 지표가 된다.
        winRate: closed > 0 ? Math.round((won.length / closed) * 100) : null,
    }
}

/** 단계별로 나눈다. 빈 단계도 칸을 남긴다 — 보드는 자리가 고정돼야 읽힌다. */
export const groupByStage = (deals) => {
    const out = {}
    for (const s of ALL_STAGES) out[s.key] = []
    for (const d of deals || []) (out[d.stage] || (out[d.stage] = [])).push(d)
    return out
}
