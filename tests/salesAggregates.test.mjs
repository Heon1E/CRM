/**
 * 매출 집계 회귀 테스트
 *
 * 이 계산이 틀리면 상단 카드·KPI·영업 코치가 한꺼번에 틀린다.
 * 특히 '전년 동기'는 같은 달수를 비교해야 한다 — 여기가 어긋나면 매년
 * 실적이 줄어든 것처럼 보인다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    ymKey, yearOf, byMonth, byYear, ytd, ytdLastYear, growth,
    lastMonths, monthlySeries, byClient, activeClientCount,
} from '../src/utils/salesAggregates.js'

const rows = [
    { client_id: 'a', ym: '2025-01-01', amount: 100, last_date: '2025-01-20' },
    { client_id: 'a', ym: '2025-08-01', amount: 200, last_date: '2025-08-11' },
    { client_id: 'a', ym: '2025-12-01', amount: 500, last_date: '2025-12-30' },
    { client_id: 'b', ym: '2026-01-01', amount: 300, last_date: '2026-01-15' },
    { client_id: 'a', ym: '2026-08-01', amount: 400, last_date: '2026-08-14' },
]

test('월 이름표를 뽑는다', () => {
    assert.equal(ymKey('2026-08-01'), '2026-08')
    assert.equal(ymKey('2026-08-01T00:00:00Z'), '2026-08')
    assert.equal(ymKey(null), '')
    assert.equal(yearOf('2026-08'), 2026)
})

test('월별로 더한다', () => {
    assert.deepEqual(byMonth(rows), {
        '2025-01': 100, '2025-08': 200, '2025-12': 500,
        '2026-01': 300, '2026-08': 400,
    })
})

test('연도별로 더한다', () => {
    assert.deepEqual(byYear(rows), { 2025: 800, 2026: 700 })
})

test('올해 누계는 기준월을 포함한다', () => {
    // '올해 누적 매출'은 이번 달까지 판 것을 말한다
    assert.equal(ytd(rows, '2026-08'), 700)
    assert.equal(ytd(rows, '2026-01'), 300)
})

test('전년 동기는 같은 달수만 센다 — 이게 어긋나면 매년 줄어 보인다', () => {
    // 2026-08 기준이면 2025-01~08 (100+200=300). 2025-12의 500은 빼야 한다.
    assert.equal(ytdLastYear(rows, '2026-08'), 300)
    assert.notEqual(ytdLastYear(rows, '2026-08'), 800)
})

test('기준이 0이면 증감률은 없다 (0%가 아니다)', () => {
    assert.equal(growth(100, 0), null)
    assert.equal(growth(100, null), null)
    assert.equal(growth(150, 100), 50)
    assert.equal(growth(50, 100), -50)
})

test('최근 N개월은 해를 넘겨도 이어진다', () => {
    assert.deepEqual(lastMonths('2026-02', 4), ['2025-11', '2025-12', '2026-01', '2026-02'])
})

test('거래가 없던 달도 0으로 채운다 — 빠지면 추이가 왜곡된다', () => {
    const s = monthlySeries(rows, '2026-03', 4)
    assert.deepEqual(s.map((x) => x.ym), ['2025-12', '2026-01', '2026-02', '2026-03'])
    assert.deepEqual(s.map((x) => x.amount), [500, 300, 0, 0])
})

test('거래처별로 접는다', () => {
    const b = byClient(rows)
    assert.equal(b.a.total, 1200)
    assert.equal(b.b.total, 300)
    assert.equal(b.a.lastDate, '2026-08-14')
})

test('거래한 거래처 수 — 금액 0은 세지 않는다', () => {
    assert.equal(activeClientCount(rows), 2)
    assert.equal(activeClientCount(rows, '2026-01'), 2)
    assert.equal(activeClientCount(rows, '2026-08'), 1)
    assert.equal(activeClientCount([{ client_id: 'z', ym: '2026-08-01', amount: 0 }]), 0)
})

test('빈 입력에도 죽지 않는다', () => {
    assert.deepEqual(byMonth(null), {})
    assert.deepEqual(byClient(undefined), {})
    assert.equal(ytd([], '2026-08'), 0)
    assert.equal(activeClientCount(null), 0)
})
