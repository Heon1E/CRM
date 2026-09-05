import test from 'node:test'
import assert from 'node:assert/strict'
import { nextBusinessDay } from '../src/utils/businessDay.js'

/*
 * '하루 미루기'가 주말·공휴일로 가면 그날은 아무 일도 할 수 없다.
 * 실제로 2026-09-05(토)에 눌러 9/6(일)이 나오는 것을 보고 만들었다.
 */

test('금요일에 미루면 월요일이다', () => {
    assert.equal(nextBusinessDay('2026-09-04'), '2026-09-07')   // 금 -> 월
})

test('토요일에 미뤄도 월요일이다', () => {
    assert.equal(nextBusinessDay('2026-09-05'), '2026-09-07')
})

test('일요일에 미뤄도 월요일이다', () => {
    assert.equal(nextBusinessDay('2026-09-06'), '2026-09-07')
})

test('평일은 그냥 다음 날', () => {
    assert.equal(nextBusinessDay('2026-09-07'), '2026-09-08')
})

test('광복절 대체공휴일(2026-08-17 월)을 건너뛴다', () => {
    // 8/15(토) 광복절 -> 8/17(월)이 대체공휴일
    assert.equal(nextBusinessDay('2026-08-14'), '2026-08-18')
})

test('성탄절을 건너뛴다', () => {
    assert.equal(nextBusinessDay('2026-12-24'), '2026-12-28')   // 25 성탄 · 26 토 · 27 일
})

test('연말을 넘어 다음 해로 간다', () => {
    assert.equal(nextBusinessDay('2026-12-31'), '2027-01-04')   // 1/1 신정 · 2 토 · 3 일
})

test('여러 영업일도 센다', () => {
    assert.equal(nextBusinessDay('2026-09-04', 3), '2026-09-09')  // 금 -> 월·화·수
})

test('추석 연휴를 건너뛴다', () => {
    // 2026 추석 9/24~9/26, 9/26은 토요일이라 대체공휴일이 붙는다
    const r = nextBusinessDay('2026-09-23')
    assert.match(r, /^2026-09-(2[89]|30)$/, `추석 뒤 영업일이어야 하는데 ${r}`)
})

test('잘못된 입력은 null', () => {
    assert.equal(nextBusinessDay(''), null)
    assert.equal(nextBusinessDay('2026'), null)
    assert.equal(nextBusinessDay(null), null)
    assert.equal(nextBusinessDay('2026-13-99'), null)
})
