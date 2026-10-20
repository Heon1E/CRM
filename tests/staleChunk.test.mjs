/**
 * 배포 직후 옛 조각 파일 오류 → 한 번만 새로고침 (2026-10-20 폰에서 실제로 났다)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isStaleChunkError, reloadOnceForNewVersion } from '../src/utils/staleChunk.js'

test('브라우저별 조각 파일 오류 문구를 알아본다', () => {
    assert.ok(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/RevenueForecastPanel-D-BVvlwW.js')))
    assert.ok(isStaleChunkError(new TypeError('error loading dynamically imported module')))      // Firefox
    assert.ok(isStaleChunkError(new TypeError('Importing a module script failed.')))              // Safari
    assert.ok(isStaleChunkError('Unable to preload CSS for /assets/Sales-abc.css'))
})

test('다른 오류는 건드리지 않는다', () => {
    assert.equal(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'map')")), false)
    assert.equal(isStaleChunkError(null), false)
})

const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } }

test('한 번은 새로고침한다', () => {
    let n = 0
    assert.equal(reloadOnceForNewVersion({ now: 1_000_000, storage: memStore(), reload: () => n++ }), true)
    assert.equal(n, 1)
})

test('방금 새로고침했는데 또 나면 멈춘다 — 끝없이 돌지 않는다', () => {
    let n = 0
    const storage = memStore()
    reloadOnceForNewVersion({ now: 1_000_000, storage, reload: () => n++ })
    assert.equal(reloadOnceForNewVersion({ now: 1_005_000, storage, reload: () => n++ }), false)
    assert.equal(n, 1)
})

test('시간이 지나 다음 배포에서 또 나면 다시 한 번 한다', () => {
    let n = 0
    const storage = memStore()
    reloadOnceForNewVersion({ now: 1_000_000, storage, reload: () => n++ })
    assert.equal(reloadOnceForNewVersion({ now: 1_000_000 + 60_000, storage, reload: () => n++ }), true)
    assert.equal(n, 2)
})

test('저장소를 못 써도 한 번은 시도한다', () => {
    let n = 0
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    assert.equal(reloadOnceForNewVersion({ now: 1, storage: broken, reload: () => n++ }), true)
    assert.equal(n, 1)
})
