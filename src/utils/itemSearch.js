/**
 * 품목으로 매출 찾기 (순수 함수)
 *
 * 밖에서 영업하다가 거래처가 "이거 얼마였죠?" 하고 물으면 바로 답해야 한다.
 * 그래서 품목명으로 찾고, **거래처별로 마지막에 얼마에 팔았는지**를 먼저 보여준다.
 * 줄줄이 이어진 이력은 그 아래 참고로 둔다.
 */

/**
 * 검색어를 낱말로 나눠 `ilike` 패턴으로 만든다.
 *
 * **낱말마다 따로 건다(AND).** `150 캡`을 통째로 찾으면 `150캡`이 안 걸리고,
 * `BF 50`을 통째로 찾으면 `BF-50V1H`가 안 걸린다. 낱말을 나눠 각각 들어 있는지
 * 보면 띄어쓰기·하이픈 차이를 넘는다.
 *
 * `%`·`_`는 `ilike`에서 와일드카드라 글자 그대로 찾도록 막는다.
 */
export const itemSearchPatterns = (term) =>
    String(term || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => `%${w.replace(/[\\%_]/g, (m) => `\\${m}`)}%`)

/**
 * 거래처 × 품목별 '마지막 단가'.
 *
 * - **단가는 0원이 아닌 마지막 값**을 쓴다. 이 회사에서 0원 매출은 월말 결제 이월
 *   이거나 부품·교환·샘플이라(CLAUDE.md '금액 0원 매출') 가격을 물었을 때 답이 아니다.
 *   0원만 있으면 0을 그대로 둔다 — 없는 값을 지어내지 않는다.
 * - 최근 거래일은 0원 줄까지 포함한 마지막 날이다(언제 마지막으로 나갔는지).
 * - 입력 순서에 기대지 않는다. 같은 날 여러 줄이면 먼저 온 줄을 쓴다.
 *
 * @param {Array<{client_id, clientName, item_name, unit_price, quantity, sale_date}>} rows
 * @returns {Array<{key, clientId, clientName, itemName, price, priceDate, lastDate, count, qty}>}
 *   최근 거래일이 늦은 것부터
 */
export const summarizeItemPrices = (rows) => {
    const groups = new Map()
    for (const r of rows || []) {
        const itemName = String(r.item_name || '').trim()
        const clientId = r.client_id || ''
        const key = `${clientId}|${itemName}`
        const date = String(r.sale_date || '').slice(0, 10)
        const price = Number(r.unit_price) || 0
        const qty = Number(r.quantity) || 0

        let g = groups.get(key)
        if (!g) {
            g = { key, clientId, clientName: r.clientName || '', itemName, price: 0, priceDate: '', lastDate: '', count: 0, qty: 0 }
            groups.set(key, g)
        }
        g.count += 1
        g.qty += qty
        if (date > g.lastDate) g.lastDate = date
        if (price > 0 && date > g.priceDate) { g.price = price; g.priceDate = date }
    }
    return [...groups.values()].sort((a, b) =>
        b.lastDate.localeCompare(a.lastDate) || a.clientName.localeCompare(b.clientName, 'ko'))
}
