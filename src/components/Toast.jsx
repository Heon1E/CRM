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
    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 animate-slide-in">
      <div className="bg-white rounded-lg border border-slate-200 shadow-xl p-4 flex items-center space-x-3 min-w-[320px]">
        <CheckCircle2 className="w-5 h-5 text-indigo-600 flex-shrink-0" />
        <p className="text-sm text-slate-800 flex-1 font-medium">{message}</p>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default Toast
