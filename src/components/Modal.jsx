import React, { useEffect } from 'react'
import { X } from 'lucide-react'

/**
 * 공용 창(모달)
 *
 * **모바일에서는 아래에서 올라오는 시트로 그린다.**
 * 화면 한가운데 툭 나타나면 어디서 왔는지 알 수 없고, 닫기 단추가 손가락에서
 * 가장 먼 위쪽 끝에 놓인다. 아래에서 올라오면 출처가 분명하고, 엄지가 닿는
 * 자리에 그대로 있다. 데스크톱은 지금처럼 가운데에 띄운다 — 마우스는 어디든
 * 같은 거리다.
 *
 * 등장 애니메이션은 `tailwindcss-animate`가 만든다. 예전에는 이 파일에
 * 애니메이션이 아예 없어서 창이 툭 나타났다 툭 사라졌다.
 * '동작 줄이기'를 켠 사람에게는 `index.css`가 전역으로 꺼 준다.
 *
 * @param {boolean} docked - true면 화면 가운데 뜨는 창이 아니라, 놓인 자리에
 *   그대로 붙는 편집 영역으로 그린다. 목록을 가리지 않고 어느 행을 고치는 중인지
 *   계속 보이므로, 매출처럼 목록↔수정을 반복하는 화면에서 쓴다.
 */
const Modal = ({ isOpen, onClose, title, children, size = 'md', docked = false, meta = null }) => {
    /*
     * Esc로 닫는다. 예전에는 닫기 단추에 '(Esc)'라고 적어 두고 정작 키를 받는
     * 곳이 없었다 — 적혀 있는데 안 되면 고장으로 읽힌다.
     * 창이 열려 있는 동안 뒤쪽 화면이 스크롤되는 것도 막는다(모바일에서 시트를
     * 밀면 뒤 목록이 따라 움직여 어지럽다).
     */
    useEffect(() => {
        if (!isOpen || docked) return
        const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('keydown', onKey)
            document.body.style.overflow = prev
        }
    }, [isOpen, docked, onClose])

    if (!isOpen) return null

    const sizeClasses = {
        sm: 'max-w-md',
        md: 'max-w-2xl',
        lg: 'max-w-4xl',
        xl: 'max-w-6xl',
    }

    if (docked) {
        return (
            <div className="editor animate-in fade-in duration-150">
                <div className="editor-head">
                    <span>{title}</span>
                    <span className="flex items-center gap-3">
                        {meta && <span className="rec">{meta}</span>}
                        <button onClick={onClose} className="icon-btn" title="닫기 (Esc)" aria-label="닫기">
                            <X className="w-4 h-4" />
                        </button>
                    </span>
                </div>
                <div>{children}</div>
            </div>
        )
    }

    /*
     * 바깥 스크롤은 데스크톱에서만 켠다. 모바일에서 켜 두면 스크롤바 자리
     * 10px 때문에 시트가 화면 오른쪽 끝에 닿지 못하고 틈이 생긴다(실측함).
     * 모바일은 시트 안쪽(`overflow-y-auto`)만 스크롤하면 충분하다.
     */
    return (
        <div className="fixed inset-0 z-50 overflow-hidden sm:overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
            {/* 모바일은 아래(items-end), 데스크톱은 가운데(sm:items-center) */}
            <div className="flex items-end sm:items-center justify-center min-h-screen px-0 sm:px-4 py-0 sm:py-4 text-center">

                <div
                    className="fixed inset-0 z-40 bg-black/40 animate-in fade-in duration-200"
                    onClick={onClose}
                ></div>

                <div
                    className={`relative z-50 inline-block bg-white text-left overflow-hidden transform shadow-xl
                        border border-oem-border w-full ${sizeClasses[size]}
                        rounded-t-2xl sm:rounded-sm max-h-[88vh] flex flex-col
                        animate-in duration-200 slide-in-from-bottom-6 sm:slide-in-from-bottom-0 sm:zoom-in-95`}
                >
                    {/* 모바일에서 '아래로 내려 닫는 것'임을 알려주는 손잡이 */}
                    <div className="sm:hidden pt-2 pb-1 flex justify-center shrink-0" onClick={onClose}>
                        <span className="block w-10 h-1 rounded-full bg-gray-300" />
                    </div>

                    <div className="flex items-center justify-between px-4 py-3 bg-oem-bg-header border-b border-oem-border shrink-0">
                        <h3 className="text-sm font-bold text-oem-text-primary tracking-tight">{title}</h3>
                        <button
                            onClick={onClose}
                            className="p-1 text-gray-500 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            title="닫기 (Esc)"
                            aria-label="닫기"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* 모바일에서 내용이 길면 시트 안에서만 스크롤된다 */}
                    <div className="px-4 sm:px-6 py-5 sm:py-6 modal-content bg-white overflow-y-auto">{children}</div>
                </div>
            </div>
        </div>
    )
}

export default Modal
