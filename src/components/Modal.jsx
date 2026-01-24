import React from 'react'
import { X } from 'lucide-react'

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
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
          className={`relative z-50 inline-block oracle-raised text-left overflow-hidden transform shadow-none ${sizeClasses[size]} w-full`}
        >
          {/* Header / Title Bar */}
          <div className="oracle-title-bar h-7 mb-0">
            <h3 className="text-[11px] font-bold text-white px-2 tracking-tight">{title}</h3>
            <div className="flex gap-1 pr-1">
              <button
                onClick={onClose}
                className="w-5 h-4 flex items-center justify-center bg-gray-300 border border-white font-bold text-[10px] text-black"
                title="Close"
              >
                ×
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="px-4 py-4 modal-content bg-[#c0c0c0]">{children}</div>
        </div>
      </div>
    </div>
  )
}

export default Modal




