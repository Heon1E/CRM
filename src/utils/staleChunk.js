/**
 * 배포 직후 '옛 화면'이 사라진 조각 파일을 부르다 죽는 것을 되살린다.
 *
 * 화면은 열 때 받는다(코드 분할). 조각 파일 이름에는 내용 해시가 붙어
 * (`RevenueForecastPanel-D-BVvlwW.js`) 배포할 때마다 바뀌고, 옛 이름의 파일은
 * 새 배포에 없다. 그래서 **배포 전에 열어 둔 폰**이 대시보드로 가는 순간 옛 이름을
 * 찾다가 실패하고, 화면 전체가 'SYSTEM ERROR DETECTED'로 덮였다(2026-10-20 실제).
 *
 * 고칠 것은 하나뿐이다 — 새 버전의 index.html을 받는 것. **한 번 새로고침**하면 된다.
 * 다만 같은 오류가 계속 나면 새로고침이 끝없이 돌므로 짧은 시간 안에 두 번은 하지 않는다.
 */

const KEY = 'stale-chunk-reload-at'
const GUARD_MS = 15000

/** 조각 파일을 못 받아 난 오류인가 (브라우저마다 문구가 다르다) */
export const isStaleChunkError = (err) => {
    const msg = String(err?.message || err || '')
    return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading chunk [\w-]+ failed|ChunkLoadError/i.test(msg)
}

/**
 * 새 버전을 받으러 한 번 새로고침한다.
 * @returns {boolean} 새로고침을 시작했으면 true. 방금 했는데 또 났으면 false(오류 화면을 보여준다).
 */
export const reloadOnceForNewVersion = ({ now = Date.now(), storage, reload } = {}) => {
    const store = storage ?? (() => { try { return window.sessionStorage } catch { return null } })()
    const doReload = reload ?? (() => window.location.reload())
    let last = 0
    try { last = Number(store?.getItem(KEY)) || 0 } catch { /* 저장소를 못 쓰면 그냥 한 번 시도한다 */ }
    if (last && now - last < GUARD_MS) return false   // 기록이 없으면(0) '한 번도 안 했다'
    try { store?.setItem(KEY, String(now)) } catch { /* 위와 같다 */ }
    doReload()
    return true
}
