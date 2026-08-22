import React, { useState, useEffect } from 'react'
import { Bell, X } from 'lucide-react'
import { requestNotificationPermission, isPushSubscribed } from '../utils/pushNotification'

/**
 * 푸시 알림 권한 요청 배너 컴포넌트
 * 사용자가 알림 권한을 허용하지 않았을 때 표시
 */
const NotificationPermissionPrompt = () => {
  const [showPrompt, setShowPrompt] = useState(false)
  const [permission, setPermission] = useState('default')

  useEffect(() => {
    const checkPermission = async () => {
      // 브라우저 지원 여부 확인
      if (!('Notification' in window)) {
        setShowPrompt(false)
        return
      }

      // 권한 상태 확인
      const currentPermission = Notification.permission
      setPermission(currentPermission)

      // 권한이 없거나 거부된 경우에만 배너 표시
      // 단, 최근에 거부한 경우(24시간 이내)는 표시하지 않음
      if (currentPermission === 'default') {
        const dismissedTime = localStorage.getItem('notificationPromptDismissed')
        if (dismissedTime) {
          const timeDiff = Date.now() - parseInt(dismissedTime)
          const oneDay = 24 * 60 * 60 * 1000
          
          // 24시간이 지나지 않았으면 표시하지 않음
          if (timeDiff < oneDay) {
            setShowPrompt(false)
            return
          }
        }
        setShowPrompt(true)
      } else {
        setShowPrompt(false)
      }
    }

    checkPermission()
  }, [])

  // 권한 요청 핸들러
  const handleRequestPermission = async () => {
    try {
      const newPermission = await requestNotificationPermission()
      setPermission(newPermission)
      
      if (newPermission === 'granted') {
        setShowPrompt(false)
        // 테스트 알림 표시
        try {
          const { showLocalNotification } = await import('../utils/pushNotification')
          await showLocalNotification('알림 권한 허용됨', {
            body: '아이앤디 CRM 알림을 받을 준비가 되었습니다.',
            icon: '/vite.svg',
            tag: 'permission-granted',
            requireInteraction: false,
            vibrate: [200, 100, 200]
          })
        } catch (error) {
          console.error('테스트 알림 표시 실패:', error)
        }
      } else if (newPermission === 'denied') {
        // 거부된 경우 24시간 동안 다시 표시하지 않음
        localStorage.setItem('notificationPromptDismissed', Date.now().toString())
        setShowPrompt(false)
      }
    } catch (error) {
      console.error('알림 권한 요청 실패:', error)
    }
  }

  // 배너 닫기 핸들러
  const handleDismiss = () => {
    localStorage.setItem('notificationPromptDismissed', Date.now().toString())
    setShowPrompt(false)
  }

  if (!showPrompt || permission !== 'default') {
    return null
  }

  return (
    <div
      className="fixed top-16 left-0 right-0 z-40 bg-white border-b border-slate-200 px-4 py-3 md:py-4"
      style={{
        marginTop: '0',
        WebkitTapHighlightColor: 'transparent'
      }}
    >
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center space-x-3 flex-1">
          <Bell className="w-5 h-5 md:w-6 md:h-6 text-oem-blue flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm md:text-base font-medium text-slate-800">
              푸시 알림을 활성화하여 백업 완료 등의 중요 알림을 받아보세요.
            </p>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
              브라우저 알림 권한이 필요합니다.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 ml-4">
          <button
            onClick={handleRequestPermission}
            className="px-4 py-2 bg-oem-blue text-white rounded-lg hover:bg-oem-blue-dark transition-colors font-medium text-sm md:text-base touch-manipulation min-h-[44px]"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            허용하기
          </button>
          <button
            onClick={handleDismiss}
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
            style={{ WebkitTapHighlightColor: 'transparent' }}
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default NotificationPermissionPrompt



