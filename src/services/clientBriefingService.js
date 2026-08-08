/**
 * 거래처 브리핑 — 호출과 캐시
 *
 * 판독은 서버(`/api/client-briefing`)에서 한다. 키를 프론트에 두지 않기 위해서다.
 *
 * **같은 내용을 두 번 부르지 않는다.** 브리핑은 활동 기록이 늘어나야 달라지므로,
 * 활동 건수와 마지막 활동일을 지문으로 삼아 캐시한다. 거래처를 다시 눌러도
 * 새 활동이 없으면 즉시 뜬다(호출 비용도 안 든다).
 */

const KEY = 'client_briefings'
const ENDPOINT = '/api/client-briefing'

/** 활동이 바뀌었는지 판별할 지문 */
export const fingerprintOf = (activities = []) => {
    if (activities.length === 0) return 'none'
    const last = activities.reduce((a, x) => {
        const d = String(x.date || '')
        return d > a ? d : a
    }, '')
    return `${activities.length}:${last}`
}

const readAll = () => {
    try {
        const raw = localStorage.getItem(KEY)
        return raw ? JSON.parse(raw) : {}
    } catch {
        return {}
    }
}

const writeAll = (all) => {
    try {
        localStorage.setItem(KEY, JSON.stringify(all))
    } catch {
        // 용량이 차면 오래된 것부터 버린다
        const all2 = readAll()
        const keys = Object.keys(all2)
        keys.slice(0, Math.ceil(keys.length / 2)).forEach((k) => delete all2[k])
        try { localStorage.setItem(KEY, JSON.stringify(all2)) } catch { /* 포기 */ }
    }
}

/** 캐시에 있으면 꺼낸다 (활동이 그대로일 때만) */
export const getCachedBriefing = (clientId, activities) => {
    const hit = readAll()[clientId]
    if (!hit) return null
    return hit.fingerprint === fingerprintOf(activities) ? hit.data : null
}

/** 코치 목록에서 단계 배지를 보여주기 위해 캐시된 것만 모아 읽는다 */
export const getAllCachedStages = () => {
    const all = readAll()
    const out = {}
    Object.entries(all).forEach(([id, v]) => { if (v?.data?.stage) out[id] = v.data.stage })
    return out
}

export const clearBriefing = (clientId) => {
    const all = readAll()
    delete all[clientId]
    writeAll(all)
}

/**
 * 브리핑을 가져온다.
 * @param {{id, company}} client
 * @param {Array<{date, type, description}>} activities - 오래된 것부터
 * @param {string} salesSummary - 앱이 계산한 수치 요약 (모델이 다시 계산하지 않도록)
 * @param {{ force?: boolean }} opts
 */
export async function fetchBriefing(client, activities, salesSummary, { force = false } = {}) {
    if (!force) {
        const cached = getCachedBriefing(client.id, activities)
        if (cached) return { ...cached, fromCache: true }
    }

    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: client.company, activities, salesSummary })
    })

    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload?.message || `브리핑 서버 오류 (${res.status})`)

    const all = readAll()
    all[client.id] = { fingerprint: fingerprintOf(activities), savedAt: new Date().toISOString(), data: payload }
    writeAll(all)

    return { ...payload, fromCache: false }
}
