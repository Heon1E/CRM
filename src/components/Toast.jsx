import React, { useEffect } from 'react'
import { CheckCircle2, X } from 'lucide-react'

const Toast = ({ message, onClose, duration = 3000 }) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  return (
    <div className="fixed top-20 right-4 z-50 animate-slide-in">
      <div className="bg-white rounded-lg shadow-lg border border-border-light p-4 flex items-center space-x-3 min-w-[300px]">
        <CheckCircle2 className="w-5 h-5 text-brand-green flex-shrink-0" />
        <p className="text-sm text-text-body flex-1">{message}</p>
        <button
          onClick={onClose}
          className="text-text-secondary hover:text-text-body transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default Toast
