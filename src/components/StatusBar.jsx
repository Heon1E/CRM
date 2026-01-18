import React, { useState, useEffect } from 'react'
import { Loader2, CheckCircle2, AlertCircle, CloudUpload } from 'lucide-react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useBackgroundTask } from '../contexts/BackgroundTaskContext'
import { getQueueCount } from '../utils/syncQueue'

/**
 * 하단 상태 표시줄 컴포넌트
 * 데이터 전송 작업 상태 및 동기화 진행 상황을 표시
 */
const StatusBar = () => {
  const { isOnline } = useOnlineStatus()
  const { activeTasks } = useBackgroundTask()
  const [pendingSyncCount, setPendingSyncCount] = useState(0)

  useEffect(() => {
    const updateSyncCount = async () => {
      try {
        const count = await getQueueCount()
        setPendingSyncCount(count)
      } catch (error) {
        console.error('[StatusBar] 동기화 큐 개수 가져오기 실패:', error)
      }
    }

    updateSyncCount()
    
    // 큐 업데이트 이벤트 리스너
    const handleSyncQueueUpdated = () => {
      updateSyncCount()
    }
    
    window.addEventListener('syncQueueUpdated', handleSyncQueueUpdated)

    return () => {
      window.removeEventListener('syncQueueUpdated', handleSyncQueueUpdated)
    }
  }, [])

  // 상태가 없으면 표시하지 않음 (모바일에서만 표시)
  // 명함 분석 관련 activeTasks는 상단 BackgroundTaskIndicator에서만 표시하므로 제외
  const hasStatus = pendingSyncCount > 0 || !isOnline
  
  if (!hasStatus) {
    return null
  }

  return (
    <div
      className={`
        fixed bottom-16 left-0 right-0 z-40
        md:hidden
        px-3 py-2
        flex items-center justify-between
        transition-all duration-300 ease-in-out
        ${
          !isOnline
            ? 'bg-red-400/10 border-t border-red-400/30 text-red-300'
            : pendingSyncCount > 0
            ? 'bg-amber-400/10 border-t border-amber-400/30 text-amber-300'
            : 'bg-[#1E1E1E] border-t border-gray-800 text-gray-300'
        }
        shadow-soft
      `}
      style={{
        WebkitTapHighlightColor: 'transparent',
        minHeight: '40px'
      }}
    >
      {/* 왼쪽: 상태 아이콘 및 메시지 */}
      <div className="flex items-center space-x-2 flex-1 min-w-0">
        {!isOnline ? (
          <>
            <AlertCircle className="w-4 h-4 flex-shrink-0 animate-pulse" />
            <span className="text-xs font-medium truncate">
              오프라인
            </span>
          </>
        ) : pendingSyncCount > 0 ? (
          <>
            <CloudUpload className="w-4 h-4 flex-shrink-0 animate-pulse" />
            <span className="text-xs font-medium truncate">
              동기화 대기: {pendingSyncCount}개
            </span>
          </>
        ) : null}
      </div>

      {/* 오른쪽: 상세 정보 (있을 경우) */}
      {pendingSyncCount > 0 && isOnline && (
        <div className="flex items-center space-x-1 flex-shrink-0">
          <CheckCircle2 className="w-3 h-3 text-amber-200" />
        </div>
      )}
    </div>
  )
}

export default StatusBar



