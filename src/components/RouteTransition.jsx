import React from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * 화면이 바뀔 때 **들어오는 쪽만** 움직인다.
 *
 * 앞으로 가면 오른쪽에서, 뒤로 가면 왼쪽에서 들어온다. 방향이 있으면 '더 안으로
 * 들어갔다 / 되돌아 나왔다'가 눈에 보인다 — 그냥 바뀌면 어느 쪽으로 움직인
 * 것인지 알 수 없다. 뒤로 가기는 `useNavigationType()`이 `POP`을 준다.
 *
 * **나가는 쪽은 움직이지 않는다.** 그러려면 옛 화면을 계속 띄워 둬야 하는데,
 * 대시보드처럼 무거운 화면이 잠깐이라도 두 벌 뜨면 그 값이 모션값보다 크다.
 * 들어오는 쪽만으로도 방향은 충분히 읽힌다.
 *
 * `key`가 `pathname`이라 화면이 바뀔 때마다 다시 붙는다 — `animate-in`은 새로
 * 붙는 요소에만 걸리기 때문이다.
 *
 * **주의: 도는 동안 `transform`이 걸린다.** 그 200ms 사이에는 안쪽의
 * `position: fixed` 요소가 화면이 아니라 이 상자를 기준으로 놓인다(확인함:
 * 도는 중 `matrix(1,0,0,1,12,0)` → 끝나면 `none`). 페이지 전체가 함께
 * 미끄러지는 것이므로 어긋나 보이지는 않지만, 여기 안에서 화면 기준으로
 * 붙박아야 하는 것을 만들 때는 기억할 것.
 *
 * '동작 줄이기'를 켠 사람에게는 `index.css`가 전역으로 꺼 준다.
 *
 * @param {boolean} [forceBack] 확인 화면(`/__motion`)에서 방향을 강제할 때만 쓴다.
 */
const RouteTransition = ({ children, forceBack }) => {
    const location = useLocation()
    const navType = useNavigationType()
    const back = forceBack ?? (navType === 'POP')

    return (
        <div
            key={location.pathname}
            className={`animate-in fade-in duration-200 ${back ? 'slide-in-from-left-3' : 'slide-in-from-right-3'}`}
        >
            {children}
        </div>
    )
}

export default RouteTransition
