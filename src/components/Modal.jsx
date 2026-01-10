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
          className="fixed inset-0 z-40 transition-opacity bg-gray-900 bg-opacity-50"
          onClick={onClose}
        ></div>

        {/* Modal */}
        <div
          className={`relative z-50 inline-block align-bottom bg-white rounded-card text-left overflow-hidden shadow-modal transform transition-all sm:my-8 sm:align-middle ${sizeClasses[size]} w-full`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-border-light">
            <h3 className="text-lg font-bold text-text-primary">{title}</h3>
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-text-body transition-colors p-1 hover:bg-gray-50 rounded-button"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-5 modal-content">{children}</div>
        </div>
      </div>
    </div>
  )
}

export default Modal

