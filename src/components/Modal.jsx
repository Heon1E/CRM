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
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 transition-opacity bg-black/60 backdrop-blur-md"
          onClick={onClose}
        ></div>

        {/* Modal */}
        <div
          className={`relative z-50 inline-block align-bottom bg-[#1E1E1E] border border-gray-800 rounded-card text-left overflow-hidden transform transition-all sm:my-8 sm:align-middle ${sizeClasses[size]} w-full`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 md:px-6 md:py-5 border-b border-gray-800">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <button
              onClick={onClose}
              className="text-gray-300 hover:text-white transition-colors p-1 hover:bg-white/5 rounded-button"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-4 py-4 md:px-6 md:py-5 modal-content">{children}</div>
        </div>
      </div>
    </div>
  )
}

export default Modal




