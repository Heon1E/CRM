import test from 'node:test'
import assert from 'node:assert/strict'
import {
    CLIENT_STATUS_OPTIONS, coerceClientStatus, getClientStatusTone, isActiveClientStatus,
} from '../src/utils/clientStatus.js'

/*
 * 목록에 없는 값을 '신규'로 바꿔 버리고 있었다. 그래서 **'활성' 736곳이
 * 전부 '신규'로 표시됐다** — 1,150곳 중 64%다. 몇 년째 거래 중인 곳을
 * 신규라고 말하는 셈이었다.
 *
 * 더 나쁜 것은 이 목록이 수정 창의 선택지라는 점이다. '활성' 거래처를 열면
 * 고를 값에 '활성'이 없어서, 저장하면 다른 값으로 바뀐다.
 *
 * 2026-09 실측 분포:
 *   활성 736 · 매출 335 · 잠재고객 46 · 신규 44 · 거래 종료 4 · 단절 1 · 영업 대기 1
 */

test('DB에 실제로 있는 상태가 모두 선택지에 있다', () => {
    for (const s of ['활성', '매출', '잠재고객', '신규', '거래 종료', '단절', '영업 대기']) {
        assert.ok(CLIENT_STATUS_OPTIONS.includes(s), `선택지에 '${s}'가 없다 — 수정 창에서 값이 바뀐다`)
    }
})

test("'활성'을 '신규'로 바꾸지 않는다", () => {
    assert.equal(coerceClientStatus('활성'), '활성')
})

test('낯선 값도 그대로 보여준다 (그럴듯한 거짓말보다 낫다)', () => {
    assert.equal(coerceClientStatus('제휴검토'), '제휴검토')
})

test('빈 값일 때만 기본값을 쓴다', () => {
    assert.equal(coerceClientStatus(''), '신규')
    assert.equal(coerceClientStatus(null), '신규')
    assert.equal(coerceClientStatus(undefined), '신규')
    assert.equal(coerceClientStatus('  '), '신규')
})

test('앞뒤 공백은 다듬는다', () => {
    assert.equal(coerceClientStatus(' 매출 '), '매출')
})

test('색의 무게 — 초록은 거래 중, 노랑은 신규', () => {
    assert.equal(getClientStatusTone('매출'), 'live')
    assert.equal(getClientStatusTone('신규'), 'new')
})

test("가장 흔한 '활성'에는 노랑을 쓰지 않는다", () => {
    // 736곳이 노랑이면 노랑이 죽는다 (KPI 카드 6장이 전부 물들었던 것과 같다)
    assert.notEqual(getClientStatusTone('활성'), 'new')
    assert.equal(getClientStatusTone('활성'), 'idle')
})

test('끝난 거래는 물러난다', () => {
    assert.equal(getClientStatusTone('거래 종료'), 'off')
    assert.equal(getClientStatusTone('단절'), 'off')
})

test('영업 중인 단계는 테두리만', () => {
    assert.equal(getClientStatusTone('잠재고객'), 'lead')
    assert.equal(getClientStatusTone('영업 대기'), 'lead')
})

test("'활성'도 거래 중으로 본다", () => {
    // 예전에는 '매출'만 활성이라 736곳이 비활성으로 잡혔다
    assert.equal(isActiveClientStatus('활성'), true)
    assert.equal(isActiveClientStatus('매출'), true)
    assert.equal(isActiveClientStatus('단절'), false)
})
