/**
 * 외상매출금 대장 판독 · 연체 경과월 계산 테스트
 * 실행: npm run test:unit
 *
 * 핵심 요구사항:
 *   1) 익월 결제가 지켜지는 곳은 연체가 아니다 (aging 0)
 *   2) 당월 매출을 넘어선 잔액만 '연체금액'이다
 *   3) 열 위치를 하드코딩하지 않는다 (달이 추가되면 뒤가 밀린다)
 *   4) 기준월은 '잔액이 채워진 마지막 달'이다 (12월까지 빈 열이 미리 있다)
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
    parseReceivablesLedger, findColumns, findBaseMonth, dataRows, toNumber, agingBucket, summarizeReceivables, ledgerAge } from '../src/utils/receivablesLedger.js'

/**
 * 대장 모양의 2차원 배열을 만든다.
 * 0행 제목 / 1행 빈칸 / 2행 월 헤더(병합) / 3행 매출·수금·잔액 / 4행부터 데이터
 */
const buildSheet = (months, clients, { withDelay = true } = {}) => {
    const aoa = [[], [], [], []]
    const merges = []
    aoa[0] = ['', '2026년 외상매출금 관리대장']

    let col = 2 // 0: 거래처코드, 1: 거래처
    const monthCols = {}
    months.forEach((m) => {
        const [y, mm] = m.split('-')
        aoa[2][col] = `${y}년 ${mm}월`
        merges.push({ s: { r: 2, c: col }, e: { r: 2, c: col + 2 } })
        aoa[3][col] = '매출'
        aoa[3][col + 1] = '수금'
        aoa[3][col + 2] = '잔액'
        monthCols[m] = col
        col += 3
    })
    const delayCol = col
    if (withDelay) { aoa[2][delayCol] = '체크&관리'; aoa[3][delayCol] = '지연' }

    clients.forEach((c, i) => {
        const row = []
        row[1] = c.name
        months.forEach((m) => {
            const base = monthCols[m]
            const v = c.months[m] || {}
            row[base] = v.매출 == null ? '' : String(v.매출)
            row[base + 1] = v.수금 == null ? '' : String(v.수금)
            row[base + 2] = v.잔액 == null ? '' : String(v.잔액)
        })
        if (withDelay && c.delay) row[delayCol] = c.delay
        aoa[4 + i] = row
    })

    // 합계행도 넣어 제외되는지 본다
    const totalRow = []
    totalRow[1] = '합계'
    months.forEach((m) => { totalRow[monthCols[m] + 2] = '999999999' })
    aoa[4 + clients.length] = totalRow

    return { aoa, merges }
}

const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']

test('월 열 위치를 헤더에서 찾는다 (하드코딩 아님)', () => {
    const sheet = buildSheet(MONTHS, [])
    const { monthCols, months, delayCol } = findColumns(sheet)

    assert.deepEqual(months, MONTHS)
    assert.deepEqual(monthCols['2026-01'], { 매출: 2, 수금: 3, 잔액: 4 })
    assert.deepEqual(monthCols['2026-03'], { 매출: 8, 수금: 9, 잔액: 10 })
    assert.equal(delayCol, 20)
})

test('합계행은 데이터에서 제외한다', () => {
    const sheet = buildSheet(MONTHS, [{ name: '가나상사', months: {} }])
    const rows = dataRows(sheet.aoa)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].name, '가나상사')
})

test('기준월은 잔액이 채워진 마지막 달이다 (뒤쪽 빈 열을 집지 않는다)', () => {
    // 06월 열은 있지만 값이 비어 있다
    const sheet = buildSheet(MONTHS, [{
        name: '가나상사',
        months: { '2026-04': { 매출: 100, 수금: 100, 잔액: 100 }, '2026-05': { 매출: 200, 수금: 100, 잔액: 200 } }
    }])
    const { monthCols, months } = findColumns(sheet)
    assert.equal(findBaseMonth({ months, monthCols, rows: dataRows(sheet.aoa) }), '2026-05')
})

test('익월 결제가 지켜지면 연체가 아니다 (수금=전월매출, 잔액=당월매출)', () => {
    const sheet = buildSheet(MONTHS, [{
        name: '바커케미칼',
        months: {
            '2026-03': { 매출: 196020000, 수금: 183975000, 잔액: 196020000 },
            '2026-04': { 매출: 240926400, 수금: 196020000, 잔액: 240926400 },
            '2026-05': { 매출: 222393600, 수금: 240926400, 잔액: 222393600 }
        }
    }])
    const { baseMonth, rows } = parseReceivablesLedger(sheet)

    assert.equal(baseMonth, '2026-05')
    assert.equal(rows[0].aging, 0, '당월분만 남았으므로 정상')
    assert.equal(rows[0].overdue, 0, '연체금액이 없어야 한다')
    assert.equal(rows[0].balance, 222393600)
})

test('당월 매출을 넘어선 잔액만 연체금액이다', () => {
    const sheet = buildSheet(MONTHS, [{
        name: '한솔케미칼',
        months: {
            '2026-04': { 매출: 60000000, 수금: 0, 잔액: 60000000 },
            '2026-05': { 매출: 24393600, 수금: 0, 잔액: 134164800 }
        }
    }])
    const { rows } = parseReceivablesLedger(sheet)

    assert.equal(rows[0].balance, 134164800)
    // 잔액 - 당월매출 = 134,164,800 - 24,393,600
    assert.equal(rows[0].overdue, 109771200)
    assert.equal(rows[0].aging, 1, '전월 매출까지 미수')
    assert.equal(rows[0].oldest, '2026-04')
})

test('오래 밀린 곳은 경과월이 크게 나온다', () => {
    const sheet = buildSheet(MONTHS, [{
        name: '금잔디상사',
        months: {
            '2026-01': { 매출: 4201200, 수금: 0, 잔액: 4201200 },
            '2026-05': { 매출: 0, 수금: 0, 잔액: 4201200 }
        }
    }])
    const { rows } = parseReceivablesLedger(sheet)

    assert.equal(rows[0].aging, 4, '2026-01 매출이 아직 미수 -> 4개월 경과')
    assert.equal(rows[0].oldest, '2026-01')
    assert.equal(rows[0].overdue, 4201200, '당월 매출이 0이므로 전액 연체')
})

test('잔액이 0이면 목록에서 빠진다 (지연 메모가 있으면 남긴다)', () => {
    const sheet = buildSheet(MONTHS, [
        { name: '정상상사', months: { '2026-05': { 매출: 1000, 수금: 1000, 잔액: 0 } } },
        { name: '메모상사', months: { '2026-05': { 매출: 1000, 수금: 1000, 잔액: 0 } }, delay: '6월 입금' },
        { name: '잔액상사', months: { '2026-05': { 매출: 5000, 수금: 0, 잔액: 5000 } } }
    ])
    const { rows } = parseReceivablesLedger(sheet)

    const names = rows.map((r) => r.name).sort()
    assert.deepEqual(names, ['메모상사', '잔액상사'])
})

test('지연 메모를 읽어 함께 돌려준다', () => {
    const sheet = buildSheet(MONTHS, [{
        name: '인터코스코리아',
        months: { '2026-04': { 매출: 12276000, 수금: 0, 잔액: 12276000 }, '2026-05': { 매출: 0, 수금: 0, 잔액: 12276000 } },
        delay: '2개월'
    }])
    const { rows } = parseReceivablesLedger(sheet)
    assert.equal(rows[0].delay, '2개월')
})

test('월별 매출 합계를 뽑는다 (CRM 대조용)', () => {
    const sheet = buildSheet(MONTHS, [
        { name: 'A상사', months: { '2026-04': { 매출: 1000, 잔액: 1000 }, '2026-05': { 매출: 2000, 잔액: 2000 } } },
        { name: 'B상사', months: { '2026-04': { 매출: 3000, 잔액: 3000 }, '2026-05': { 매출: 4000, 잔액: 4000 } } }
    ])
    const { salesByMonth } = parseReceivablesLedger(sheet)
    assert.equal(salesByMonth['2026-04'], 4000)
    assert.equal(salesByMonth['2026-05'], 6000)
})

test('콤마·괄호가 섞인 금액을 읽는다', () => {
    assert.equal(toNumber('1,234,000'), 1234000)
    assert.equal(toNumber(''), 0)
    assert.equal(toNumber('-'), 0)
    assert.equal(toNumber(5000), 5000)
})

test('구간 이름', () => {
    assert.equal(agingBucket(0), '정상(당월분)')
    assert.equal(agingBucket(1), '1개월')
    assert.equal(agingBucket(2), '2개월')
    assert.equal(agingBucket(7), '3개월 이상')
})

test('빈 대장은 기준월 없이 조용히 끝난다', () => {
    const sheet = buildSheet(MONTHS, [])
    const r = parseReceivablesLedger(sheet)
    assert.equal(r.baseMonth, null)
    assert.deepEqual(r.rows, [])
})


/* ---------------------------------------------------------------------------
   대장이 낡았는지 — 갱신을 요청할 시점

   대장은 **월 스냅샷**이다. 한 달이 끝나야 그 달 자료가 나오므로 8월에 최신이
   7월인 것은 정상이다. 그보다 벌어지면 이미 갚은 곳이 아직 밀린 것처럼 보이고
   새로 밀린 곳은 아예 안 보인다 — 그런 숫자를 '참고'라며 보여주면 그걸 근거로
   전화를 걸게 된다.
--------------------------------------------------------------------------- */
const AT = (iso) => new Date(iso)

test('이번 달·지난달 대장은 정상이다 (갱신 요청 안 함)', () => {
    assert.equal(ledgerAge('2026-08', AT('2026-08-22')).stale, false)
    assert.equal(ledgerAge('2026-07', AT('2026-08-22')).stale, false)
    assert.equal(ledgerAge('2026-07', AT('2026-08-01')).stale, false)
})

test('두 달 이상 벌어지면 갱신을 요청한다', () => {
    assert.equal(ledgerAge('2026-06', AT('2026-08-22')).stale, true)
    assert.equal(ledgerAge('2026-05', AT('2026-08-22')).monthsBehind, 3)
    assert.equal(ledgerAge('2026-05', AT('2026-08-22')).stale, true)
})

test('연말을 넘어가도 개월 수를 맞게 센다', () => {
    // 2025-12 대장을 2026-01에 보는 것은 지난달 자료다 (13개월이 아니다)
    assert.equal(ledgerAge('2025-12', AT('2026-01-05')).monthsBehind, 1)
    assert.equal(ledgerAge('2025-12', AT('2026-01-05')).stale, false)
    assert.equal(ledgerAge('2025-11', AT('2026-01-05')).stale, true)
})

test('기준월이 없거나 형식이 이상하면 낡은 것으로 본다', () => {
    for (const bad of [null, undefined, '', '2026', '26-05', 'x']) {
        assert.equal(ledgerAge(bad, AT('2026-08-22')).stale, true)
    }
})

test('최신 대장을 올리면 다시 정상으로 돌아온다', () => {
    // 사용자가 8월 대장을 올린 직후
    const before = ledgerAge('2026-05', AT('2026-08-22'))
    const after = ledgerAge('2026-08', AT('2026-08-22'))
    assert.equal(before.stale, true)
    assert.equal(after.stale, false)
    assert.equal(after.monthsBehind, 0)
})

/* 요약 계산 — 화면과 KPI가 같은 함수를 쓴다 */
test('제외된 건은 합계·연체 건수에서 모두 빠진다', () => {
    const rows = [
        { balance: 1000, overdue_amount: 500, aging_months: 2, excluded: false },
        { balance: 9999, overdue_amount: 9999, aging_months: 5, excluded: true },
        { balance: 300, overdue_amount: 0, aging_months: 0 },
    ]
    const s = summarizeReceivables(rows)
    assert.equal(s.total, 1300)          // 제외분 9999는 빠진다
    assert.equal(s.overdueCount, 1)
    assert.equal(s.overdueAmount, 500)
    assert.equal(s.m3, 0)                // 제외분의 5개월도 세지 않는다
})

test('총 미수금은 음수(선수금)까지 더한다 — 대장 합계행과 맞아야 한다', () => {
    const s = summarizeReceivables([
        { balance: 1000, overdue_amount: 0, aging_months: 0 },
        { balance: -400, overdue_amount: 0, aging_months: 0 },
    ])
    assert.equal(s.total, 600)
    assert.equal(s.clients, 1)           // 잔액이 있는 곳은 1곳
})
