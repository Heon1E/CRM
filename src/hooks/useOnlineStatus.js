import { useState, useEffect } from 'react'

/**
 * 온라인/오프라인 상태를 감지하는 커스텀 훅
 * 
 * @returns {Object} { isOnline: boolean, wasOffline: boolean }
 */
export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      // 오프라인에서 온라인으로 전환되었음을 알림
      if (wasOffline) {
        window.dispatchEvent(new CustomEvent('onlineStatusChanged', { 
          detail: { isOnline: true, wasOffline: true } 
        }))
        setWasOffline(false)
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
      setWasOffline(true)
      window.dispatchEvent(new CustomEvent('onlineStatusChanged', { 
        detail: { isOnline: false, wasOffline: false } 
      }))
    }

    // 이벤트 리스너 등록
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // 컴포넌트 언마운트 시 정리
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [wasOffline])

  return { isOnline, wasOffline }
}
