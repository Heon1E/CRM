/**
 * 매출 집계 — 서버가 줄여 준 자료를 화면 값으로 바꾼다
 *
 * 예전에는 브라우저가 매출 15,221행을 다 받아서 더했다. 거래가 3배 늘면
 * 그대로 3배 느려진다. 이제 Postgres가 `client_month_sales` 뷰로 줄여 주고
 * 여기서는 그것만 다룬다.
 *
 * **순수 함수만 둔다.** 조회는 서비스가, 계산은 여기가 맡아야 테스트할 수 있다.
 * 이 계산이 틀리면 상단 카드·KPI·영업 코치가 한꺼번에 틀린다.
 */

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

/** `2026-08-01` / Date / `2026-08-01T00:00:00Z` → `2026-08` */
export const ymKey = (v) => {
    if (!v) return ''
    if (typeof v === 'string') return v.slice(0, 7)
    const d = new Date(v)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** `2026-08` → 2026 */
export const yearOf = (ym) => Number(String(ym).slice(0, 4)) || 0

/**
 * 월별 합계.
 * @param rows `{ ym, amount }` — 뷰가 주는 모양 그대로
 * @returns `{ '2026-08': 549850000, ... }`
 */
export const byMonth = (rows) => {
    const out = {}
    for (const r of rows || []) {
        const k = ymKey(r.ym)
        if (!k) continue
        out[k] = (out[k] || 0) + num(r.amount)
    }
    return out
}

/** 연도별 합계 */
export const byYear = (rows) => {
    const out = {}
    for (const r of rows || []) {
        const y = yearOf(ymKey(r.ym))
        if (!y) continue
        out[y] = (out[y] || 0) + num(r.amount)
    }
    return out
}

/**
 * 연초부터 기준월까지 누계.
 * **기준월을 포함한다** — '올해 누적 매출'은 이번 달까지 판 것을 말한다.
 */
export const ytd = (rows, refYm) => {
    const y = yearOf(refYm)
    let sum = 0
    for (const r of rows || []) {
        const k = ymKey(r.ym)
        if (yearOf(k) === y && k <= refYm) sum += num(r.amount)
    }
    return sum
}

/**
 * 작년 같은 기간 누계. 전년 동기 대비를 재려면 **같은 달수**를 비교해야 한다.
 * 올해 8월까지와 작년 12월까지를 비교하면 언제나 크게 줄어든 것처럼 나온다.
 */
export const ytdLastYear = (rows, refYm) => {
    const y = yearOf(refYm) - 1
    const cutoff = `${y}-${String(refYm).slice(5, 7)}`
    let sum = 0
    for (const r of rows || []) {
        const k = ymKey(r.ym)
        if (yearOf(k) === y && k <= cutoff) sum += num(r.amount)
    }
    return sum
}

/** 증감률(%). 기준이 0이면 비교할 수 없으므로 null을 준다 (0%가 아니다). */
export const growth = (now, before) => {
    if (!before) return null
    return ((now - before) / before) * 100
}

/**
 * 최근 N개월 이름표. 값이 없는 달도 0으로 채워 준다 —
 * 거래가 없던 달이 빠지면 그래프가 그 달을 건너뛰어 추이가 왜곡된다.
 */
export const lastMonths = (refYm, n) => {
    const [y, m] = String(refYm).split('-').map(Number)
    const out = []
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(y, m - 1 - i, 1)
        out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return out
}

/** 그래프에 넣을 `[{ ym, amount }]` — 빈 달은 0으로 */
export const monthlySeries = (rows, refYm, n = 12) => {
    const m = byMonth(rows)
    return lastMonths(refYm, n).map((ym) => ({ ym, amount: m[ym] || 0 }))
}

/**
 * 거래처별 누계 — 뷰가 거래처×월로 주므로 여기서 접는다.
 * @returns `{ [client_id]: { total, lastDate } }`
 */
export const byClient = (rows) => {
    const out = {}
    for (const r of rows || []) {
        const id = r.client_id
        if (!id) continue
        const cur = out[id] || (out[id] = { total: 0, lastDate: null })
        cur.total += num(r.amount)
        const d = r.last_date || r.ym
        if (d && (!cur.lastDate || d > cur.lastDate)) cur.lastDate = d
    }
    return out
}

/** 거래한 거래처 수 (기간 안에 매출이 하나라도 있는 곳) */
export const activeClientCount = (rows, fromYm) => {
    const set = new Set()
    for (const r of rows || []) {
        if (!r.client_id) continue
        if (fromYm && ymKey(r.ym) < fromYm) continue
        if (num(r.amount) === 0) continue
        set.add(r.client_id)
    }
    return set.size
}
