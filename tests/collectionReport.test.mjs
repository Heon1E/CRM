import test from 'node:test'
import assert from 'node:assert/strict'
import {
    num, monthKey, normalizeClient, findBaseMonth, verifyReport, summarizeClients,
} from '../src/utils/collectionReport.js'

/*
 * 숫자는 전부 실제 「영업사원 거래처별 매출/수금 실적표」(이헌일, 2026년)에서
 * 옮겼다. 사진 판독은 반드시 틀리므로, 표가 스스로 갖고 있는 관계로 검산한다.
 */

const Y = 2026
const k = (m) => monthKey(Y, m)

/** 중부산업(주) — 페이지 5/6. 12달이 다 차 있어 검산 예제로 좋다. */
const 중부산업 = normalizeClient({
    clientName: '중부산업(주)', code: 'I02500', phone: '031-356-8551',
    months: {
        1: { carried: 2684000, sales: 5368000, collected: 2684000, balance: 5368000 },
        2: { carried: 5368000, sales: 2684000, collected: 5368000, balance: 2684000 },
        3: { carried: 2684000, sales: 12760000, collected: 2684000, balance: 12760000 },
        4: { carried: 12760000, sales: 7876000, collected: 12760000, balance: 7876000 },
        5: { carried: 7876000, sales: 3322000, collected: 7876000, balance: 3322000 },
        6: { carried: 3322000, sales: 14410000, collected: 3322000, balance: 14410000 },
        7: { carried: 14410000, sales: 7068600, collected: 0, balance: 21478600 },
        8: { carried: 21478600, sales: 10945000, collected: 21478600, balance: 10945000 },
        9: { carried: 10945000, sales: 0, collected: 0, balance: 10945000 },
        10: { carried: 10945000, sales: 0, collected: 0, balance: 10945000 },
        11: { carried: 10945000, sales: 0, collected: 0, balance: 10945000 },
        12: { carried: 10945000, sales: 0, collected: 0, balance: 10945000 },
    },
}, Y)

test('빈칸은 0이고, 콤마와 음수를 읽는다', () => {
    assert.equal(num(''), 0)
    assert.equal(num(null), 0)
    assert.equal(num('1,127,500'), 1127500)
    assert.equal(num('-1,729,200'), -1729200)   // 신성소재(주) 5월 이월이 실제로 음수다
})

test('달마다 이월 + 매출 − 수금 = 잔액 이 맞으면 문제 없음', () => {
    const r = verifyReport({ clients: [중부산업], year: Y })
    assert.deepEqual(r.problems, [])
    assert.equal(r.ok, true)
})

test('기준월은 매출·수금이 실제로 있었던 마지막 달이다 (9~12월은 이월만 딸려온다)', () => {
    // 9~12월에도 잔액 10,945,000 이 그대로 있지만 거래는 8월이 마지막이다.
    assert.equal(findBaseMonth([중부산업], Y), k(8))
})

test('잔액을 잘못 읽으면 그 거래처 그 달을 짚어낸다', () => {
    const 틀린것 = JSON.parse(JSON.stringify(중부산업))
    // 8월 잔액에 매출(10,945,000) 대신 이월(21,478,600)을 집어 온 경우
    틀린것.months[k(8)].balance = 21478600
    const r = verifyReport({ clients: [틀린것], year: Y })
    assert.equal(r.ok, false)
    const p = r.problems.find((x) => x.kind === 'identity')
    assert.ok(p, '항등식 위반을 잡아야 한다')
    assert.equal(p.month, k(8))
    assert.equal(p.clientName, '중부산업(주)')
})

test('다음 달 이월이 이번 달 잔액과 다르면 잡아낸다', () => {
    const 틀린것 = JSON.parse(JSON.stringify(중부산업))
    틀린것.months[k(9)].carried = 10945999      // 끝자리를 잘못 읽음
    틀린것.months[k(9)].balance = 10945999
    const r = verifyReport({ clients: [틀린것], year: Y })
    assert.ok(r.problems.some((x) => x.kind === 'chain' && x.month === k(9)))
})

test('거래가 끝나 뒷달이 통째로 비면 이월이 0인 것은 정상이다', () => {
    // 행운화학 — 7월에만 매출·수금이 있고 잔액 0, 이후 전부 빈칸
    const 행운화학 = normalizeClient({
        clientName: '행운화학',
        months: { 7: { carried: 0, sales: 1111000, collected: 1111000, balance: 0 } },
    }, Y)
    const r = verifyReport({ clients: [행운화학], year: Y })
    assert.deepEqual(r.problems, [])
})

test('잔액 합계가 안 맞으면 얼마나 차이 나는지 말한다', () => {
    const r = verifyReport({
        clients: [중부산업], year: Y,
        repTotal: { balance: 306500260 },   // 사원별 잔액 합계
    })
    const p = r.problems.find((x) => x.kind === 'total')
    assert.ok(p)
    assert.equal(r.totals.balanceSum, 10945000)
    assert.equal(r.totals.reported, 306500260)
    assert.equal(r.totals.diff, 10945000 - 306500260)
})

test('한 곳만 있고 합계가 그 값과 같으면 통과한다', () => {
    const r = verifyReport({ clients: [중부산업], year: Y, repTotal: { balance: 10945000 } })
    assert.equal(r.ok, true)
    assert.equal(r.totals.diff, 0)
})

test('경과월은 대장과 같은 함수로 낸다 — 익월 결제는 연체가 아니다', () => {
    // 중부산업 8월: 잔액 10,945,000 = 당월 매출 10,945,000 -> 경과 0, 연체 0
    const [row] = summarizeClients({ clients: [중부산업], year: Y, baseMonth: k(8) })
    assert.equal(row.balance, 10945000)
    assert.equal(row.aging, 0)
    assert.equal(row.overdue, 0)
})

test('당월 매출을 넘어선 잔액은 연체로 잡힌다', () => {
    // (주)이한산업 — 8월 잔액 53,512,800 인데 8월 매출은 21,546,800 이다
    const 이한산업 = normalizeClient({
        clientName: '(주)이한산업', code: 'I01912',
        months: {
            1: { carried: 5280000, sales: 13860000, collected: 5280000, balance: 13860000 },
            2: { carried: 13860000, sales: 15840000, collected: 13860000, balance: 15840000 },
            3: { carried: 15840000, sales: 12760000, collected: 0, balance: 28600000 },
            4: { carried: 28600000, sales: 27412000, collected: 0, balance: 56012000 },
            5: { carried: 56012000, sales: 11088000, collected: 27412000, balance: 39688000 },
            6: { carried: 39688000, sales: 31966000, collected: 39688000, balance: 31966000 },
            7: { carried: 31966000, sales: 18824300, collected: 0, balance: 50790300 },
            8: { carried: 50790300, sales: 21546800, collected: 18824300, balance: 53512800 },
        },
    }, Y)
    const v = verifyReport({ clients: [이한산업], year: Y })
    assert.deepEqual(v.problems, [], '표에서 옮긴 값이라 검산을 통과해야 한다')

    const [row] = summarizeClients({ clients: [이한산업], year: Y, baseMonth: k(8) })
    assert.equal(row.balance, 53512800)
    assert.equal(row.overdue, 53512800 - 21546800)   // 당월분을 넘어선 몫
    assert.ok(row.aging >= 1, '한 달 이상 밀린 것으로 잡혀야 한다')
})

test('여러 거래처의 기준월 잔액 합이 표의 잔액 합계와 맞으면 통과', () => {
    const a = normalizeClient({ clientName: 'ㄱ', months: { 8: { carried: 0, sales: 100, collected: 0, balance: 100 } } }, Y)
    const b = normalizeClient({ clientName: 'ㄴ', months: { 8: { carried: 0, sales: 250, collected: 0, balance: 250 } } }, Y)
    const r = verifyReport({ clients: [a, b], year: Y, repTotal: { balance: 350 } })
    assert.equal(r.ok, true)
})

test('한글 칸 이름으로 와도 읽는다', () => {
    const c = normalizeClient({
        clientName: '행운화학',
        months: { 7: { 이월: 0, 매출: 1111000, 수금: 1111000, 잔액: 0 } },
    }, Y)
    assert.equal(c.months[k(7)].sales, 1111000)
    assert.equal(c.months[k(7)].collected, 1111000)
})
