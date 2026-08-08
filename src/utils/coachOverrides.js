/**
 * 영업 코치 수동 보정
 *
 * 규칙만으로는 못 맞추는 것이 있다. CRM 데이터가 사실을 다 담고 있지 않기 때문이다.
 *   - 한독산업: CRM에는 2026년 매출부터 있어 '첫 거래 성사'로 잡히지만,
 *               실제로는 예전에 거래하다 끊겼다가 되살아난 곳이다.
 *   - 주식회사 윌슨플로켐: 휴브글로벌 자회사로 원래 거래하던 곳이다. 신규가 아니다.
 * 이런 건 사람이 알려줘야 한다.
 *
 * 두 가지 저장소를 합쳐서 쓴다:
 *   KNOWN_FACTS  — 코드에 박아둔 사실. 어느 기기에서 봐도 같게 적용된다.
 *   localStorage — 화면에서 누른 '제외'. 기기마다 따로 남는다.
 */

const KEY = 'coach_overrides'

/**
 * 사용자가 알려준 사실.
 * kind: 'existing'  이미 거래하던 곳 (신규 영업 대상이 아님)
 *       'restored'  끊겼다가 되살아난 곳 (복원 성과로 본다)
 *       'hide'      코치에서 완전히 뺀다
 */
export const KNOWN_FACTS = {
    '한독산업(주)': { kind: 'restored', why: '예전 거래처가 되살아난 곳 (CRM에는 과거 실적이 없음)' },
    '주식회사 윌슨플로켐': { kind: 'existing', why: '휴브글로벌 자회사로 원래 거래하던 곳' },
}

/** @returns {Object} clientId -> { kind, why } */
export function getCoachOverrides() {
    try {
        const raw = localStorage.getItem(KEY)
        return raw ? JSON.parse(raw) : {}
    } catch {
        return {}
    }
}

/** 제외/복구 토글. 이미 같은 kind면 해제한다. */
export function toggleCoachOverride(clientId, kind = 'hide', why = '') {
    const all = getCoachOverrides()
    if (all[clientId]?.kind === kind) delete all[clientId]
    else all[clientId] = { kind, why }
    localStorage.setItem(KEY, JSON.stringify(all))
    return all
}

export function clearCoachOverride(clientId) {
    const all = getCoachOverrides()
    delete all[clientId]
    localStorage.setItem(KEY, JSON.stringify(all))
    return all
}

/**
 * 거래처 하나에 적용할 최종 보정값.
 * 화면에서 누른 값이 코드에 박아둔 사실보다 우선한다 (사람이 나중에 판단한 것이므로).
 */
export function overrideFor(overrides, client) {
    if (!client) return null
    return overrides[client.id] || KNOWN_FACTS[String(client.company || '').trim()] || null
}
