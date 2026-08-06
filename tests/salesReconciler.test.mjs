/**
 * 매출 엑셀 대사 엔진 테스트
 * 실행: npm run test:unit
 *
 * 핵심 요구사항:
 *   1) 같은 파일을 다시 올려도 중복이 생기지 않는다
 *   2) ERP에서 금액이 수정된 건은 CRM에 반영된다
 *   3) 거래처가 비어있던 행('알수없음')은 삭제 후보로 잡혀 정리된다
 *   4) 엑셀에 없는 날짜는 절대 건드리지 않는다
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileSales } from '../src/utils/salesReconciler.js'

const C1 = 'client-aaa'
const C2 = 'client-bbb'

/** DB 행 (sales 테이블 원본 형태) */
const db = (id, date, clientId, item, qty, price) => ({
    id, sale_date: date, client_id: clientId, item_name: item,
    quantity: qty, unit_price: price, total_amount: qty * price
})

/** 엑셀 행 (거래처 확정 후 형태) */
const xl = (date, clientId, item, qty, price) => ({
    sale_date: date, clientId, clientName: '테스트상사', item_name: item,
    quantity: qty, unitPrice: price, totalAmount: qty * price
})

test('같은 파일을 다시 올리면 아무것도 바뀌지 않는다', () => {
    const dbRows = [
        db('1', '2026-03-19', C1, 'BF-50V1H', 15, 200000),
        db('2', '2026-03-19', C1, '커플러', 2, 20000)
    ]
    const excel = [
        xl('2026-03-19', C1, 'BF-50V1H', 15, 200000),
        xl('2026-03-19', C1, '커플러', 2, 20000)
    ]
    const r = reconcileSales(excel, dbRows)

    assert.equal(r.stats.unchanged, 2)
    assert.equal(r.stats.insert, 0)
    assert.equal(r.stats.update, 0)
    assert.equal(r.stats.delete, 0)
    assert.equal(r.stats.amountAfter, r.stats.amountBefore)
})

test('ERP에서 금액이 수정된 건은 수정으로 잡힌다 (중복 생성 아님)', () => {
    const dbRows = [db('1', '2026-03-19', C1, 'BF-50V1H', 15, 200000)] // 300만원
    const excel = [xl('2026-03-19', C1, 'BF-50V1H', 15, 210000)]        // 315만원으로 정정

    const r = reconcileSales(excel, dbRows)

    assert.equal(r.stats.update, 1)
    assert.equal(r.stats.insert, 0, '중복 등록되면 안 된다')
    assert.equal(r.stats.delete, 0)
    assert.equal(r.toUpdate[0].id, '1')
    const fields = r.toUpdate[0].changes.map(c => c.field).sort()
    assert.deepEqual(fields, ['금액', '단가'])
    assert.equal(r.stats.amountAfter, 3150000)
})

test('수량이 바뀐 건도 수정으로 잡힌다', () => {
    const dbRows = [db('1', '2026-03-19', C1, 'BF-50V1H', 15, 200000)]
    const excel = [xl('2026-03-19', C1, 'BF-50V1H', 20, 200000)]

    const r = reconcileSales(excel, dbRows)

    assert.equal(r.stats.update, 1)
    assert.equal(r.stats.insert, 0)
    assert.equal(r.toUpdate[0].via, '수량 변경')
    const fields = r.toUpdate[0].changes.map(c => c.field)
    assert.ok(fields.includes('수량'))
})

test("거래처가 비어있는 '알수없음' 행은 삭제 후보로 잡히고, 정상 행이 새로 등록된다", () => {
    // 과거 버그로 client_id가 null로 저장된 행
    const dbRows = [db('orphan-1', '2026-03-19', null, 'BF-50V1H', 15, 200000)]
    // 이번엔 거래처가 제대로 붙은 같은 매출
    const excel = [xl('2026-03-19', C1, 'BF-50V1H', 15, 200000)]

    const r = reconcileSales(excel, dbRows)

    assert.equal(r.stats.insert, 1, '올바른 거래처로 새로 등록되어야 한다')
    assert.equal(r.stats.delete, 1, '거래처가 빈 기존 행은 삭제 후보여야 한다')
    assert.equal(r.toDelete[0].id, 'orphan-1')
    // 이중 계상되지 않는지: 반영 후 금액이 그대로여야 한다
    assert.equal(r.stats.amountAfter, r.stats.amountBefore)
})

test('엑셀에 없는 날짜의 매출은 건드리지 않는다', () => {
    const dbRows = [
        db('1', '2026-03-19', C1, 'A', 1, 1000),
        db('2', '2026-03-20', C1, 'B', 1, 2000) // 엑셀에 없는 날짜
    ]
    const excel = [xl('2026-03-19', C1, 'A', 1, 1000)]

    const r = reconcileSales(excel, dbRows)

    assert.deepEqual(r.targetDates, ['2026-03-19'])
    assert.equal(r.stats.dbRowsOutOfScope, 1)
    assert.equal(r.stats.delete, 0, '대상 기간 밖의 행은 삭제 후보가 되면 안 된다')
    assert.ok(!r.toDelete.some(d => d.id === '2'))
})

test('엑셀에서 빠진 건은 삭제 후보로 잡힌다', () => {
    const dbRows = [
        db('1', '2026-03-19', C1, 'A', 1, 1000),
        db('2', '2026-03-19', C1, 'B', 1, 2000) // ERP에서 삭제됨
    ]
    const excel = [xl('2026-03-19', C1, 'A', 1, 1000)]

    const r = reconcileSales(excel, dbRows)

    assert.equal(r.stats.delete, 1)
    assert.equal(r.toDelete[0].id, '2')
    assert.equal(r.stats.amountAfter, 1000)
})

test('같은 날 같은 품목이 여러 건이어도 개수가 맞는다', () => {
    // 동일 조건 3건이 DB에 있고 엑셀에는 2건 -> 2건 유지, 1건 삭제 후보
    const dbRows = [
        db('1', '2026-03-19', C1, 'A', 1, 1000),
        db('2', '2026-03-19', C1, 'A', 1, 1000),
        db('3', '2026-03-19', C1, 'A', 1, 1000)
    ]
    const excel = [
        xl('2026-03-19', C1, 'A', 1, 1000),
        xl('2026-03-19', C1, 'A', 1, 1000)
    ]
    const r = reconcileSales(excel, dbRows)

    assert.equal(r.stats.unchanged, 2)
    assert.equal(r.stats.delete, 1)
    assert.equal(r.stats.insert, 0)
})

test('신규 거래처·신규 품목은 등록 대상이 된다', () => {
    const dbRows = [db('1', '2026-03-19', C1, 'A', 1, 1000)]
    const excel = [
        xl('2026-03-19', C1, 'A', 1, 1000),
        xl('2026-03-19', C2, '신규품목', 5, 3000)
    ]
    const r = reconcileSales(excel, dbRows)

    assert.equal(r.stats.unchanged, 1)
    assert.equal(r.stats.insert, 1)
    assert.equal(r.stats.delete, 0)
    assert.equal(r.toInsert[0].clientId, C2)
})

test('품목명의 공백·대소문자 차이는 같은 것으로 본다', () => {
    const dbRows = [db('1', '2026-03-19', C1, 'BF-50V1H (중/소)', 15, 200000)]
    const excel = [xl('2026-03-19', C1, 'bf-50v1h(중/소)', 15, 200000)]

    const r = reconcileSales(excel, dbRows)
    assert.equal(r.stats.unchanged, 1)
    assert.equal(r.stats.insert, 0)
})

test('빈 엑셀은 아무 영향도 주지 않는다', () => {
    const dbRows = [db('1', '2026-03-19', C1, 'A', 1, 1000)]
    const r = reconcileSales([], dbRows)

    assert.equal(r.stats.insert, 0)
    assert.equal(r.stats.update, 0)
    assert.equal(r.stats.delete, 0, '대상 날짜가 없으므로 삭제 후보도 없어야 한다')
})

test('상반기 재업로드 시나리오: 유지·수정·신규·삭제가 한 번에 처리된다', () => {
    const dbRows = [
        db('keep', '2026-03-19', C1, 'A', 10, 1000),          // 그대로
        db('fix', '2026-03-19', C1, 'B', 5, 2000),            // ERP에서 금액 수정됨
        db('orphan', '2026-03-20', null, 'C', 3, 5000),       // 알수없음 행
        db('gone', '2026-03-20', C1, 'D', 1, 9000),           // ERP에서 삭제됨
        db('untouched', '2026-04-01', C1, 'E', 1, 7000)       // 엑셀에 없는 날짜
    ]
    const excel = [
        xl('2026-03-19', C1, 'A', 10, 1000),
        xl('2026-03-19', C1, 'B', 5, 2500),                   // 금액 정정
        xl('2026-03-20', C2, 'C', 3, 5000)                    // 거래처가 제대로 붙음
    ]

    const r = reconcileSales(excel, dbRows)

    assert.equal(r.stats.unchanged, 1)
    assert.equal(r.stats.update, 1)
    assert.equal(r.stats.insert, 1)
    assert.equal(r.stats.delete, 2, 'orphan + gone')
    assert.deepEqual(r.toDelete.map(d => d.id).sort(), ['gone', 'orphan'])
    assert.equal(r.stats.dbRowsOutOfScope, 1)

    // 반영 후 금액 = 10000 + 12500 + 15000
    assert.equal(r.stats.amountAfter, 37500)
})

test('날짜 형식이 달라도 기존 매출을 찾아낸다 (중복 등록 방지)', () => {
    // 2026-08-05 사고의 회귀 테스트.
    // 엑셀은 '20260122', DB는 '2026-01-22'로 저장된다. 정규화가 없으면
    // 대사 범위가 비어 전부 신규로 잡히고 그대로 다시 등록된다.
    const dbRows = [db('1', '2026-01-22', C1, 'BF-50V1H', 15, 200000)]
    const excel = [{
        sale_date: '20260122',            // 구분자 없는 8자리
        clientId: C1, clientName: '테스트상사', item_name: 'BF-50V1H',
        quantity: 15, unitPrice: 200000, totalAmount: 3000000
    }]

    const r = reconcileSales(excel, dbRows)

    assert.equal(r.stats.insert, 0, '같은 매출이 중복 등록되면 안 된다')
    assert.equal(r.stats.unchanged, 1)
    assert.equal(r.stats.delete, 0)
    assert.deepEqual(r.targetDates, ['2026-01-22'], '대상 날짜가 DB 형식으로 정규화되어야 한다')
})

test('점/슬래시 구분 날짜도 동일하게 인식한다', () => {
    const dbRows = [db('1', '2026-03-09', C1, 'A', 1, 1000)]
    for (const fmt of ['2026.3.9', '2026/03/09', '2026-3-9']) {
        const r = reconcileSales(
            [{ sale_date: fmt, clientId: C1, item_name: 'A', quantity: 1, unitPrice: 1000, totalAmount: 1000 }],
            dbRows
        )
        assert.equal(r.stats.insert, 0, `${fmt} 형식에서 중복 발생`)
        assert.equal(r.stats.unchanged, 1, `${fmt} 형식이 매칭되지 않음`)
    }
})
