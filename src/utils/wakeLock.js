/**
 * Screen Wake Lock 유틸리티
 * 화면이 자동으로 꺼지지 않도록 방지하는 기능 제공
 */

let wakeLock = null

/**
 * Wake Lock 요청
 * @returns {Promise<boolean>} 성공 여부
 */
export async function requestWakeLock() {
  if (!('wakeLock' in navigator)) {
    console.warn('[WakeLock] 이 브라우저는 Wake Lock API를 지원하지 않습니다.')
    return false
  }

  try {
    wakeLock = await navigator.wakeLock.request('screen')
    console.log('[WakeLock] Wake Lock 활성화됨')
    
    // Wake Lock이 해제되었을 때 (예: 다른 앱이 활성화되거나 배터리 부족)
    wakeLock.addEventListener('release', () => {
      console.log('[WakeLock] Wake Lock이 해제되었습니다.')
    })

    return true
  } catch (error) {
    // 배터리 부족, 권한 거부 등으로 실패해도 녹음은 계속 진행
    console.warn('[WakeLock] Wake Lock 요청 실패 (녹음은 계속 진행):', error.message)
    return false
  }
}

/**
 * Wake Lock 해제
 */
export async function releaseWakeLock() {
  if (!wakeLock) {
    return
  }

  try {
    await wakeLock.release()
    wakeLock = null
    console.log('[WakeLock] Wake Lock 해제됨')
  } catch (error) {
    console.error('[WakeLock] Wake Lock 해제 실패:', error)
    wakeLock = null
  }
}

/**
 * 현재 Wake Lock 상태 확인
 */
export function isWakeLockActive() {
  return wakeLock !== null
}
