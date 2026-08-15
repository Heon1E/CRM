/**
 * 거래처 목록 거르기 + 저장된 보기
 *
 * 거래처가 1,150곳인데 검색창 하나뿐이었다. 매번 같은 조건으로 찾는 일이
 * 반복되므로(내 담당만, 오래 거래 없는 곳, 연락처 없는 곳…) 조건을 만들고
 * 자주 쓰는 조합에 이름을 붙여 둔다.
 *
 * **판정은 전부 순수 함수로 둔다.** 화면에서 조건을 계산하면 조건이 늘 때마다
 * 화면이 복잡해지고, 무엇보다 테스트할 수 없다.
 *
 * 입력은 회사 단위로 접힌 값이다 (`Clients.jsx`의 `companyRank`):
 *   `{ tier, rev, acts, last, lastSale, mine, hasContact }`
 */

const DAY = 86400000

/** 조건 목록 — 화면의 단추가 이 순서대로 나온다 */
export const FILTERS = [
    { key: 'mine', label: '내 담당', hint: '담당자가 나로 지정된 곳' },
    { key: 'hasSales', label: '매출 있음', hint: '거래 실적이 있는 곳' },
    { key: 'recent', label: '최근 3개월 거래', hint: '90일 안에 매출이 있는 곳' },
    { key: 'dormant', label: '6개월 무거래', hint: '거래 이력은 있는데 180일 넘게 조용한 곳' },
    { key: 'active', label: '영업 중', hint: '방문·통화 기록이 있는 곳' },
    { key: 'noContact', label: '연락처 없음', hint: '담당자·전화번호가 비어 있는 곳' },
]

export const FILTER_KEYS = FILTERS.map((f) => f.key)

/**
 * 한 회사가 조건에 맞는가.
 * @param row `{ mine, rev, lastSale, acts, hasContact }`
 * @param key 조건 이름
 * @param now 기준 시각 (테스트에서 주입한다)
 */
export const matches = (row, key, now = Date.now()) => {
    if (!row) return false
    switch (key) {
        case 'mine': return !!row.mine
        case 'hasSales': return (row.rev || 0) > 0
        case 'recent': return !!row.lastSale && (now - row.lastSale) <= 90 * DAY
        // 거래 이력이 아예 없는 곳은 '무거래'가 아니라 '아직 거래 전'이다. 섞으면
        // 목록이 신규 후보로 가득 차서 정작 챙길 휴면 거래처가 묻힌다.
        case 'dormant': return (row.rev || 0) > 0 && (!row.lastSale || (now - row.lastSale) > 180 * DAY)
        case 'active': return (row.acts || 0) > 0
        case 'noContact': return !row.hasContact
        default: return true
    }
}

/** 고른 조건을 **모두** 만족해야 한다 (AND). 하나도 안 골랐으면 전부 통과. */
export const passes = (row, activeKeys, now = Date.now()) => {
    if (!activeKeys || activeKeys.length === 0) return true
    return activeKeys.every((k) => matches(row, k, now))
}

/** 회사 이름 목록을 조건으로 거른다 */
export const filterCompanies = (companies, rankMap, activeKeys, now = Date.now()) => {
    if (!activeKeys || activeKeys.length === 0) return companies
    return (companies || []).filter((c) => passes(rankMap.get?.(c) ?? rankMap[c], activeKeys, now))
}

/* ── 저장된 보기 ─────────────────────────────────────────────────────────
   기기마다 따로 남는다(localStorage). 사람마다 자주 보는 조합이 다르고,
   표를 하나 더 만들 만큼 무거운 값이 아니다.
   ---------------------------------------------------------------------- */
const KEY = 'xavian_client_views'

export const loadViews = () => {
    try {
        const v = JSON.parse(localStorage.getItem(KEY) || '[]')
        return Array.isArray(v) ? v.filter((x) => x && x.name) : []
    } catch { return [] }
}

export const saveViews = (views) => {
    try { localStorage.setItem(KEY, JSON.stringify(views || [])) } catch { /* 저장 못 해도 화면은 돌아야 한다 */ }
}

/** 같은 이름이면 덮어쓴다 — 보기를 고쳐 저장하는 것이 자연스럽다 */
export const addView = (views, name, filters, search) => {
    const clean = String(name || '').trim()
    if (!clean) return views
    const next = (views || []).filter((v) => v.name !== clean)
    next.push({ name: clean, filters: [...(filters || [])], search: search || '' })
    return next
}

export const removeView = (views, name) => (views || []).filter((v) => v.name !== name)

/** 조건을 사람 말로 — 저장할 때 기본 이름으로 쓴다 */
export const describe = (activeKeys) => {
    if (!activeKeys || activeKeys.length === 0) return '전체'
    return activeKeys
        .map((k) => FILTERS.find((f) => f.key === k)?.label || k)
        .join(' + ')
}
