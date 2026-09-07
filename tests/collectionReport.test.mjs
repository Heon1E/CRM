import test from 'node:test'
import assert from 'node:assert/strict'
import {
    num, monthKey, normalizeClient, findBaseMonth, verifyReport, summarizeClients,
    suggestFix, closestNames, checkNames,
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

/* ── 틀린 칸 되찾기 ─────────────────────────────────────────────── */

test('잔액을 매출로 잘못 읽으면 표의 계산이 원래 값을 가리킨다', () => {
    // 실제 오독: (주)이한산업 8월 잔액 53,512,800 을 그 달 매출 21,546,800 으로 집었다
    const c = normalizeClient({
        clientName: '(주)이한산업',
        months: {
            7: { carried: 31966000, sales: 18824300, collected: 0, balance: 50790300 },
            8: { carried: 50790300, sales: 21546800, collected: 18824300, balance: 21546800 },
            9: { carried: 53512800, sales: 0, collected: 0, balance: 53512800 },
        },
    }, Y)
    const [top] = suggestFix({ client: c, month: k(8), year: Y })
    assert.equal(top.field, 'balance')
    assert.equal(top.value, 53512800)
    assert.equal(top.confidence, 'high', '항등식과 9월 이월이 같은 값을 가리키므로 확실하다')
})

test('고친 값을 넣으면 검산을 통과한다', () => {
    const c = normalizeClient({
        clientName: '(주)이한산업',
        months: {
            7: { carried: 31966000, sales: 18824300, collected: 0, balance: 50790300 },
            8: { carried: 50790300, sales: 21546800, collected: 18824300, balance: 21546800 },
        },
    }, Y)
    assert.equal(verifyReport({ clients: [c], year: Y }).ok, false)
    c.months[k(8)].balance = 53512800
    assert.equal(verifyReport({ clients: [c], year: Y }).ok, true)
})

test('이월을 잘못 읽으면 전달 잔액을 후보로 준다', () => {
    const c = normalizeClient({
        clientName: 'ㄱ상사',
        months: {
            3: { carried: 0, sales: 1000, collected: 0, balance: 1000 },
            4: { carried: 100, sales: 500, collected: 0, balance: 1500 },   // 이월이 1000이어야 한다
        },
    }, Y)
    const s = suggestFix({ client: c, month: k(4), year: Y })
    const carried = s.find((x) => x.field === 'carried')
    assert.ok(carried)
    assert.equal(carried.value, 1000)
    assert.equal(carried.confidence, 'high', '넣으면 항등식까지 맞으므로 확실하다')
})

test('성한 달에는 고칠 것을 내놓지 않는다', () => {
    assert.deepEqual(suggestFix({ client: 중부산업, month: k(8), year: Y }), [])
})

/* ── 이름 오독 ─────────────────────────────────────────────────── */

test('한두 글자 어긋난 이름의 원래 거래처를 찾아 준다', () => {
    const all = ['주식회사 수산머티리얼즈', '현대드럼산업(주)', '강원드림상사', '(주)이한산업']
    assert.ok(closestNames('수산아타리얼즈', all).includes('주식회사 수산머티리얼즈'))
    assert.ok(closestNames('창원드럼산업', all).includes('현대드럼산업(주)'))
    assert.ok(closestNames('강원드럼상사', all).includes('강원드림상사'))
})

test('전혀 다른 이름에는 아무것도 권하지 않는다', () => {
    assert.deepEqual(closestNames('평화산업개발', ['주식회사 수산머티리얼즈', '현대드럼산업(주)']), [])
})

test('CRM에 없는 이름만 골라 낸다 — 검산으로는 못 잡는 오독이다', () => {
    const all = ['현대드럼산업(주)', '(주)이한산업']
    const clients = [
        normalizeClient({ clientName: '(주)이한산업', months: {} }, Y),
        normalizeClient({ clientName: '창원드럼산업', months: {} }, Y),
    ]
    const lookup = (n) => all.find((x) => x === n)
    const un = checkNames({ clients, lookup, allNames: all })
    assert.equal(un.length, 1)
    assert.equal(un[0].clientName, '창원드럼산업')
    assert.ok(un[0].suggestions.includes('현대드럼산업(주)'))
})

test('잔액이 옆 달과 이어져 있으면 잔액이 아니라 수금을 고치라고 한다', () => {
    // 실측: 7월 수금이 빈칸인데 판독이 8월 수금(21,478,600)을 당겨 왔다.
    // 항등식만 보면 "잔액을 0으로"가 되지만 잔액은 8월 이월과 이어져 맞다.
    const c = normalizeClient({
        clientName: '중부산업(주)',
        months: {
            6: { carried: 3322000, sales: 14410000, collected: 3322000, balance: 14410000 },
            7: { carried: 14410000, sales: 7068600, collected: 21478600, balance: 21478600 },
            8: { carried: 21478600, sales: 10945000, collected: 21478600, balance: 10945000 },
        },
    }, Y)
    const s = suggestFix({ client: c, month: k(7), year: Y })
    assert.equal(s[0].field, 'collected', '수금을 먼저 권해야 한다')
    assert.equal(s[0].value, 0, '7월 수금은 0이 맞다')
    assert.equal(s[0].confidence, 'high')
    assert.ok(!s.some((x) => x.field === 'balance'), '잔액 고치기는 권하지 않는다')
})

test('쉼표로 이은 12개 문자열도 읽는다', () => {
    const c = normalizeClient({
        clientName: 'ㄱ상사',
        carried: '0,0,0,0,0,0,0,0,0,0,0,0',
        sales: '1000,0,0,0,0,0,0,0,0,0,0,0',
        collected: '0,0,0,0,0,0,0,0,0,0,0,0',
        balance: '1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000',
    }, Y)
    assert.equal(c.months[k(1)].sales, 1000)
    assert.equal(c.months[k(12)].balance, 1000)
})

test('아직 오지 않은 달이 기준월로 잡히면 잡아낸다', () => {
    // 판독이 밀리면 12월에 활동이 생겨 기준월이 미래가 된다.
    // 그때도 잔액 합계는 맞을 수 있다(잔액은 이월로 계속 딸려오니까).
    const c = normalizeClient({
        clientName: 'ㄴ상사',
        months: { 12: { carried: 0, sales: 500, collected: 0, balance: 500 } },
    }, Y)
    const v = verifyReport({ clients: [c], year: Y, now: new Date('2026-09-07T00:00:00Z') })
    assert.ok(v.problems.some((x) => x.kind === 'future'))
})
