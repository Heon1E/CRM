import test from 'node:test'
import assert from 'node:assert/strict'
import { withPaging, fetchAllPages } from '../src/utils/restPaging.js'

/*
 * 서버(`api/`)가 PostgREST를 직접 부를 때의 규칙.
 *
 * 실측(2026-09, 서비스 롤 키로 읽기만):
 *   거래처 전체            1,169
 *   limit=5000 한 방  ->   1,000   ← 169곳이 조용히 빠진다
 *   offset 끊어 받기  ->   1,169   (고유 id 1,169개)
 *
 * 그 169곳은 봇의 거래처 매칭에서 안 보여 '새 거래처'로 등록되고,
 * 아침 브리핑에서는 `(이름 없음)`으로 나갔다.
 */

test('물음표가 없는 경로에는 ?로 붙인다', () => {
    assert.equal(withPaging('clients', 0, 1000), 'clients?order=id.asc&limit=1000&offset=0')
})

test('이미 조건이 붙어 있으면 &로 잇는다', () => {
    assert.equal(
        withPaging('clients?select=id,company', 1000, 1000),
        'clients?select=id,company&order=id.asc&limit=1000&offset=1000',
    )
})

test('정렬을 반드시 붙인다 — 없으면 쪽 경계에서 행이 겹치거나 빠진다', () => {
    assert.match(withPaging('activities?select=id', 0, 1000), /order=id\.asc/)
})

test('정렬 기준은 바꿀 수 있다', () => {
    assert.match(withPaging('sales?select=id', 0, 500, 'sale_date'), /order=sale_date\.asc/)
})

/** 쪽마다 잘라 주는 가짜 서버 */
const fakeGet = (rows, log = []) => async (path) => {
    log.push(path)
    const limit = Number((path.match(/limit=(\d+)/) || [])[1])
    const offset = Number((path.match(/offset=(\d+)/) || [])[1])
    return rows.slice(offset, offset + limit)
}

const makeRows = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }))

test('1,000행을 넘으면 전부 받아온다 (거래처 1,169곳)', async () => {
    const log = []
    const out = await fetchAllPages(fakeGet(makeRows(1169), log), 'clients?select=id,company')
    assert.equal(out.length, 1169)
    assert.equal(new Set(out.map((r) => r.id)).size, 1169)
    assert.equal(log.length, 2)                       // 1000 + 169
    assert.match(log[0], /offset=0/)
    assert.match(log[1], /offset=1000/)
})

test('한 쪽에 다 들어가면 한 번만 부른다', async () => {
    const log = []
    const out = await fetchAllPages(fakeGet(makeRows(12), log), 'schedules?select=id')
    assert.equal(out.length, 12)
    assert.equal(log.length, 1)
})

test('딱 떨어져도 멈춘다', async () => {
    const log = []
    const out = await fetchAllPages(fakeGet(makeRows(2000), log), 'sales?select=id')
    assert.equal(out.length, 2000)
    assert.equal(log.length, 3)                       // 1000 · 1000 · 0
})

test('빈 결과도 그대로 빈 배열', async () => {
    assert.deepEqual(await fetchAllPages(fakeGet([]), 'clients?select=id'), [])
})

test('행이 없다고 돌려줘도(null) 죽지 않는다', async () => {
    const out = await fetchAllPages(async () => null, 'clients?select=id')
    assert.deepEqual(out, [])
})

test('쪽 크기를 줄여도 전부 받는다', async () => {
    const out = await fetchAllPages(fakeGet(makeRows(250)), 'clients?select=id', { pageSize: 100 })
    assert.equal(out.length, 250)
})
