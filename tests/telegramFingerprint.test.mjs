import test from 'node:test'
import assert from 'node:assert/strict'
import { fingerprint } from '../api/telegram-webhook.js'

// 손이 미끄러져 같은 것을 두 번 보내는 일을 막는다.
// 활동은 이제 같은 날 기록을 '합치므로', 여기서 안 막으면 같은 내용이 두 번 적힌다.

const A = 'AAAA'.repeat(50)
const B = 'BBBB'.repeat(50)

test('같은 파일은 같은 지문이다', () => {
    assert.equal(fingerprint({ blobs: [A] }), fingerprint({ blobs: [A] }))
})

test('다른 파일은 다른 지문이다', () => {
    assert.notEqual(fingerprint({ blobs: [A] }), fingerprint({ blobs: [B] }))
})

test('글은 공백 차이를 무시한다 (같은 말을 다시 친 것)', () => {
    assert.equal(
        fingerprint({ text: '오늘 대성드럼 미팅' }),
        fingerprint({ text: '오늘  대성드럼   미팅  ' })
    )
})

test('글이 다르면 다른 지문이다', () => {
    assert.notEqual(fingerprint({ text: '오늘 대성드럼 미팅' }), fingerprint({ text: '오늘 대성드럼 통화' }))
})

test('같은 사진이라도 설명이 다르면 다른 건이다', () => {
    assert.notEqual(fingerprint({ blobs: [A], text: '8월분' }), fingerprint({ blobs: [A], text: '9월분' }))
})

test('사진 여러 장의 순서가 같으면 같은 지문이다', () => {
    assert.equal(fingerprint({ blobs: [A, B] }), fingerprint({ blobs: [A, B] }))
})

test('빈 메시지는 지문이 없다 — 막지 않는다', () => {
    assert.equal(fingerprint({ blobs: [], text: '' }), null)
    assert.equal(fingerprint({}), null)
    assert.equal(fingerprint(), null)
})

test('공백뿐인 글도 지문이 없다', () => {
    assert.equal(fingerprint({ text: '   \n  ' }), null)
})
