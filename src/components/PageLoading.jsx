import React from 'react'

/**
 * 화면 조각(chunk)을 받는 동안 보이는 자리.
 *
 * 예전에는 '불러오는 중…' 글자 한 줄만 가운데 띄웠다. 화면이 텅 빈 채로 몇 초가
 * 가는데, 그 상태는 고장과 구별되지 않는다. 들어올 화면의 뼈대(제목 · 카드 줄 ·
 * 목록)를 그려 두면 기다림이 짧게 느껴지고, 실제 화면이 들어올 때 자리가 이미
 * 잡혀 있어 덜 튄다.
 *
 * **어느 화면이 올지는 모른다.** 그래서 어느 화면에나 있는 형태만 그린다 —
 * 특정 화면에 맞추면 다른 화면에서 엉뚱한 모양이 잠깐 스친다.
 *
 * 별도 파일인 이유: `App.jsx`와 모션 확인 화면(`/__motion`)이 함께 쓴다.
 * `App.jsx`에 두면 확인 화면이 App을 다시 import하게 되어 순환이 생긴다.
 */
const PageLoading = () => (
    <div className="p-4 sm:p-6" aria-busy="true" aria-label="불러오는 중">
        <div className="skeleton" style={{ height: 24, width: 180, borderRadius: 4, marginBottom: 16 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 16 }}>
            {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton" style={{ height: 68, borderRadius: 6 }} />
            ))}
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 40, borderRadius: 4, marginBottom: 6 }} />
        ))}
    </div>
)

export default PageLoading
