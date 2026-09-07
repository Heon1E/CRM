import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchAllRows } from '../src/utils/fetchAllRows.js'

/*
 * 1,000행에서 조용히 잘리는 것과, 쪽 경계에서 행이 겹치거나 빠지는 것 —
 * 둘 다 **오류가 나지 않아서** 무섭다. 여기서 규칙을 고정한다.
 *
 * 실제로 있었던 일:
 *   - 백업이 매출 15,530건 중 1,000건만 담고 "완료"라고 말했다.
 *   - 매출 15,221행을 받았는데 고유 id는 15,194개였다(27행 겹침·27행 빠짐).
 *     정렬이 `sale_date`라 같은 날짜끼리의 순서가 정해져 있지 않았다.
 *   - 거래처 목록을 `.order('company')`로 받고 있었다. 회사명은 유일하지 않다.
 */

/** Supabase 빌더 흉내. 부른 순서를 기록한다. */
const fakeSupabase = (rows, { pageSize = 1000 } = {}) => {
    const built = []
    const buildQuery = () => {
        const calls = { order: [], range: null }
        built.push(calls)
        const q = {
            order(col, opts) { calls.order.push(col); return q },
            range(from, to) {
                calls.range = [from, to]
                const page = rows.slice(from, to + 1)
                return Promise.resolve({ data: page, error: null })
            },
        }
        return q
    }
    return { buildQuery, built, pageSize }
}

const makeRows = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }))

test('한 쪽에 다 들어가면 한 번만 조회한다', async () => {
    const { buildQuery, built } = fakeSupabase(makeRows(3))
    const out = await fetchAllRows(buildQuery, 1000)
    assert.equal(out.length, 3)
    assert.equal(built.length, 1)
})

test('1,000행을 넘으면 끊어서 전부 받는다', async () => {
    // 15,530행 = 실제 매출 행 수. 예전 백업은 여기서 1,000건만 담았다.
    const { buildQuery } = fakeSupabase(makeRows(15530))
    const out = await fetchAllRows(buildQuery, 1000)
    assert.equal(out.length, 15530)
    assert.equal(out[0].id, 1)
    assert.equal(out[out.length - 1].id, 15530)
})

test('받은 행이 겹치거나 빠지지 않는다', async () => {
    const { buildQuery } = fakeSupabase(makeRows(2500))
    const out = await fetchAllRows(buildQuery, 1000)
    assert.equal(new Set(out.map((r) => r.id)).size, 2500)
})

test('쪽마다 조회를 새로 짓는다 — 빌더를 돌려 쓰면 두 번째 쪽이 안 온다', async () => {
    const { buildQuery, built } = fakeSupabase(makeRows(2500))
    await fetchAllRows(buildQuery, 1000)
    assert.equal(built.length, 3)            // 1000 · 1000 · 500
    assert.deepEqual(built.map((b) => b.range), [[0, 999], [1000, 1999], [2000, 2999]])
})

test("부르는 쪽이 무엇으로 정렬했든 `id`를 마지막 기준으로 더한다", async () => {
    // 거래처를 `.order('company')`로 받고 있었다 — 회사명은 유일하지 않다.
    const rows = makeRows(1200)
    const built = []
    const buildQuery = () => {
        const calls = { order: [] }
        built.push(calls)
        const q = {
            order(col) { calls.order.push(col); return q },
            range(from, to) { return Promise.resolve({ data: rows.slice(from, to + 1), error: null }) },
        }
        return q.order('company')   // 부르는 쪽이 이미 정렬을 걸어 둔 상태
    }
    await fetchAllRows(buildQuery, 1000)
    for (const b of built) {
        assert.equal(b.order[b.order.length - 1], 'id',
            "마지막 정렬 기준이 `id`가 아니면 쪽 경계에서 행이 겹치거나 빠진다")
    }
})

test('마지막 쪽이 딱 떨어져도 멈춘다', async () => {
    // 2,000행 / 쪽 1,000 — 세 번째 조회가 빈 쪽을 받고 끝나야 한다
    const { buildQuery, built } = fakeSupabase(makeRows(2000))
    const out = await fetchAllRows(buildQuery, 1000)
    assert.equal(out.length, 2000)
    assert.equal(built.length, 3)
})

test('오류는 삼키지 않고 던진다', async () => {
    const buildQuery = () => ({
        order() { return this },
        range() { return Promise.resolve({ data: null, error: { message: '권한 없음' } }) },
    })
    // Supabase가 준 오류 객체를 그대로 던진다(Error로 감싸지 않는다).
    // 부르는 쪽이 `e?.message`로 읽어 `deleted_at` 칸 없음을 가려내므로
    // **`message`가 남아 있어야 한다.**
    await assert.rejects(
        () => fetchAllRows(buildQuery, 1000),
        (e) => e?.message === '권한 없음',
    )
})

test('행이 하나도 없으면 빈 배열', async () => {
    const { buildQuery } = fakeSupabase([])
    assert.deepEqual(await fetchAllRows(buildQuery, 1000), [])
})
