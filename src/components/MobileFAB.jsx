import React from 'react'
import VoiceControl from './VoiceControl'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

/**
 * 모바일 플로팅 액션 버튼 (FAB)
 * 우측 하단에 고정되어 음성 제어 및 일정 추가 기능 제공
 */
const MobileFAB = () => {
  const navigate = useNavigate()

  const handleAddActivity = () => {
    navigate('/activities')
  }

  return (
    <div 
      className="fixed bottom-20 right-4 flex flex-col gap-3 md:hidden z-50"
      style={{ 
        zIndex: 50, // 다른 요소 위에 떠 있도록 높은 z-index
        bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' // 하단 탭바 위쪽에 배치
      }}
    >
      {/* 음성 제어 버튼 (플로팅) */}
      <div className="shadow-lg rounded-full">
        <VoiceControl />
      </div>
      
      {/* 일정 추가 버튼 */}
      <button 
        onClick={handleAddActivity}
        className="p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
        style={{ WebkitTapHighlightColor: 'transparent' }}
        aria-label="일정 추가"
        title="일정 추가"
      >
        <Plus className="w-5 h-5" />
      </button>
    </div>
  )
}

export default MobileFAB
