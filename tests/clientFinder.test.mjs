/**
 * 거래처 찾기(makeClientFinder) 회귀 테스트
 *
 * 2026-10-01 매출 엑셀에 옛 이름 `신성물산(주)`가 적혀 있자, 8월에
 * `대달인터내셔널(주)`로 합쳐 둔 거래처가 **새 거래처로 되살아났다.**
 * 매출 업로드가 키만 맞춰 보고 별칭표를 안 봤기 때문이다.
 * 앱의 모든 입력 경로(매출 업로드·ERP 스크린샷·받은 항목)가 이 함수 하나를 쓴다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeClientFinder } from '../src/utils/clientKeys.js'

const CLIENTS = [
    { id: 1, company: '대달인터내셔널(주)' },
    { id: 2, company: '(주)한솔케미칼' },
    { id: 3, company: '현대산업 주식회사(I)' },
    { id: 4, company: 'KCC' },
    { id: 5, company: '(주)아모레퍼시픽' },
]

test('병합된 옛 이름은 별칭표를 따라 남은 거래처로 간다 (신성물산 사고)', () => {
    const find = makeClientFinder(CLIENTS)
    assert.equal(find('신성물산(주)')?.id, 1)
    assert.equal(find('신성물산')?.id, 1)
    assert.equal(find('대달산업')?.id, 1)
})

test('표기 흔들림은 키로 맞춘다 — ㈜·(주)·주식회사·공백', () => {
    const find = makeClientFinder(CLIENTS)
    for (const n of ['㈜한솔케미칼', '한솔케미칼 주식회사', '한솔 케미칼', '(주)한솔케미칼']) {
        assert.equal(find(n)?.id, 2, n)
    }
})

test('별칭은 짧게 적힌 이름도 등록명으로 잇는다', () => {
    const find = makeClientFinder(CLIENTS)
    assert.equal(find('현대산업')?.id, 3)
})

test('괄호·공장 접미사를 떼고도 찾는다', () => {
    const find = makeClientFinder(CLIENTS)
    assert.equal(find('KCC 전주공장')?.id, 4)
    assert.equal(find('아모레퍼시픽 (오산)')?.id, 5)
})

test('없는 회사는 null — 비슷하다고 아무 데나 붙이지 않는다', () => {
    const find = makeClientFinder(CLIENTS)
    assert.equal(find('한솔제지'), null)
    assert.equal(find(''), null)
    assert.equal(find(null), null)
})

test('add로 방금 만든 거래처를 다시 조회하지 않고 찾는다', () => {
    const find = makeClientFinder(CLIENTS)
    assert.equal(find('새로운상사'), null)
    find.add({ id: 9, company: '새로운상사' })
    assert.equal(find('(주)새로운상사')?.id, 9)
})

test('키가 겹치면 먼저 들어온 거래처가 이긴다 (뒤에 넣은 것이 덮어쓰지 않는다)', () => {
    const find = makeClientFinder([{ id: 1, company: '(주)한국' }, { id: 2, company: '한국 주식회사' }])
    assert.equal(find('한국')?.id, 1)
})

test('이름 칸을 바꿔 쓸 수 있다', () => {
    const find = makeClientFinder([{ id: 7, name: '(주)한솔케미칼' }], { nameOf: (c) => c.name })
    assert.equal(find('한솔케미칼')?.id, 7)
})
