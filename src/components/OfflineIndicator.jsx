import React, { useState, useEffect } from 'react'
import { WifiOff, Wifi, CloudOff } from 'lucide-react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { getQueueCount } from '../utils/syncQueue'

/**
 * 오프라인 상태 및 동기화 대기 작업 수를 표시하는 컴포넌트
 */
const OfflineIndicator = () => {
  const { isOnline } = useOnlineStatus()
  const [pendingSyncCount, setPendingSyncCount] = useState(0)

  useEffect(() => {
    const updateSyncCount = async () => {
      try {
        const count = await getQueueCount()
        setPendingSyncCount(count)
      } catch (error) {
        console.error('[OfflineIndicator] 동기화 큐 개수 가져오기 실패:', error)
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

  // 온라인이고 동기화 대기 작업이 없으면 표시하지 않음
  if (isOnline && pendingSyncCount === 0) {
    return null
  }

  return (
    <div
      className={`
        fixed top-16 left-0 right-0 z-40 px-4 py-2 md:py-3
        flex items-center justify-center space-x-2
        transition-all duration-300 ease-in-out
        ${isOnline 
          ? 'bg-yellow-50 border-b border-yellow-200 text-yellow-800' 
          : 'bg-red-50 border-b border-red-200 text-red-800'
        }
        shadow-sm
      `}
      style={{ 
        marginTop: '0',
        WebkitTapHighlightColor: 'transparent',
        paddingTop: '0.5rem',
        paddingBottom: '0.5rem'
      }}
    >
      {isOnline ? (
        pendingSyncCount > 0 ? (
          <>
            <CloudOff className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0 animate-pulse" />
            <span className="text-xs md:text-sm font-medium text-center">
              동기화 대기 중인 작업이 <span className="font-bold">{pendingSyncCount}개</span> 있습니다.
            </span>
          </>
        ) : null
      ) : (
        <>
          <WifiOff className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0 animate-pulse" />
          <span className="text-xs md:text-sm font-medium text-center">
            오프라인 상태입니다. 변경 사항은 인터넷 연결 후 자동으로 동기화됩니다.
            {pendingSyncCount > 0 && (
              <span className="ml-1 font-semibold text-red-900">
                (대기 중: {pendingSyncCount}개)
              </span>
            )}
          </span>
        </>
      )}
    </div>
  )
}

export default OfflineIndicator
