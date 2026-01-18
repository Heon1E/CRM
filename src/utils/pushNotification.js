/**
 * 푸시 알림 유틸리티 함수
 * Web Push API를 활용한 푸시 알림 기능
 */

/**
 * 푸시 알림 권한 요청
 * @returns {Promise<NotificationPermission>} 권한 상태 ('granted', 'denied', 'default')
 */
export const requestNotificationPermission = async () => {
  // 브라우저 지원 여부 확인
  if (!('Notification' in window)) {
    console.warn('이 브라우저는 알림을 지원하지 않습니다.')
    return 'denied'
  }

  // 이미 권한이 있으면 반환
  if (Notification.permission === 'granted') {
    return 'granted'
  }

  // 권한 요청
  if (Notification.permission !== 'denied') {
    try {
      const permission = await Notification.requestPermission()
      return permission
    } catch (error) {
      console.error('알림 권한 요청 실패:', error)
      return 'denied'
    }
  }

  return Notification.permission
}

/**
 * 로컬 알림 표시 (백업 완료 등 즉시 알림)
 * @param {string} title - 알림 제목
 * @param {Object} options - 알림 옵션 (body, icon, tag 등)
 */
export const showLocalNotification = async (title, options = {}) => {
  // 권한 확인
  const permission = await requestNotificationPermission()
  
  if (permission !== 'granted') {
    console.warn('알림 권한이 없어 알림을 표시할 수 없습니다.')
    return false
  }

  // 서비스 워커가 활성화되어 있으면 서비스 워커를 통해 알림 표시
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    try {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_NOTIFICATION',
        title,
        options: {
          body: options.body || '',
          icon: options.icon || '/vite.svg',
          badge: options.badge || '/vite.svg',
          tag: options.tag || 'default',
          requireInteraction: options.requireInteraction || false,
          vibrate: options.vibrate || [200, 100, 200],
          data: options.data || {},
          actions: options.actions || [
            {
              action: 'open',
              title: '열기',
              icon: '/vite.svg'
            }
          ]
        }
      })
      return true
    } catch (error) {
      console.error('서비스 워커를 통한 알림 표시 실패:', error)
      // 폴백: 직접 알림 표시
      return showDirectNotification(title, options)
    }
  } else {
    // 서비스 워커가 없으면 직접 알림 표시
    return showDirectNotification(title, options)
  }
}

/**
 * 직접 알림 표시 (서비스 워커 없이)
 * @param {string} title - 알림 제목
 * @param {Object} options - 알림 옵션
 */
const showDirectNotification = (title, options = {}) => {
  try {
    const notification = new Notification(title, {
      body: options.body || '',
      icon: options.icon || '/vite.svg',
      badge: options.badge || '/vite.svg',
      tag: options.tag || 'default',
      requireInteraction: options.requireInteraction || false,
      vibrate: options.vibrate || [200, 100, 200],
      data: options.data || {}
    })

    // 알림 클릭 이벤트
    notification.onclick = (event) => {
      event.preventDefault()
      window.focus()
      notification.close()
    }

    // 자동 닫기 (5초 후)
    if (!options.requireInteraction) {
      setTimeout(() => {
        notification.close()
      }, 5000)
    }

    return true
  } catch (error) {
    console.error('알림 표시 실패:', error)
    return false
  }
}

/**
 * 푸시 구독 설정 (서버 기반 푸시 알림용)
 * @param {string} vapidPublicKey - VAPID 공개 키
 * @returns {Promise<PushSubscription|null>} 푸시 구독 객체 또는 null
 */
export const subscribeToPush = async (vapidPublicKey) => {
  // Service Worker 등록 확인
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker를 지원하지 않는 브라우저입니다.')
    return null
  }

  // Push Manager 지원 확인
  if (!('PushManager' in window)) {
    console.warn('Push API를 지원하지 않는 브라우저입니다.')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.ready

    // 기존 구독 확인
    let subscription = await registration.pushManager.getSubscription()

    // 구독이 없으면 새로 구독
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      })
    }

    return subscription
  } catch (error) {
    console.error('푸시 구독 실패:', error)
    return null
  }
}

/**
 * 푸시 구독 해제
 */
export const unsubscribeFromPush = async () => {
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    
    if (subscription) {
      await subscription.unsubscribe()
      return true
    }
    
    return false
  } catch (error) {
    console.error('푸시 구독 해제 실패:', error)
    return false
  }
}

/**
 * VAPID 공개 키를 Uint8Array로 변환
 * @param {string} base64String - Base64 인코딩된 공개 키
 * @returns {Uint8Array}
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * 현재 푸시 구독 상태 확인
 * @returns {Promise<boolean>} 구독 여부
 */
export const isPushSubscribed = async () => {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return false
    }

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return subscription !== null
  } catch (error) {
    console.error('푸시 구독 상태 확인 실패:', error)
    return false
  }
}

