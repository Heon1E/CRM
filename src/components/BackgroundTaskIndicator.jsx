import React from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { useBackgroundTask } from '../contexts/BackgroundTaskContext'

/**
 * 백그라운드 작업 진행 인디케이터
 * 화면 상단에 표시되는 작은 배너
 */
const BackgroundTaskIndicator = () => {
  const { activeTasks, hasActiveTasks } = useBackgroundTask()

  if (!hasActiveTasks || activeTasks.length === 0) {
    return null
  }

  // 가장 최근 작업 표시
  const currentTask = activeTasks[activeTasks.length - 1]

  return (
    <div
      className="fixed top-16 left-0 right-0 z-40 bg-white border-b border-slate-200 px-4 py-2 md:py-2.5"
      style={{
        marginTop: '0',
        WebkitTapHighlightColor: 'transparent'
      }}
    >
      <div className="flex items-center justify-center space-x-2 max-w-7xl mx-auto">
        <Loader2 className="w-4 h-4 md:w-5 md:h-5 text-oem-blue animate-spin flex-shrink-0" />
        <span className="text-xs md:text-sm font-medium text-slate-800 text-center">
          AI 분석 중... ({activeTasks.length}개 작업)
        </span>
        <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-slate-500 flex-shrink-0 animate-pulse" />
      </div>
    </div>
  )
}

export default BackgroundTaskIndicator



