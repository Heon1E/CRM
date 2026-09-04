import test from 'node:test'
import assert from 'node:assert/strict'
import { parseActivityDescription, mergeActivityDescription } from '../src/utils/activityMerge.js'

test('표시가 없는 옛 기록은 1회로 읽는다', () => {
    const r = parseActivityDescription('[담당자] 박경록\n용기 문의 건으로 통화.')
    assert.equal(r.count, 1)
    assert.deepEqual(r.persons, ['박경록'])
    assert.equal(r.body, '용기 문의 건으로 통화.')
})

test('담당자 줄이 없어도 읽는다', () => {
    const r = parseActivityDescription('그냥 내용만 있다.')
    assert.equal(r.count, 1)
    assert.deepEqual(r.persons, [])
    assert.equal(r.body, '그냥 내용만 있다.')
})

test('횟수 표시를 읽는다', () => {
    const r = parseActivityDescription('[통화 3회]\n[담당자] 김과장\n\n■ 1차\n첫 통화')
    assert.equal(r.count, 3)
    assert.equal(r.label, '통화')
    assert.deepEqual(r.persons, ['김과장'])
    assert.match(r.body, /^■ 1차/)
})

test('두 번째 통화를 합치면 2회가 되고 1차 머리가 붙는다', () => {
    const out = mergeActivityDescription(
        '[담당자] 박경록\n오전에 단가 문의.',
        { description: '오후에 수량 20개로 확정.', person: '박경록', kind: '전화' },
        { existingType: '전화' }
    )
    assert.equal(out.count, 2)
    assert.equal(out.label, '통화')
    assert.equal(out.type, '전화')
    assert.match(out.description, /^\[통화 2회\]\n\[담당자\] 박경록\n/)
    assert.match(out.description, /■ 1차\n오전에 단가 문의\./)
    assert.match(out.description, /■ 2차 · 박경록\n오후에 수량 20개로 확정\./)
})

test('세 번째는 3회가 되고 앞의 구간은 그대로 남는다', () => {
    const two = mergeActivityDescription(
        '[담당자] 박경록\n첫 통화',
        { description: '둘째 통화', person: '박경록', kind: '전화' },
        { existingType: '전화' }
    )
    const three = mergeActivityDescription(two.description,
        { description: '셋째 통화', person: '박경록', kind: '전화' },
        { existingType: '전화' })
    assert.equal(three.count, 3)
    assert.match(three.description, /^\[통화 3회\]/)
    // 앞의 내용이 하나도 사라지지 않는다 — 이게 이 기능의 존재 이유다
    assert.match(three.description, /첫 통화/)
    assert.match(three.description, /둘째 통화/)
    assert.match(three.description, /셋째 통화/)
    assert.equal((three.description.match(/■ \d차/g) || []).length, 3)
})

test('다른 사람이 나오면 담당자에 더한다 (중복은 아니다)', () => {
    const out = mergeActivityDescription(
        '[담당자] 박경록\n첫 통화',
        { description: '둘째 통화', person: '김수현 과장', kind: '전화' },
        { existingType: '전화' }
    )
    assert.match(out.description, /\[담당자\] 박경록, 김수현 과장/)
})

test('같은 사람을 두 번 적지 않는다', () => {
    const out = mergeActivityDescription(
        '[담당자] 박경록\n첫 통화',
        { description: '둘째 통화', person: '박경록', kind: '전화' },
        { existingType: '전화' }
    )
    // 담당자 줄에는 한 번만. (차수 머리에도 적히므로 전체 개수는 2다)
    assert.match(out.description, /^\[통화 2회\]\n\[담당자\] 박경록\n/)
})

test('전화 뒤에 방문하면 미팅으로 올라간다 (KPI가 미팅만 센다)', () => {
    const out = mergeActivityDescription(
        '[담당자] 박경록\n오전 통화',
        { description: '오후에 찾아감', person: '박경록', kind: '미팅' },
        { existingType: '전화' }
    )
    assert.equal(out.type, '미팅')
    assert.equal(out.label, '접촉')
    assert.match(out.description, /^\[접촉 2회\]/)
})

test('방문 뒤에 통화해도 미팅은 유지된다', () => {
    const out = mergeActivityDescription(
        '[담당자] 박경록\n방문함',
        { description: '나중에 통화', person: '박경록', kind: '전화' },
        { existingType: '미팅' }
    )
    assert.equal(out.type, '미팅')
})

test('담당자를 모르는 접촉도 합쳐진다', () => {
    const out = mergeActivityDescription('첫 통화',
        { description: '둘째 통화', person: '', kind: '전화' }, { existingType: '전화' })
    assert.equal(out.count, 2)
    assert.ok(!out.description.includes('[담당자]'))
    assert.match(out.description, /첫 통화/)
    assert.match(out.description, /둘째 통화/)
})

test('빈 기존 기록에도 안전하다', () => {
    const out = mergeActivityDescription('', { description: '둘째', kind: '전화' }, {})
    assert.equal(out.count, 2)
    assert.match(out.description, /둘째/)
})

test('여러 담당자가 쉼표로 적혀 있어도 읽는다', () => {
    const r = parseActivityDescription('[담당자] 김민정 과장, 김중동 대리\n연세유업 방문.')
    assert.deepEqual(r.persons, ['김민정 과장', '김중동 대리'])
    assert.equal(r.body, '연세유업 방문.')
})

test('옛 자유서식 담당자 줄은 건드리지 않는다 (읽을 수 없게 된다)', () => {
    const messy = '[담당자] 유재민 책임 이혜인 책임 노수빈 선임 [방문목적] 관리\n방문 내용'
    const out = mergeActivityDescription(messy,
        { description: '둘째 통화', person: '박태문 책임', kind: '전화' }, { existingType: '미팅' })
    assert.ok(!out.description.includes('관리, 박태문'), '자유서식 줄에 이어붙이면 안 된다')
    // 그래도 누구와 한 통화인지는 차수 머리에 남는다
    assert.match(out.description, /■ 2차 · 박태문 책임/)
    assert.match(out.description, /유재민 책임 이혜인 책임 노수빈 선임/)
})

test('차수 머리에 상대가 적힌다 — 하루에 다른 사람과 통화할 수 있다', () => {
    const out = mergeActivityDescription('[담당자] 박경록\n첫 통화',
        { description: '둘째 통화', person: '김수현 과장', kind: '전화' }, { existingType: '전화' })
    assert.match(out.description, /■ 2차 · 김수현 과장/)
})
