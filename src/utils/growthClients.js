/**
 * 대시보드 '빠르게 크는 거래처' (순수 함수)
 *
 * 예전 계산에는 결함이 셋 있었다 (2026-10-20, 화면에 `+-60%`가 떴다):
 *
 * 1. **이번 달 '지금까지'를 지난달 '한 달 전체'와 비교했다.** 20일이면 이번 달은
 *    2/3만 지났으니 거의 모든 거래처가 줄어든 것처럼 나온다. 연간 누계(`ytdLastYear`)가
 *    같은 달수만 비교하는 것과 같은 규칙으로 **같은 날수끼리** 비교한다
 *    (이번 달 1~20일 vs 지난달 1~20일).
 * 2. **줄어든 곳도 목록에 들어갔다.** 매출이 있는 곳을 성장률 순으로 4곳 잘랐을 뿐이라
 *    크는 곳이 모자라면 줄어든 곳이 채웠다. '빠르게 크는' 목록이므로 늘어난 곳만 남긴다.
 * 3. **화면이 언제나 `+`를 붙였다** → `+-60%`. 비교할 매출이 없으면 성장률을
 *    100%로 지어냈다. 처음 산 곳은 '첫 거래'로 따로 보이고(맨 앞), 두세 달 간격으로
 *    사는 곳이 다시 산 것(`returning`)은 성장이 아니라 주기라 목록에서 뺀다 — 넣으면
 *    정기 주문처가 목록을 덮는다.
 *
 * 매달 1~5일은 이번 달 자료가 적어 **지난달 전체 vs 그 전달 전체**로 본다(예전 그대로).
 */

const dayStart = (y, m, d) => new Date(y, m, d, 0, 0, 0, 0)
const dayEnd = (y, m, d) => new Date(y, m, d, 23, 59, 59, 999)
const lastDayOf = (y, m) => new Date(y, m + 1, 0).getDate()

/** 비교 기간 두 개 — { target: [start, end], comparison: [start, end], basis } */
export const growthWindows = (now) => {
    const y = now.getFullYear()
    const m = now.getMonth()
    const day = now.getDate()

    if (day <= 5) {
        return {
            basis: 'lastFullMonth',
            target: [dayStart(y, m - 1, 1), dayEnd(y, m, 0)],
            comparison: [dayStart(y, m - 2, 1), dayEnd(y, m - 1, 0)],
        }
    }
    // 같은 날수끼리. 지난달이 더 짧으면(예: 3/31 vs 2월) 지난달 끝까지만.
    const prevLen = lastDayOf(y, m - 1)
    return {
        basis: 'sameDays',
        target: [dayStart(y, m, 1), dayEnd(y, m, day)],
        comparison: [dayStart(y, m - 1, 1), dayEnd(y, m - 1, Math.min(day, prevLen))],
    }
}

/**
 * @param {Array} sales  client_id·sale_date·total_amount (camelCase도 받는다)
 * @param {Array} clients id·company
 * @returns {Array<{id, name, amount, prevAmount, growthRate: number|null, kind: 'growth'|'new'}>}
 *   첫 거래(금액 순) → 늘어난 곳(성장률 순).
 */
export const computeGrowthClients = ({ sales, clients, now = new Date(), limit = 4 }) => {
    const { target, comparison } = growthWindows(now)
    const nameOf = new Map((clients || []).map((c) => [c.id, c.company || c.name || '알 수 없음']))
    const stats = new Map()

    for (const s of sales || []) {
        const id = s.client_id || s.clientId
        if (!id) continue
        const raw = String(s.sale_date || s.date || s.created_at || '')
        // 'YYYY-MM-DD'는 로컬 날짜로 읽는다 — new Date('2026-10-01')은 UTC 자정이라 시간대에 따라 하루 밀린다
        const ymdMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        const d = ymdMatch ? new Date(+ymdMatch[1], +ymdMatch[2] - 1, +ymdMatch[3]) : new Date(raw)
        if (Number.isNaN(d.getTime())) continue
        const amount = Number(s.total_amount ?? s.totalAmount ?? 0) || 0
        let st = stats.get(id)
        if (!st) { st = { id, amount: 0, prevAmount: 0, before: 0 }; stats.set(id, st) }
        if (d >= target[0] && d <= target[1]) st.amount += amount
        else if (d >= comparison[0] && d <= comparison[1]) st.prevAmount += amount
        if (d < target[0]) st.before += amount
    }

    const rank = { new: 0, growth: 1 }
    return [...stats.values()]
        .filter((c) => c.amount > 0)
        .map((c) => {
            const kind = c.prevAmount > 0 ? 'growth' : (c.before > 0 ? 'returning' : 'new')
            const growthRate = kind === 'growth' ? ((c.amount - c.prevAmount) / c.prevAmount) * 100 : null
            return { id: c.id, name: nameOf.get(c.id) || '알 수 없음', amount: c.amount, prevAmount: c.prevAmount, growthRate, kind }
        })
        .filter((c) => c.kind === 'new' || (c.kind === 'growth' && c.growthRate > 0))
        .sort((a, b) =>
            rank[a.kind] - rank[b.kind]
            || (a.kind === 'growth' ? b.growthRate - a.growthRate : b.amount - a.amount))
        .slice(0, limit)
}

/** 화면 표시 — 성장률은 부호를 숫자에서 가져온다(`+`를 박아 두지 않는다) */
export const growthLabel = (c) => {
    if (c.kind === 'new') return '첫 거래'
    const r = Math.round(c.growthRate)
    return `${r > 0 ? '+' : ''}${r.toLocaleString('ko-KR')}%`
}
