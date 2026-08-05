/**
 * 매출 엑셀 대사(Reconciliation) 엔진
 *
 * 목적:
 *   같은 기간의 매출 엑셀을 다시 올렸을 때 중복을 만들지 않으면서,
 *   ERP에서 나중에 수정된 내용을 CRM에 반영할 수 있게 한다.
 *
 * 기존 방식의 한계:
 *   "그 거래처의 그 날짜에 이미 매출이 있으면 건너뛴다"는 방식이라
 *   금액이 수정된 건을 반영할 방법이 없었고, 거래처가 비어있는 행은
 *   다른 건으로 인식되어 이중 계상되었다.
 *
 * 대사 범위:
 *   **엑셀에 등장하는 날짜만** 대상으로 한다. 엑셀에 없는 날짜의 매출은 건드리지 않는다.
 *
 * 매칭 단계 (앞 단계에서 짝을 찾으면 뒤 단계는 보지 않음):
 *   1단계 완전일치 : 날짜+거래처+품목+수량+단가+금액  -> 변경 없음
 *   2단계 금액변경 : 날짜+거래처+품목+수량            -> 단가/금액만 수정
 *   3단계 수량변경 : 날짜+거래처+품목                 -> 수량·단가·금액 수정
 *   짝을 못 찾은 엑셀 행  -> 신규 등록
 *   짝을 못 찾은 기존 행  -> 삭제 후보 (엑셀에서 빠졌거나 거래처가 비어있는 행)
 *
 * 한 행은 한 번만 짝지어진다(consuming). 같은 날 같은 품목이 여러 건이어도 개수가 맞는다.
 */

const num = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}
const txt = (v) => (v == null ? '' : String(v).trim())
const normItem = (v) => txt(v).replace(/\s+/g, '').toLowerCase()

/** DB(snake_case)와 엑셀(camelCase) 양쪽 표기를 모두 읽는다 */
const F = {
    date: (r) => txt(r.sale_date ?? r.date),
    client: (r) => txt(r.client_id ?? r.clientId),
    item: (r) => normItem(r.item_name ?? r.itemName),
    qty: (r) => num(r.quantity),
    price: (r) => num(r.unit_price ?? r.unitPrice),
    total: (r) => num(r.total_amount ?? r.totalAmount)
}

const kExact = (r) => `${F.date(r)}|${F.client(r)}|${F.item(r)}|${F.qty(r)}|${F.price(r)}|${F.total(r)}`
const kLine = (r) => `${F.date(r)}|${F.client(r)}|${F.item(r)}|${F.qty(r)}`
const kItem = (r) => `${F.date(r)}|${F.client(r)}|${F.item(r)}`

const buildIndex = (entries, keyFn) => {
    const map = new Map()
    entries.forEach((e) => {
        const k = keyFn(e.row)
        if (!map.has(k)) map.set(k, [])
        map.get(k).push(e)
    })
    return map
}

const takeUnused = (index, key) => {
    const list = index.get(key)
    if (!list) return null
    return list.find((e) => !e.used) || null
}

/**
 * @param {Array} excelRows - 거래처가 확정된 엑셀 행
 *        { clientId, clientName, sale_date, item_name, quantity, unitPrice, totalAmount, notes }
 * @param {Array} dbRows - 같은 날짜들의 기존 매출 (sales 테이블 원본 행)
 * @returns {{
 *   unchanged: Array, toInsert: Array, toUpdate: Array, toDelete: Array,
 *   targetDates: string[], stats: object
 * }}
 */
export const reconcileSales = (excelRows = [], dbRows = []) => {
    const targetDates = [...new Set(excelRows.map((r) => F.date(r)).filter(Boolean))].sort()
    const targetDateSet = new Set(targetDates)

    // 엑셀에 없는 날짜의 기존 매출은 대사 대상에서 제외한다
    const inScope = dbRows.filter((r) => targetDateSet.has(F.date(r)))
    const pool = inScope.map((row) => ({ row, used: false }))

    const idxExact = buildIndex(pool, kExact)
    const idxLine = buildIndex(pool, kLine)
    const idxItem = buildIndex(pool, kItem)

    const unchanged = []
    const toUpdate = []
    const toInsert = []

    const describeChanges = (dbRow, excelRow) => {
        const changes = []
        if (F.qty(dbRow) !== F.qty(excelRow)) {
            changes.push({ field: '수량', before: F.qty(dbRow), after: F.qty(excelRow) })
        }
        if (F.price(dbRow) !== F.price(excelRow)) {
            changes.push({ field: '단가', before: F.price(dbRow), after: F.price(excelRow) })
        }
        if (F.total(dbRow) !== F.total(excelRow)) {
            changes.push({ field: '금액', before: F.total(dbRow), after: F.total(excelRow) })
        }
        return changes
    }

    // 1단계: 완전 일치
    let pending = []
    excelRows.forEach((e) => {
        const hit = takeUnused(idxExact, kExact(e))
        if (hit) {
            hit.used = true
            unchanged.push({ excel: e, db: hit.row })
        } else {
            pending.push(e)
        }
    })

    // 2단계: 수량까지 같고 금액만 달라진 건
    let pending2 = []
    pending.forEach((e) => {
        const hit = takeUnused(idxLine, kLine(e))
        if (hit) {
            hit.used = true
            toUpdate.push({ id: hit.row.id, db: hit.row, excel: e, changes: describeChanges(hit.row, e), via: '금액 변경' })
        } else {
            pending2.push(e)
        }
    })

    // 3단계: 같은 품목인데 수량이 달라진 건
    pending2.forEach((e) => {
        const hit = takeUnused(idxItem, kItem(e))
        if (hit) {
            hit.used = true
            toUpdate.push({ id: hit.row.id, db: hit.row, excel: e, changes: describeChanges(hit.row, e), via: '수량 변경' })
        } else {
            toInsert.push(e)
        }
    })

    // 짝을 찾지 못한 기존 행 = 삭제 후보
    const toDelete = pool.filter((e) => !e.used).map((e) => e.row)

    const sumTotal = (rows, get) => rows.reduce((a, r) => a + get(r), 0)

    return {
        unchanged,
        toInsert,
        toUpdate,
        toDelete,
        targetDates,
        stats: {
            excelRows: excelRows.length,
            dbRowsInScope: inScope.length,
            dbRowsOutOfScope: dbRows.length - inScope.length,
            unchanged: unchanged.length,
            insert: toInsert.length,
            update: toUpdate.length,
            delete: toDelete.length,
            // 반영 후 매출 총액이 얼마나 달라지는지
            amountBefore: sumTotal(inScope, F.total),
            amountAfter:
                sumTotal(unchanged.map((u) => u.excel), F.total) +
                sumTotal(toUpdate.map((u) => u.excel), F.total) +
                sumTotal(toInsert, F.total)
        }
    }
}
