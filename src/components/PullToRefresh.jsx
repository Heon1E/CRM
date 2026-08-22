import React from 'react'
import { RefreshCw } from 'lucide-react'
import usePullToRefresh from '../hooks/usePullToRefresh'

/**
 * 당겨서 새로고침의 **보이는 부분**. 판정은 `usePullToRefresh`가 한다.
 *
 * 화면 맨 위에 붙어 있다가 당긴 만큼 내려온다. 세 상태를 말로 구분한다 —
 * 손가락을 떼면 아무 일도 안 일어나는데 표시가 같으면 헛수고를 하게 된다.
 *
 *   당기는 중  →  '당겨서 새로고침'
 *   문턱 넘음  →  '놓으면 새로고침'   (아이콘도 뒤집힌다)
 *   실행 중    →  '새로고침 중…'
 *
 * **`transform`만 움직인다.** `height`나 `margin`으로 밀어내면 매 프레임마다
 * 레이아웃을 다시 잡아 옛 폰에서 끊긴다.
 *
 * 데스크톱에서는 터치 이벤트가 없어 아무것도 하지 않는다(항상 거리 0).
 */
const PullToRefresh = ({ onRefresh, children }) => {
    const { distance, refreshing, armed } = usePullToRefresh(onRefresh)
    const active = distance > 0

    return (
        <>
            <div
                aria-hidden={!active}
                style={{
                    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 30,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    height: 44, pointerEvents: 'none',
                    color: 'var(--text-secondary)', fontSize: 12,
                    background: 'var(--bg-card)',
                    transform: `translateY(${active ? distance - 44 : -44}px)`,
                    // 손가락을 따라오는 동안은 즉시, 놓은 뒤에만 부드럽게 돌아간다
                    transition: refreshing || distance === 0 ? 'transform 200ms ease-out' : 'none',
                    opacity: active ? 1 : 0,
                }}
            >
                <RefreshCw
                    size={14}
                    className={refreshing ? 'animate-spin' : ''}
                    style={{
                        transform: refreshing ? undefined : `rotate(${armed ? 180 : 0}deg)`,
                        transition: 'transform 150ms ease-out',
                    }}
                />
                {refreshing ? '새로고침 중…' : armed ? '놓으면 새로고침' : '당겨서 새로고침'}
            </div>
            {children}
        </>
    )
}

export default PullToRefresh
