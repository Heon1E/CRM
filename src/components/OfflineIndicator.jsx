import React, { useState, useEffect } from 'react'
import { WifiOff, Wifi, CloudOff, CheckCircle2 } from 'lucide-react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { getQueueCount } from '../utils/syncQueue'
import toast from 'react-hot-toast'

/**
 * 오프라인 상태 및 동기화 대기 작업 수를 표시하는 컴포넌트
 * 인터넷 연결/해제 시 명확한 알림 제공
 */
const OfflineIndicator = () => {
  const { isOnline, wasOffline } = useOnlineStatus()
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [showReconnected, setShowReconnected] = useState(false)
  const [wasOnline, setWasOnline] = useState(isOnline)

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

  // 인터넷 연결 상태 변화 감지
  useEffect(() => {
    // 오프라인 → 온라인으로 전환 시
    if (isOnline && !wasOnline && wasOffline) {
      setShowReconnected(true)
      toast.success('연결이 복구되었습니다!', {
        duration: 3000,
        icon: '✅'
      })
      
      // 3초 후 배너 제거
      const timer = setTimeout(() => {
        setShowReconnected(false)
      }, 3000)
      
      return () => clearTimeout(timer)
    }
    
    // 온라인 → 오프라인으로 전환 시
    if (!isOnline && wasOnline) {
      toast.error('현재 오프라인 상태입니다. 작성한 데이터는 연결 시 자동 저장됩니다.', {
        duration: 5000,
        icon: '⚠️'
      })
    }
    
    setWasOnline(isOnline)
  }, [isOnline, wasOnline, wasOffline])

  // 온라인이고 동기화 대기 작업이 없고 재연결 알림이 없으면 표시하지 않음
  if (isOnline && pendingSyncCount === 0 && !showReconnected) {
    return null
  }

  return (
    <div
      className={`
        fixed top-16 left-0 right-0 z-40 px-4 py-2 md:py-3
        flex items-center justify-center space-x-2
        transition-all duration-300 ease-in-out
        bg-white border-b border-slate-200
        ${
          showReconnected
            ? 'text-emerald-600'
            : isOnline
            ? 'text-amber-600'
            : 'text-red-600'
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
      {showReconnected ? (
        <>
          <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
          <span className="text-xs md:text-sm font-medium text-center">
            연결이 복구되었습니다! 데이터 동기화를 시작합니다.
          </span>
        </>
      ) : isOnline ? (
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
            현재 오프라인 상태입니다. 작성한 데이터는 연결 시 자동 저장됩니다.
            {pendingSyncCount > 0 && (
              <span className="ml-1 font-semibold text-red-600">
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



