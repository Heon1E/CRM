import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

/*
 * `updateActivity(id, patch)` 는 **넘긴 것으로 행을 다시 짓고 있었다.**
 * 그래서 `{ next_action_date: null }` 하나만 넘기면 거래처·날짜·유형·내용이
 * 전부 빈 값으로 덮여 활동이 통째로 지워졌다. 지금까지는 수정 모달만
 * 이 함수를 불렀고 그쪽은 폼 전체를 넘겨서 드러나지 않았을 뿐이다.
 *
 * 달력의 '하기로 한 것' 처리가 부분 갱신을 처음으로 쓴다. 그 자리에서
 * 기록이 날아가면 되돌릴 수 없으므로 여기서 고정한다.
 *
 * DataContext는 React 훅이라 그대로 import할 수 없어, 파일에 적힌 그 로직을
 * 꺼내 돌린다 — 베껴 적으면 실제와 달라진다.
 */
const src = fs.readFileSync(new URL('../src/contexts/DataContext.jsx', import.meta.url), 'utf8')
const i0 = src.indexOf('const prevRow = activities.find')
const i1 = src.indexOf('// DB에 없는 필드 제거', i0)
assert.ok(i0 > 0 && i1 > i0, 'updateActivity의 병합 로직을 찾지 못했습니다')
const buildRow = new Function('activities', 'id', 'activityData', src.slice(i0, i1) + '\nreturn data')

const EXISTING = {
    id: 'A', client_id: 'C1', clientId: 'C1',
    activity_date: '2026-08-21', date: '2026-08-21',
    type: '전화', description: '용기 문의 건으로 통화. 200개, 24만원.', status: '완료',
    next_action_date: '2026-08-24', next_action_detail: '견적서 발송',
}
const patch = (p) => buildRow([EXISTING], 'A', p)

test('후속조치만 지워도 활동 내용이 남는다', () => {
    const r = patch({ next_action_date: null, next_action_detail: '' })
    assert.equal(r.description, EXISTING.description)
    assert.equal(r.client_id, 'C1')
    assert.equal(r.activity_date, '2026-08-21')
    assert.equal(r.type, '전화')
    assert.equal(r.next_action_date, null)
    assert.equal(r.next_action_detail, '')
})

test('기한만 미뤄도 나머지가 남는다', () => {
    const r = patch({ next_action_date: '2026-08-25' })
    assert.equal(r.next_action_date, '2026-08-25')
    assert.equal(r.next_action_detail, '견적서 발송')
    assert.equal(r.description, EXISTING.description)
    assert.equal(r.type, '전화')
})

test('폼 전체를 넘기던 기존 호출은 그대로 동작한다', () => {
    const r = patch({
        clientId: 'C2', activity_date: '2026-08-22', type: '미팅',
        description: '바뀐 내용', status: '완료',
        next_action_date: null, next_action_detail: '',
    })
    assert.equal(r.client_id, 'C2')
    assert.equal(r.activity_date, '2026-08-22')
    assert.equal(r.type, '미팅')
    assert.equal(r.description, '바뀐 내용')
    assert.equal(r.next_action_date, null)
})

test('빈 문자열로 내용을 지우는 것은 지워진다 (보존이 아니다)', () => {
    // 사용자가 일부러 비운 것과 '안 넘긴 것'은 다르다
    const r = patch({ description: '' })
    assert.equal(r.description, '')
    assert.equal(r.type, '전화')
})

test('없는 활동을 고쳐도 터지지 않는다', () => {
    const r = buildRow([], 'ZZZ', { next_action_date: null })
    assert.equal(r.next_action_date, null)
    assert.equal(r.description, '')
})
