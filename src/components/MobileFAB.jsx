import React from 'react'
import VoiceControl from './VoiceControl'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const MobileFAB = () => {
  const navigate = useNavigate()

  return (
    <div className="fixed bottom-20 right-4 flex flex-col gap-3 md:hidden z-50">
      {/* 음성 제어 버튼 (플로팅) */}
      <div className="shadow-lg rounded-full">
        <VoiceControl />
      </div>
      
      {/* 일정 추가 버튼 */}
      <button 
        onClick={() => navigate('/activities')}
        className="p-3 bg-brand-blue text-white rounded-full shadow-lg hover:bg-blue-600 transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
        style={{ WebkitTapHighlightColor: 'transparent' }}
        aria-label="일정 추가"
      >
        <Plus className="w-5 h-5" />
      </button>
    </div>
  )
}

export default MobileFAB
