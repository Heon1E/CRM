import { useEffect } from 'react'

/**
 * 모바일에서 표가 카드로 접힐 때 붙는 **칸 이름**을 심어 준다.
 *
 * 모바일 규칙(`index.css`)이 `td::before { content: attr(data-label) }`로
 * 이름을 그리는데, 그 값을 어디선가 넣어 줘야 한다.
 *
 * **페이지마다 `data-label`을 손으로 적지 않는다.** 목록 화면이 7개이고
 * 열이 조건부로 늘었다 줄었다 한다. 손으로 적으면 열을 하나 바꿀 때마다
 * 두 군데를 맞춰야 하고, 한쪽을 잊으면 엉뚱한 이름이 붙는다.
 * 대신 `<thead>`를 읽어 같은 자리의 `<td>`에 심는다 — 언제나 머리글과 같다.
 *
 * React가 관리하지 않는 속성이라 다시 그려도 지워지지 않지만, 행이 새로
 * 그려지는 경우가 있어 `MutationObserver`로 따라간다.
 */
export const useTableLabels = () => {
    useEffect(() => {
        const stamp = (table) => {
            const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim())
            if (heads.length === 0) return
            for (const tr of table.querySelectorAll('tbody tr')) {
                const cells = tr.children
                for (let i = 0; i < cells.length; i++) {
                    const td = cells[i]
                    if (td.tagName !== 'TD') continue
                    // colSpan이 걸린 안내 줄('자료가 없습니다')에는 이름을 붙이지 않는다
                    if (td.colSpan > 1) { td.removeAttribute('data-label'); continue }
                    const label = heads[i] || ''
                    // 머리글이 빈 칸은 버튼 자리다. 이름 대신 표시만 해 둔다.
                    if (!label) { td.classList.add('actions'); td.removeAttribute('data-label') }
                    else if (td.getAttribute('data-label') !== label) td.setAttribute('data-label', label)
                }
            }
        }

        const run = () => document.querySelectorAll('table.dgrid').forEach(stamp)

        run()
        const mo = new MutationObserver(() => run())
        mo.observe(document.body, { childList: true, subtree: true })
        return () => mo.disconnect()
    }, [])
}

export default useTableLabels
