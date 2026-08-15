/**
 * 거래처 거르기 회귀 테스트
 *
 * 특히 '6개월 무거래'가 중요하다 — 거래 이력이 없는 곳까지 섞이면 목록이
 * 신규 후보로 가득 차서 정작 챙길 휴면 거래처가 묻힌다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    FILTERS, FILTER_KEYS, matches, passes, filterCompanies,
    addView, removeView, describe,
} from '../src/utils/clientFilters.js'

const DAY = 86400000
const NOW = new Date('2026-08-15T00:00:00Z').getTime()
const ago = (d) => NOW - d * DAY

const rows = {
    '내담당 활발':   { mine: true,  rev: 900, lastSale: ago(10),  acts: 5, hasContact: true },
    '휴면 거래처':   { mine: false, rev: 500, lastSale: ago(200), acts: 1, hasContact: true },
    '아직 거래 전': { mine: false, rev: 0,   lastSale: null,     acts: 3, hasContact: false },
    '조용한 소액':   { mine: false, rev: 100, lastSale: ago(120), acts: 0, hasContact: false },
}

test('조건 목록과 키가 짝이 맞는다', () => {
    assert.equal(FILTERS.length, FILTER_KEYS.length)
    assert.ok(FILTERS.every((f) => f.label && f.hint))
})

test('내 담당', () => {
    assert.equal(matches(rows['내담당 활발'], 'mine', NOW), true)
    assert.equal(matches(rows['휴면 거래처'], 'mine', NOW), false)
})

test('매출 있음 — 0원은 없는 것이다', () => {
    assert.equal(matches(rows['휴면 거래처'], 'hasSales', NOW), true)
    assert.equal(matches(rows['아직 거래 전'], 'hasSales', NOW), false)
})

test('최근 3개월 거래는 90일로 자른다', () => {
    assert.equal(matches({ lastSale: ago(89) }, 'recent', NOW), true)
    assert.equal(matches({ lastSale: ago(91) }, 'recent', NOW), false)
    assert.equal(matches({ lastSale: null }, 'recent', NOW), false)
})

test('6개월 무거래 — 거래 이력이 없는 곳은 넣지 않는다', () => {
    // 이걸 섞으면 목록이 신규 후보로 가득 차서 휴면 거래처가 묻힌다
    assert.equal(matches(rows['휴면 거래처'], 'dormant', NOW), true)
    assert.equal(matches(rows['아직 거래 전'], 'dormant', NOW), false)
    assert.equal(matches(rows['내담당 활발'], 'dormant', NOW), false)
    // 이력은 있는데 날짜를 모르는 경우는 휴면으로 본다
    assert.equal(matches({ rev: 100, lastSale: null }, 'dormant', NOW), true)
})

test('영업 중 / 연락처 없음', () => {
    assert.equal(matches(rows['아직 거래 전'], 'active', NOW), true)
    assert.equal(matches(rows['조용한 소액'], 'active', NOW), false)
    assert.equal(matches(rows['조용한 소액'], 'noContact', NOW), true)
    assert.equal(matches(rows['내담당 활발'], 'noContact', NOW), false)
})

test('조건을 여러 개 고르면 모두 만족해야 한다', () => {
    assert.equal(passes(rows['내담당 활발'], ['mine', 'recent'], NOW), true)
    assert.equal(passes(rows['내담당 활발'], ['mine', 'dormant'], NOW), false)
})

test('아무것도 안 고르면 전부 통과', () => {
    assert.equal(passes(rows['조용한 소액'], [], NOW), true)
    assert.equal(passes(rows['조용한 소액'], null, NOW), true)
})

test('회사 목록을 거른다', () => {
    const map = new Map(Object.entries(rows))
    const names = [...map.keys()]
    assert.deepEqual(filterCompanies(names, map, ['dormant'], NOW), ['휴면 거래처'])
    assert.deepEqual(filterCompanies(names, map, [], NOW), names)
})

test('없는 조건은 통과시킨다 (조건이 사라져도 목록이 비지 않는다)', () => {
    assert.equal(matches(rows['내담당 활발'], '없는조건', NOW), true)
})

test('저장된 보기 — 같은 이름이면 덮어쓴다', () => {
    let v = []
    v = addView(v, '내 담당', ['mine'], '')
    v = addView(v, '휴면', ['dormant'], '')
    assert.equal(v.length, 2)
    v = addView(v, '내 담당', ['mine', 'recent'], '한솔')
    assert.equal(v.length, 2)
    assert.deepEqual(v.find((x) => x.name === '내 담당').filters, ['mine', 'recent'])
    assert.equal(v.find((x) => x.name === '내 담당').search, '한솔')
})

test('이름이 비면 저장하지 않는다', () => {
    assert.equal(addView([], '   ', ['mine'], '').length, 0)
})

test('보기를 지운다', () => {
    const v = addView(addView([], 'a', [], ''), 'b', [], '')
    assert.deepEqual(removeView(v, 'a').map((x) => x.name), ['b'])
})

test('조건을 사람 말로 옮긴다', () => {
    assert.equal(describe([]), '전체')
    assert.equal(describe(['mine', 'dormant']), '내 담당 + 6개월 무거래')
})
