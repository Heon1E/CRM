import React from 'react'
import { X } from 'lucide-react'

/**
 * @param {boolean} docked - true면 화면 가운데 뜨는 창이 아니라, 놓인 자리에
 *   그대로 붙는 편집 영역으로 그린다. 목록을 가리지 않고 어느 행을 고치는 중인지
 *   계속 보이므로, 매출처럼 목록↔수정을 반복하는 화면에서 쓴다.
 */
const Modal = ({ isOpen, onClose, title, children, size = 'md', docked = false, meta = null }) => {
  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
  }

  if (docked) {
    return (
      <div className="editor">
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-4 text-center">
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={onClose}
        ></div>

        {/* Modal Window */}
        <div
          className={`relative z-50 inline-block bg-white text-left overflow-hidden transform shadow-xl border border-oem-border rounded-sm ${sizeClasses[size]} w-full`}
        >
          {/* Header / Title Bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-oem-bg-header border-b border-oem-border">
            <h3 className="text-sm font-bold text-oem-text-primary uppercase tracking-tight">{title}</h3>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content Area */}
          <div className="px-6 py-6 modal-content bg-white">{children}</div>
        </div>
      </div>
    </div>
  )
}

export default Modal




