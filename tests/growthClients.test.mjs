/**
 * 대시보드 '빠르게 크는 거래처' 회귀 테스트 (2026-10-20 화면에 `+-60%`가 떴다)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { growthWindows, computeGrowthClients, growthLabel } from '../src/utils/growthClients.js'

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const S = (client_id, sale_date, total_amount) => ({ client_id, sale_date, total_amount })
const CLIENTS = [{ id: 'a', company: '가' }, { id: 'b', company: '나' }, { id: 'c', company: '다' }, { id: 'd', company: '라' }]

test('월중에는 같은 날수끼리 비교한다 (이번 달 1~20일 vs 지난달 1~20일)', () => {
    const w = growthWindows(new Date(2026, 9, 20, 15))
    assert.equal(w.basis, 'sameDays')
    assert.deepEqual([ymd(w.target[0]), ymd(w.target[1])], ['2026-10-01', '2026-10-20'])
    assert.deepEqual([ymd(w.comparison[0]), ymd(w.comparison[1])], ['2026-09-01', '2026-09-20'])
})

test('지난달이 짧으면 지난달 끝까지만 (3/31 → 2/1~2/28)', () => {
    const w = growthWindows(new Date(2026, 2, 31))
    assert.deepEqual([ymd(w.comparison[0]), ymd(w.comparison[1])], ['2026-02-01', '2026-02-28'])
})

test('1~5일은 지난달 전체 vs 그 전달 전체 (연초 경계 포함)', () => {
    const w = growthWindows(new Date(2026, 0, 3))
    assert.equal(w.basis, 'lastFullMonth')
    assert.deepEqual([ymd(w.target[0]), ymd(w.target[1])], ['2025-12-01', '2025-12-31'])
    assert.deepEqual([ymd(w.comparison[0]), ymd(w.comparison[1])], ['2025-11-01', '2025-11-30'])
})

test('지난달 21일 이후 매출은 비교에 넣지 않는다 — 그래서 월중에 다 줄어 보이지 않는다', () => {
    const out = computeGrowthClients({
        now: new Date(2026, 9, 20),
        clients: CLIENTS,
        sales: [S('a', '2026-09-10', 100), S('a', '2026-09-28', 900), S('a', '2026-10-05', 150)],
    })
    assert.equal(out.length, 1)
    assert.equal(Math.round(out[0].growthRate), 50)   // 150 vs 100 (9/28의 900은 빠진다)
})

test('줄어든 곳은 목록에 넣지 않는다 (예전 +-60%)', () => {
    const out = computeGrowthClients({
        now: new Date(2026, 9, 20),
        clients: CLIENTS,
        sales: [S('a', '2026-09-10', 1000), S('a', '2026-10-10', 400), S('b', '2026-09-10', 100), S('b', '2026-10-10', 300)],
    })
    assert.deepEqual(out.map((c) => c.name), ['나'])
})

test('성장률 높은 곳이 먼저, "첫 거래"는 그 뒤, 다시 산 곳(주기)은 뺀다', () => {
    const out = computeGrowthClients({
        now: new Date(2026, 9, 20),
        clients: CLIENTS,
        sales: [
            S('a', '2026-10-02', 500),                              // 첫 거래
            S('b', '2026-07-01', 100), S('b', '2026-10-02', 800),   // 7월 이후 처음 — 주기, 뺀다
            S('c', '2026-09-02', 100), S('c', '2026-10-02', 200),   // +100%
            S('d', '2026-09-02', 100), S('d', '2026-10-02', 400),   // +300%
        ],
    })
    assert.deepEqual(out.map((c) => [c.name, growthLabel(c)]), [['라', '+300%'], ['다', '+100%'], ['가', '첫 거래']])
})

test('표시는 부호를 숫자에서 가져온다 — "+" 를 박아 두지 않는다', () => {
    assert.equal(growthLabel({ kind: 'growth', growthRate: 12.6 }), '+13%')
    assert.equal(growthLabel({ kind: 'growth', growthRate: 1234.4 }), '+1,234%')
    assert.equal(growthLabel({ kind: 'growth', growthRate: -60 }), '-60%')
    assert.equal(growthLabel({ kind: 'new', growthRate: null }), '첫 거래')
})

test('거래처가 없는 매출과 날짜가 깨진 매출은 건너뛴다', () => {
    const out = computeGrowthClients({
        now: new Date(2026, 9, 20),
        clients: CLIENTS,
        sales: [S(null, '2026-10-02', 999), S('a', 'not-a-date', 999)],
    })
    assert.deepEqual(out, [])
})

// 마지막 칸은 첫 거래 몫 (사용자 결정 2026-10-20) — 성장한 곳만으로 칸이 다 차서 첫 거래가 안 보였다
const many = () => [
    ...['a', 'b', 'c'].flatMap((id, i) => [S(id, '2026-09-02', 100), S(id, '2026-10-02', 200 + i * 100)]), // +100 +200 +300%
    S('n1', '2026-10-03', 50), S('n2', '2026-10-03', 900),                                                  // 첫 거래 둘
]
const CL2 = ['a', 'b', 'c', 'n1', 'n2'].map((id) => ({ id, company: id }))

test('reserveNew: 마지막 칸은 금액이 큰 첫 거래', () => {
    const out = computeGrowthClients({ now: new Date(2026, 9, 20), clients: CL2, sales: many(), limit: 3, reserveNew: 1 })
    assert.deepEqual(out.map((c) => c.name), ['c', 'b', 'n2'])
})

test('reserveNew: 첫 거래가 없으면 그 칸도 성장한 곳이 채운다', () => {
    const sales = many().filter((s) => !s.client_id.startsWith('n'))
    const out = computeGrowthClients({ now: new Date(2026, 9, 20), clients: CL2, sales, limit: 3, reserveNew: 1 })
    assert.deepEqual(out.map((c) => c.name), ['c', 'b', 'a'])
})

test('reserveNew: 성장한 곳이 모자라면 남은 칸은 첫 거래로 채운다 — 빈칸을 두지 않는다', () => {
    const out = computeGrowthClients({ now: new Date(2026, 9, 20), clients: CL2, sales: many(), limit: 8, reserveNew: 1 })
    assert.deepEqual(out.map((c) => c.name), ['c', 'b', 'a', 'n2', 'n1'])
})
