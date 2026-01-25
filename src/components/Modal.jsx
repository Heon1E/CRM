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




