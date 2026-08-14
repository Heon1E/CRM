/**
 * 문서번호 짓기 회귀 테스트
 *
 * 실제로 겪은 결함들을 고정한다. 특히 '개수 + 1'로 지으면 안 된다는 것.
 * 의존성 없이 `node --test`로 돈다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    dateKey, formatDocNo, nextDocSeq, isDuplicateNo, issueDocNo, saveWithFreshNo,
} from '../src/utils/docNumber.js'

test('날짜에서 구분자를 뗀다', () => {
    assert.equal(dateKey('2026-08-14'), '20260814')
    assert.equal(dateKey('2026-08-14T09:30:00+09:00'), '20260814')
    assert.equal(dateKey(''), '')
})

test('번호 형식은 접두어-날짜-두자리다', () => {
    assert.equal(formatDocNo('Q', '2026-08-14', 1), 'Q-20260814-01')
    assert.equal(formatDocNo('PO', '2026-08-14', 7), 'PO-20260814-07')
})

test('하루 100건을 넘으면 자릿수가 늘어난다 (번호가 겹치지 않는다)', () => {
    assert.equal(formatDocNo('Q', '2026-08-14', 100), 'Q-20260814-100')
    assert.equal(formatDocNo('Q', '2026-08-14', 7), 'Q-20260814-07')
})

test('그 날 아무것도 없으면 1번', () => {
    assert.equal(nextDocSeq([], 'Q', '2026-08-14'), 1)
    assert.equal(nextDocSeq(null, 'Q', '2026-08-14'), 1)
})

test('가장 큰 번호 다음을 준다', () => {
    const nos = ['Q-20260814-01', 'Q-20260814-02', 'Q-20260814-03']
    assert.equal(nextDocSeq(nos, 'Q', '2026-08-14'), 4)
})

test('중간을 지워도 번호가 되돌아가지 않는다 — 개수가 아니라 최대값이다', () => {
    // 01, 02, 03 중 01을 지운 상태. 개수(2)+1 = 03 이면 이미 있는 번호와 부딪힌다.
    const nos = ['Q-20260814-02', 'Q-20260814-03']
    assert.equal(nextDocSeq(nos, 'Q', '2026-08-14'), 4)
})

test('마지막 하나만 남아도 최대값을 따른다', () => {
    assert.equal(nextDocSeq(['Q-20260814-09'], 'Q', '2026-08-14'), 10)
})

test('다른 날짜 번호는 세지 않는다', () => {
    const nos = ['Q-20260813-05', 'Q-20260815-09', 'Q-20260814-01']
    assert.equal(nextDocSeq(nos, 'Q', '2026-08-14'), 2)
})

test('다른 종류(PO)의 번호는 세지 않는다', () => {
    const nos = ['PO-20260814-08', 'Q-20260814-01']
    assert.equal(nextDocSeq(nos, 'Q', '2026-08-14'), 2)
    assert.equal(nextDocSeq(nos, 'PO', '2026-08-14'), 9)
})

test('형식이 다른 번호는 무시한다 (손으로 넣은 것 등)', () => {
    const nos = ['Q-20260814-01', 'Q-20260814-임시', '견적-1', null, '', 'Q-20260814-']
    assert.equal(nextDocSeq(nos, 'Q', '2026-08-14'), 2)
})

test('세 자리 번호도 이어서 센다', () => {
    assert.equal(nextDocSeq(['Q-20260814-99', 'Q-20260814-100'], 'Q', '2026-08-14'), 101)
})

test('unique 위반을 알아본다', () => {
    assert.equal(isDuplicateNo({ code: '23505' }), true)
    assert.equal(isDuplicateNo({ message: 'duplicate key value violates unique constraint' }), true)
    assert.equal(isDuplicateNo({ code: 'PGRST205' }), false)
    assert.equal(isDuplicateNo(null), false)
})

/* --- DB를 흉내낸 가짜 supabase로 확인 ------------------------------------ */
const fakeDb = (rows) => ({
    from: () => ({
        select: (col) => ({
            like: (_c, pattern) => {
                const head = pattern.replace(/%$/, '')
                return { data: rows.filter((r) => String(r).startsWith(head)).map((r) => ({ [col]: r })), error: null }
            },
        }),
    }),
})

test('issueDocNo는 그 날짜 것만 읽어 다음 번호를 준다', async () => {
    const db = fakeDb(['Q-20260813-04', 'Q-20260814-01', 'Q-20260814-02'])
    const no = await issueDocNo(db, { table: 'quotes', column: 'quote_no', prefix: 'Q', date: '2026-08-14' })
    assert.equal(no, 'Q-20260814-03')
})

test('번호가 부딪히면 다시 지어 재시도한다', async () => {
    // 첫 시도는 이미 쓰인 번호라 실패하고, 그 번호가 DB에 생긴 뒤 다음 번호로 성공한다.
    const rows = ['Q-20260814-01']
    const db = fakeDb(rows)
    let attempts = 0
    const { no, result } = await saveWithFreshNo(
        db, { table: 'quotes', column: 'quote_no', prefix: 'Q', date: '2026-08-14' },
        async (candidate) => {
            attempts++
            if (attempts === 1) { rows.push(candidate); throw { code: '23505' } }
            return { saved: candidate }
        },
    )
    assert.equal(attempts, 2)
    assert.equal(no, 'Q-20260814-03')
    assert.deepEqual(result, { saved: 'Q-20260814-03' })
})

test('unique 위반이 아닌 오류는 재시도하지 않고 그대로 올린다', async () => {
    const db = fakeDb([])
    let attempts = 0
    await assert.rejects(
        () => saveWithFreshNo(db, { table: 'quotes', column: 'quote_no', prefix: 'Q', date: '2026-08-14' },
            async () => { attempts++; throw new Error('네트워크 끊김') }),
        /네트워크 끊김/,
    )
    assert.equal(attempts, 1)
})
