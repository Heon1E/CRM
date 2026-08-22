import { useEffect, useRef, useState } from 'react'

/**
 * 당겨서 새로고침 — 휴대폰에서 목록 맨 위를 아래로 당기면 자료를 다시 받는다.
 *
 * **브라우저 기본 동작을 대신하는 것이 요점이다.** 크롬 안드로이드는 맨 위에서
 * 당기면 **페이지를 통째로 다시 받는다.** 이 앱에서는 그게 최악이다 —
 * 화면 조각 34개를 다시 받고 매출 1.5만 행을 16쪽에 걸쳐 다시 조회한다.
 * 정작 필요한 것은 자료만 다시 받는 것이라 `refreshData()` 한 번이면 된다.
 * 그래서 기본 동작은 `overscroll-behavior-y: contain`(index.css)으로 막고
 * 이 훅이 대신 받는다.
 *
 * 지키는 것:
 * - **맨 위(`scrollTop === 0`)에서 시작한 아래 방향 끌기만** 받는다. 목록을
 *   훑어 내리는 중에 반응하면 스크롤이 계속 걸려 못 쓴다.
 * - **세로가 가로보다 확실히 클 때만.** 좌우로 미는 동작(표 가로 스크롤)을
 *   새로고침으로 오인하면 표를 못 본다.
 * - 손가락이 여러 개면 무시한다(확대 동작).
 * - 당긴 거리에 저항을 준다 — 화면이 손가락을 그대로 따라오면 너무 헐겁다.
 * - `passive: false`인 `touchmove`는 **당기는 중일 때만** `preventDefault`한다.
 *   무조건 막으면 평범한 스크롤이 죽는다.
 *
 * 데스크톱에는 걸리지 않는다(터치 이벤트가 없다).
 *
 * @param {() => Promise<any>} onRefresh 다시 받는 일. 끝날 때까지 표시가 남는다.
 * @returns {{ distance: number, refreshing: boolean, armed: boolean }}
 *   `distance` 당긴 거리(px) · `armed` 놓으면 실행되는 지점을 넘었는지
 */
const THRESHOLD = 70      // 이만큼 당기면 실행된다
const MAX = 110           // 더 당겨도 이 이상 내려오지 않는다
const RESIST = 0.5        // 손가락 이동의 절반만 따라온다

export const usePullToRefresh = (onRefresh) => {
    const [distance, setDistance] = useState(0)
    const [refreshing, setRefreshing] = useState(false)

    // 콜백이 매 렌더 새로 만들어져도 리스너를 다시 달지 않게 ref에 담는다.
    const cb = useRef(onRefresh)
    cb.current = onRefresh

    const start = useRef(null)   // { y, x } | null
    const pulling = useRef(false)
    const busy = useRef(false)
    /*
     * 당긴 거리를 ref에도 담는다. `touchend`가 state만 보면 그 값을 클로저로
     * 잡아야 하고, 그러면 effect가 `distance`에 걸려 **끄는 동안 매 프레임마다
     * 리스너 4개를 다시 단다.** state는 그리기 위한 것이고 판정은 ref로 한다.
     */
    const dist = useRef(0)
    const setDist = (v) => { dist.current = v; setDistance(v) }

    useEffect(() => {
        const scrollTop = () =>
            window.scrollY || document.documentElement.scrollTop || 0

        const onStart = (e) => {
            if (busy.current || e.touches.length !== 1 || scrollTop() > 0) {
                start.current = null
                return
            }
            const t = e.touches[0]
            start.current = { y: t.clientY, x: t.clientX }
            pulling.current = false
        }

        const onMove = (e) => {
            if (!start.current || busy.current) return
            const t = e.touches[0]
            const dy = t.clientY - start.current.y
            const dx = t.clientX - start.current.x

            if (!pulling.current) {
                if (dy <= 0) { start.current = null; return }        // 위로 올리는 중
                if (Math.abs(dx) > Math.abs(dy)) { start.current = null; return } // 좌우 동작
                if (dy < 8) return                                    // 아직 판단하기 이르다
                pulling.current = true
            }

            // 당기는 중일 때만 막는다. 무조건 막으면 평범한 스크롤이 죽는다.
            if (e.cancelable) e.preventDefault()
            setDist(Math.min(MAX, dy * RESIST))
        }

        const finish = async () => {
            const d = dist.current
            start.current = null
            if (!pulling.current) { setDist(0); return }
            pulling.current = false

            if (d < THRESHOLD) { setDist(0); return }

            busy.current = true
            setRefreshing(true)
            setDist(THRESHOLD)          // 도는 동안 표시를 붙잡아 둔다
            try {
                await cb.current?.()
            } finally {
                busy.current = false
                setRefreshing(false)
                setDist(0)
            }
        }

        window.addEventListener('touchstart', onStart, { passive: true })
        window.addEventListener('touchmove', onMove, { passive: false })
        window.addEventListener('touchend', finish, { passive: true })
        window.addEventListener('touchcancel', finish, { passive: true })
        return () => {
            window.removeEventListener('touchstart', onStart)
            window.removeEventListener('touchmove', onMove)
            window.removeEventListener('touchend', finish)
            window.removeEventListener('touchcancel', finish)
        }
    }, [])   // 판정은 전부 ref로 하므로 리스너는 한 번만 단다

    return { distance, refreshing, armed: distance >= THRESHOLD }
}

export default usePullToRefresh
