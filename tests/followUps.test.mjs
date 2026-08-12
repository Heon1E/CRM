/**
 * 후속조치 판정 테스트
 * 실행: npm run test:unit
 *
 * 핵심 요구사항:
 *   1) 기한일 이후에 접촉했으면 처리된 것으로 본다 (별도 완료 체크 없음)
 *   2) 기한이 지났는데 접촉이 없으면 '지남'으로 잡힌다
 *   3) 앞으로 며칠까지만 보여준다 (먼 미래는 오늘 할 일이 아니다)
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { openFollowUps, ymd } from '../src/utils/followUps.js'

const C1 = 'c-1', C2 = 'c-2'
const names = new Map([[C1, '가나상사'], [C2, '다라산업']])
const TODAY = '2026-08-10'

/** 활동 한 건 */
const act = (id, date, next, detail = '') => ({
    id: `${id}-${date}`, client_id: id, activity_date: date,
    next_action_date: next, next_action_detail: detail,
})

test('기한이 오늘이면 오늘 할 일로 잡힌다', () => {
    const r = openFollowUps([act(C1, '2026-08-01', '2026-08-10', '견적 회신 확인')], { today: TODAY, names })
    assert.equal(r.today.length, 1)
    assert.equal(r.today[0].clientName, '가나상사')
    assert.equal(r.today[0].detail, '견적 회신 확인')
    assert.equal(r.overdue.length, 0)
})

test('기한이 지났는데 접촉이 없으면 지남으로 잡힌다', () => {
    const r = openFollowUps([act(C1, '2026-07-01', '2026-07-20')], { today: TODAY, names })
    assert.equal(r.overdue.length, 1)
    assert.equal(r.overdue[0].daysLate, 21)
})

test('기한일 이후에 접촉했으면 처리된 것으로 본다', () => {
    const r = openFollowUps([
        act(C1, '2026-07-01', '2026-07-20'),
        act(C1, '2026-07-25', ''),          // 기한 뒤에 다시 만남 -> 처리됨
    ], { today: TODAY, names })
    assert.equal(r.overdue.length, 0)
    assert.equal(r.today.length, 0)
})

test('기한일 당일 접촉도 처리로 본다', () => {
    const r = openFollowUps([
        act(C1, '2026-07-01', '2026-07-20'),
        act(C1, '2026-07-20', ''),
    ], { today: TODAY, names })
    assert.equal(r.overdue.length, 0)
})

test('기한 전에 만난 것은 처리로 보지 않는다', () => {
    // 7/10에 만났지만 후속조치 기한은 7/20이다. 아직 할 일이 남았다.
    const r = openFollowUps([
        act(C1, '2026-07-01', '2026-07-20'),
        act(C1, '2026-07-10', ''),
    ], { today: TODAY, names })
    assert.equal(r.overdue.length, 1)
})

test('다른 거래처의 접촉은 영향을 주지 않는다', () => {
    const r = openFollowUps([
        act(C1, '2026-07-01', '2026-07-20'),
        act(C2, '2026-07-25', ''),
    ], { today: TODAY, names })
    assert.equal(r.overdue.length, 1)
    assert.equal(r.overdue[0].clientName, '가나상사')
})

test('앞으로 7일 안의 것만 예정으로 보여준다', () => {
    const r = openFollowUps([
        act(C1, '2026-08-01', '2026-08-14'),   // 4일 뒤 -> 예정
        act(C2, '2026-08-01', '2026-09-30'),   // 한참 뒤 -> 제외
    ], { today: TODAY, names })
    assert.equal(r.upcoming.length, 1)
    assert.equal(r.upcoming[0].due, '2026-08-14')
})

test('다음 조치일이 없으면 대상이 아니다', () => {
    const r = openFollowUps([act(C1, '2026-08-01', '')], { today: TODAY, names })
    assert.equal(r.overdue.length + r.today.length + r.upcoming.length, 0)
})

test('오래 밀린 것부터 나온다', () => {
    const r = openFollowUps([
        act(C1, '2026-06-01', '2026-07-20'),
        act(C2, '2026-05-01', '2026-06-10'),
    ], { today: TODAY, names })
    assert.deepEqual(r.overdue.map((x) => x.due), ['2026-06-10', '2026-07-20'])
})

test('ymd는 로컬 기준으로 만든다 (UTC로 하루 밀리지 않는다)', () => {
    // 자정 직후 로컬 시각
    const d = new Date(2026, 7, 10, 0, 30)
    assert.equal(ymd(d), '2026-08-10')
})
