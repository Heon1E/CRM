import React, { useState, useEffect } from 'react'
import { Download, Smartphone } from 'lucide-react'

/**
 * 앱 설치 가이드 컴포넌트
 * PWA 설치 프롬프트를 표시하는 버튼
 */
const AppInstallGuide = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // 1. 이미 앱으로 실행 중인지 확인 (standalone 모드)
    const checkStandalone = () => {
      // Android: display-mode: standalone
      const isAndroidStandalone = window.matchMedia('(display-mode: standalone)').matches
      
      // iOS: navigator.standalone (Safari만 지원)
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      const isIOSStandalone = isIOS && ('standalone' in window.navigator) && window.navigator.standalone

      if (isAndroidStandalone || isIOSStandalone) {
        setIsInstalled(true)
        return
      }

      // 추가 체크: window.navigator의 standalone 속성
      if (window.navigator.standalone === true) {
        setIsInstalled(true)
      }
    }

    checkStandalone()

    // 2. beforeinstallprompt 이벤트 감지 (Android Chrome 등)
    const handleBeforeInstallPrompt = (e) => {
      // 기본 설치 프롬프트 방지 (나중에 사용자가 버튼을 클릭할 때 사용)
      e.preventDefault()
      setDeferredPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // 3. 앱 설치 완료 이벤트 감지
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  // 설치 버튼 클릭 핸들러
  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Android Chrome 등: beforeinstallprompt 이벤트가 있는 경우
      try {
        deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice
        
        if (outcome === 'accepted') {
          console.log('[AppInstallGuide] 사용자가 앱 설치를 수락했습니다.')
        } else {
          console.log('[AppInstallGuide] 사용자가 앱 설치를 거부했습니다.')
        }
        
        setDeferredPrompt(null)
      } catch (error) {
        console.error('[AppInstallGuide] 설치 프롬프트 표시 실패:', error)
        // 프롬프트 표시 실패 시 수동 안내
        showManualInstallGuide()
      }
    } else {
      // iOS Safari 등: beforeinstallprompt가 지원되지 않는 경우
      showManualInstallGuide()
    }
  }

  // 수동 설치 안내 (iOS 및 미지원 브라우저)
  const showManualInstallGuide = () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isAndroid = /Android/.test(navigator.userAgent)

    if (isIOS) {
      alert('iOS에서 설치하기:\n\n1. 화면 하단의 공유 버튼(↑)을 누르세요\n2. "홈 화면에 추가"를 선택하세요\n3. "추가" 버튼을 눌러 설치를 완료하세요')
    } else if (isAndroid) {
      alert('Android에서 설치하기:\n\n1. 브라우저 메뉴 버튼(⋮)을 누르세요\n2. "앱 설치" 또는 "홈 화면에 추가"를 선택하세요\n3. 확인 버튼을 눌러 설치를 완료하세요')
    } else {
      alert('공유 버튼을 눌러 홈 화면에 추가해주세요.\n\n설치 방법:\n1. 브라우저 메뉴(⋮ 또는 ⋯)를 열어주세요\n2. "앱 설치" 또는 "홈 화면에 추가" 옵션을 찾아주세요\n3. 확인 버튼을 눌러 설치를 완료하세요')
    }
  }

  // 이미 설치된 경우 아무것도 렌더링하지 않음
  if (isInstalled) {
    return null
  }

  // 설치 가능한 상태가 아니면 버튼을 숨김 (선택사항)
  // deferredPrompt가 없고 beforeinstallprompt도 지원하지 않는 경우, 사용자가 요청했으므로 버튼은 항상 표시
  // 하지만 PC에서는 숨기는 것이 좋을 수 있음 (선택사항)

  return (
    <button
      onClick={handleInstallClick}
      className="btn-secondary flex md:hidden items-center space-x-2 px-3 py-2 text-sm font-medium touch-manipulation min-h-[44px]"
      style={{ WebkitTapHighlightColor: 'transparent' }}
      title="앱으로 설치하기"
    >
      <Download className="w-4 h-4" />
      <span>앱 설치</span>
    </button>
  )
}

export default AppInstallGuide



