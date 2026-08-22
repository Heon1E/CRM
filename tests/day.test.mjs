/**
 * 날짜 문자열 만들기 — **로컬 기준이어야 한다**
 * 실행: npm run test:unit
 *
 * `toISOString()`은 UTC라 한국(UTC+9)에서 **00:00~08:59 사이에 하루 전 날짜**가
 * 나온다. 하필 영업사원이 어제 방문을 기록하고 오전 주문을 넣는 시간대다.
 *
 * 실제로 이렇게 새고 있었다:
 *   - 매출·활동 추가의 기본 날짜가 아침에 어제로 저장됐다
 *   - 견적서 유효기간이 '2026-08-22 + 30일 = 2026-09-20'으로 하루 짧게 인쇄됐다
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { ymd, addDays } from '../src/utils/day.js'

test('로컬 기준으로 날짜를 만든다 — 오전에도 오늘이다', () => {
    // 오전 8시 30분. toISOString()이었다면 전날이 나온다.
    assert.equal(ymd(new Date(2026, 7, 22, 8, 30)), '2026-08-22')
    assert.equal(ymd(new Date(2026, 7, 22, 0, 0)), '2026-08-22')
    assert.equal(ymd(new Date(2026, 7, 22, 23, 59)), '2026-08-22')
})

test('한 자리 월·일에 0을 채운다', () => {
    assert.equal(ymd(new Date(2026, 0, 3)), '2026-01-03')
    assert.equal(ymd(new Date(2026, 8, 9)), '2026-09-09')
})

test('견적서 유효기간 — 하루 짧아지지 않는다', () => {
    assert.equal(addDays('2026-08-22', 30), '2026-09-21')
    assert.equal(addDays('2026-01-01', 30), '2026-01-31')
})

test('달·해를 넘어가도 맞는다', () => {
    assert.equal(addDays('2026-01-31', 1), '2026-02-01')
    assert.equal(addDays('2026-12-31', 1), '2027-01-01')
    assert.equal(addDays('2026-02-28', 1), '2026-03-01')   // 2026은 평년
    assert.equal(addDays('2028-02-28', 1), '2028-02-29')   // 2028은 윤년
})

test('시각이 붙은 문자열도 날짜만 본다', () => {
    assert.equal(addDays('2026-08-22T15:00:00+09:00', 1), '2026-08-23')
})

test('날짜가 아니면 빈 문자열을 준다 (저장을 막지 않는다)', () => {
    for (const bad of [null, undefined, '', 'x', '2026']) {
        assert.equal(addDays(bad, 30), '')
    }
})
