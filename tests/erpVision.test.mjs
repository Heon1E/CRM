/**
 * ERP 스크린샷 판독 결과 정규화 테스트
 * 실행: npm run test:unit
 *
 * 날짜 형식이 어긋나면 대사(reconcileSales)가 기존 매출을 못 찾아 전부
 * 중복 등록된다 (2026-08-05 사고). 화면 판독은 형식이 엑셀보다 더 제멋대로라
 * 여기서 고정해 둔다.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDate, toNumber } from '../src/services/erpVisionService.js'

test('날짜를 YYYY-MM-DD로 통일한다', () => {
    assert.equal(normalizeDate('20260122'), '2026-01-22')
    assert.equal(normalizeDate('2026-01-22'), '2026-01-22')
    assert.equal(normalizeDate('2026.1.22'), '2026-01-22')
    assert.equal(normalizeDate('2026/01/22'), '2026-01-22')
    assert.equal(normalizeDate('2026년 1월 22일'), '2026-01-22')
})

test('2자리 연도는 20xx로 본다', () => {
    assert.equal(normalizeDate('26.01.22'), '2026-01-22')
    assert.equal(normalizeDate('25-3-9'), '2025-03-09')
})

test('연도가 없으면 지정한 기준 연도를 쓴다', () => {
    assert.equal(normalizeDate('01/22', 2026), '2026-01-22')
    assert.equal(normalizeDate('3-9', 2025), '2025-03-09')
})

test('빈 값은 빈 문자열', () => {
    assert.equal(normalizeDate(''), '')
    assert.equal(normalizeDate(null), '')
    assert.equal(normalizeDate(undefined), '')
})

test('알아볼 수 없는 값은 그대로 두어 화면에서 걸러지게 한다', () => {
    assert.equal(normalizeDate('미상'), '미상')
})

test('금액에서 콤마·통화기호를 걷어낸다', () => {
    assert.equal(toNumber('1,234,000'), 1234000)
    assert.equal(toNumber('1,234,000원'), 1234000)
    assert.equal(toNumber('₩3,000'), 3000)
    assert.equal(toNumber(4500), 4500)
})

test('괄호와 마이너스는 음수로 읽는다', () => {
    assert.equal(toNumber('(1,200)'), -1200)
    assert.equal(toNumber('-1,200'), -1200)
})

test('숫자가 없으면 0', () => {
    assert.equal(toNumber(''), 0)
    assert.equal(toNumber(null), 0)
    assert.equal(toNumber('-'), 0)
    assert.equal(toNumber(NaN), 0)
})
