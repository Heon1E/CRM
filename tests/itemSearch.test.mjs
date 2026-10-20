/**
 * 품목으로 매출 찾기 회귀 테스트
 *
 * 거래처가 "이거 얼마였죠?" 할 때 보는 숫자다. 0원 줄(이월·부품·교환)을
 * 단가로 내놓으면 틀린 가격을 말하게 된다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { itemSearchPatterns, summarizeItemPrices } from '../src/utils/itemSearch.js'

test('낱말마다 따로 찾는다 — 띄어쓰기·하이픈 차이를 넘는다', () => {
    assert.deepEqual(itemSearchPatterns('  150  캡 '), ['%150%', '%캡%'])
    assert.deepEqual(itemSearchPatterns('BF-50'), ['%BF-50%'])
    assert.deepEqual(itemSearchPatterns(''), [])
    assert.deepEqual(itemSearchPatterns(null), [])
})

test('% · _ 는 글자 그대로 찾는다', () => {
    assert.deepEqual(itemSearchPatterns('50%_a'), ['%50\\%\\_a%'])
})

const R = (client_id, clientName, item_name, sale_date, unit_price, quantity = 1) =>
    ({ client_id, clientName, item_name, sale_date, unit_price, quantity })

test('거래처·품목별로 마지막 단가를 낸다', () => {
    const out = summarizeItemPrices([
        R('a', '한솔', 'BF-50', '2026-03-02', 360000),
        R('a', '한솔', 'BF-50', '2026-09-10', 376000, 2),
        R('b', '바커', 'BF-50', '2026-08-01', 380000),
    ])
    assert.equal(out.length, 2)
    assert.deepEqual(
        out.map((g) => [g.clientName, g.price, g.priceDate, g.lastDate, g.count, g.qty]),
        [['한솔', 376000, '2026-09-10', '2026-09-10', 2, 3], ['바커', 380000, '2026-08-01', '2026-08-01', 1, 1]],
    )
})

test('0원 줄은 단가로 쓰지 않는다 — 마지막 거래일에는 넣는다', () => {
    const [g] = summarizeItemPrices([
        R('a', '한솔', 'BF-50', '2026-09-30', 0),
        R('a', '한솔', 'BF-50', '2026-09-10', 376000),
    ])
    assert.equal(g.price, 376000)
    assert.equal(g.priceDate, '2026-09-10')
    assert.equal(g.lastDate, '2026-09-30')
})

test('0원밖에 없으면 0 그대로 — 값을 지어내지 않는다', () => {
    const [g] = summarizeItemPrices([R('a', '한솔', '제리캔상부캡', '2026-09-30', 0, 5)])
    assert.equal(g.price, 0)
    assert.equal(g.priceDate, '')
})

test('입력 순서와 상관없다', () => {
    const rows = [
        R('a', '한솔', 'BF-50', '2026-09-10', 376000),
        R('a', '한솔', 'BF-50', '2026-03-02', 360000),
    ]
    assert.equal(summarizeItemPrices(rows)[0].price, 376000)
    assert.equal(summarizeItemPrices([...rows].reverse())[0].price, 376000)
})

test('같은 거래처라도 품목이 다르면 따로 센다', () => {
    const out = summarizeItemPrices([
        R('a', '한솔', 'BF-50V1H', '2026-09-10', 376000),
        R('a', '한솔', 'BF-80B1', '2026-09-11', 410000),
    ])
    assert.deepEqual(out.map((g) => g.itemName), ['BF-80B1', 'BF-50V1H'])
})
